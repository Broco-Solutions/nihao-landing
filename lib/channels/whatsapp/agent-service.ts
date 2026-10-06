import { backoff, controlError, envPositive, failure, operationContext, requireTime, safeDeadline } from "./operational-runtime.ts";
import { ingestBurst } from "./multimodal-ingestion.ts";
import { nextIngestionQuestion, updateGraphSummary } from "./evidence-grouping.ts";
import { renderReceipts } from "./agent-tools.ts";
import { agentState } from "./agent-contract.ts";
import type { BurstEnvelope, BurstReading, BurstMessage, BurstStore } from "./burst-types.ts";
import { AgentCheckpoint, AgentSuperseded, type AgentDomain, type AgentState } from "./agent-contract.ts";
import type { WhatsAppAgentOrchestrator } from "./agent-orchestrator.ts";

export class WhatsAppAgentService {
  constructor(private readonly deps: { assetConcurrency?: number; ingestion?: boolean; store: BurstStore; orchestrator: WhatsAppAgentOrchestrator; domain: AgentDomain; save(snapshotId: string, revision: number, leaseId: string | null, state: AgentState): Promise<boolean>; reader: { read(message: BurstMessage, save: (reading: BurstReading) => Promise<void>): Promise<BurstReading> }; send(phone: string, text: string, context?: import("./supplier-picker.ts").ReplyContext): Promise<void> }) {}
  receive(envelope: BurstEnvelope) { return this.deps.store.receive(envelope); }
  async processDue(limit = 10, deadline = safeDeadline()) {
    return operationContext.run({ deadline }, () => this.processWindow(limit, deadline));
  }
  private async processWindow(limit: number, deadline: number) {
    const d = this.deps;
    for (let index = 0; index < limit && Date.now() < deadline; index++) {
      const [snapshot] = await d.store.claim(1); if (!snapshot) break;
      console.info("WhatsApp worker run", { batchId: snapshot.id, worker_runs_per_batch: 1, worker_crash_recoveries: Number(Boolean(snapshot.recoveredLease)) });
      try {
        requireTime(30_000, deadline);
        const catalog = await d.store.catalog(snapshot.userId);
        if (!catalog.trips.length) throw new Error("Contexto autorizado revocado");
        const save = async (state: AgentState) => {
          snapshot.state = state;
          if (!(await d.save(snapshot.id, snapshot.revision, snapshot.leaseId, state))) throw new AgentSuperseded();
        };
        if (d.ingestion) await ingestBurst(snapshot, d.reader, (id, reading) => d.store.saveReading(id, reading, snapshot), deadline, { concurrency: d.assetConcurrency });
        else await ingestBurst(snapshot, d.reader, (id, reading) => d.store.saveReading(id, reading, snapshot), deadline, { concurrency: d.assetConcurrency, group: false });
        await save(agentState(snapshot.state));
        let state = agentState(snapshot.state); let text = ""; let remainderText = "";
        const graph = state.ingestion;
        const ready = graph?.loads.filter((load) => !["PROCESSED", "FAILED", "NEEDS_REVIEW"].includes(load.status)) ?? [];
        // Each logical card has its own bounded loop and durable operations; the worker
        // checkpoints between cards. No transaction or model-round budget spans the batch.
        const cardBatch = Boolean(graph && ready.some((load) => load.type === "SUPPLIER"));
        if (cardBatch && graph) {
          for (const load of ready.filter((load) => load.type === "SUPPLIER")) {
            requireTime(30_000, deadline);
            if ((load.operational?.nextAttemptAt ?? 0) > Date.now()) continue;
            try {
              graph.activeLoadId = load.id;
              state.agent.pending = load.question ?? null; state.question = load.questionText ?? null;
              await save(state);
              const result = await d.orchestrator.run(snapshot, catalog, save, deadline);
              state = result.state; text = result.text;
              load.execution = { rounds: state.agent.rounds, terminationReason: state.agent.termination?.reason, revision: snapshot.revision };
              if (load.status !== "PROCESSED" && load.status !== "FAILED") {
                load.status = "NEEDS_REVIEW"; load.question = state.agent.pending ?? undefined; load.questionText = state.question;
                load.error = { type: state.agent.termination?.reason ?? "UNPROCESSED_LOGICAL_LOAD", retryable: state.agent.termination?.reason === "max_rounds", stage: "business" };
              }
              await save(state);
            } catch (error) {
              if (controlError(error)) throw error;
              const f = failure(error);
              const failures = (load.operational?.failures ?? 0) + Number(f.type !== "PROVIDER_CIRCUIT_OPEN");
              const retry = f.retryable && failures < envPositive("WHATSAPP_ASSET_MAX_FAILURES", 5);
              load.status = retry ? "PENDING_RETRY" : "NEEDS_REVIEW";
              load.error = { type: f.retryable && !retry ? "PROVIDER_UNAVAILABLE_AFTER_RETRIES" : f.type, retryable: f.retryable, stage: "business" };
              load.operational = { failures, nextAttemptAt: Date.now() + backoff(failures, f.retryAfterMs) };
              await save(state);
            }
          }
          if (graph.loads.some((load) => load.status === "PENDING_RETRY")) throw new AgentCheckpoint();
          graph.activeLoadId = undefined;
          updateGraphSummary(graph);
          const pendingLoad = graph.loads.find((load) => load.question);
          const ingestionQuestion = nextIngestionQuestion(snapshot);
          state.agent.pending = pendingLoad?.question ?? (ingestionQuestion ? { type: "CLARIFICATION", text: ingestionQuestion.question, options: ingestionQuestion.options, revision: snapshot.revision, associationSource: ingestionQuestion.associationSource } : null);
          state.question = pendingLoad?.questionText ?? (ingestionQuestion ? [ingestionQuestion.question, ingestionQuestion.options.map((option, i) => `${i + 1}. ${option.label}`).join("\n")].filter(Boolean).join("\n") : null);
          if (ready.some((load) => load.type !== "SUPPLIER")) {
            // Valid non-card loads continue after the cards, using their real receipts.
            state.agent.terminal = undefined; state.agent.historyRevision = -1;
            await save(state);
            const remainder = await d.orchestrator.run(snapshot, catalog, save, deadline);
            state = remainder.state; text = remainder.text; remainderText = remainder.text;
          }
          state.agent.scopeId = undefined;
          state.agent.terminal = { revision: snapshot.revision, response: "" };
          state.agent.termination = { reason: state.question ? "asked_clarification" : "completed", revision: snapshot.revision, rounds: state.agent.rounds };
        } else if (graph && ready.length === 0 && graph.loads.some((load) => load.error?.type === "PROVIDER_UNAVAILABLE_AFTER_RETRIES")) {
          state.question = "El proveedor externo siguió fallando después de los reintentos. Las evidencias originales siguen guardadas. Respondé reintentar para continuar o revisá la carga en Nihao.";
          state.agent.pending = { type: "CLARIFICATION", text: state.question, options: [], revision: snapshot.revision };
          text = [renderReceipts(state.agent.receipts, snapshot.revision), state.question].filter(Boolean).join("\n\n");
        } else {
          if (ready.some((load) => (load.operational?.nextAttemptAt ?? 0) > Date.now())) throw new AgentCheckpoint();
          const result = await d.orchestrator.run(snapshot, catalog, save, deadline);
          state = result.state; text = result.text;
        }
        if (state.ingestion) {
          updateGraphSummary(state.ingestion);
          const summary = state.ingestion.summary;
          const batchSummary = `Ráfaga: ${summary.totalAssets} evidencias, ${summary.totalLogicalLoads} cargas; ${summary.processed} procesadas, ${summary.pending} pendientes, ${summary.needsReview} para revisar y ${summary.failed} fallidas.`;
          text = [batchSummary, cardBatch ? remainderText || renderReceipts(state.agent.receipts, snapshot.revision) : text, cardBatch && !remainderText ? state.question : null].filter(Boolean).join("\n\n");
          for (const message of snapshot.messages) {
            const asset = state.ingestion.assets.find((asset) => asset.id === message.id);
            if (asset && message.reading?.ingestion) { message.reading.ingestion.status = asset.status; message.reading.ingestion.loadIds = asset.loadIds; message.reading.ingestion.error = asset.error; await d.store.saveReading(message.id, message.reading, snapshot); }
          }
          await save(state);
        }
        requireTime(0, deadline);
        await d.store.finish(snapshot, state, text);
        this.metrics(snapshot);
        if (state.agent.pending?.proposalId) await d.domain.displayed(snapshot, state.agent.pending.proposalId);
        console.info("WhatsApp agent processed", { batchStatus: state.ingestion?.summary.needsReview ? state.ingestion.summary.processed ? "PARTIAL" : "NEEDS_REVIEW" : state.ingestion?.summary.failed ? state.ingestion.summary.processed ? "PARTIAL" : "FAILED" : state.ingestion?.summary.pending ? "PARTIAL" : "COMPLETED", burstId: snapshot.id, revision: snapshot.revision, rounds: state.agent.rounds, operationCount: state.agent.receipts.length, pending: Boolean(state.question), terminationReason: state.agent.termination?.reason, ingestionSummary: state.ingestion?.summary });
      } catch (error) {
        let infrastructureContinuation = false;
        const state = agentState(snapshot.state);
        if (!controlError(error) && state.ingestion && state.agent.termination?.reason === "model_error") {
          const f = failure(error);
          for (const load of state.ingestion.loads.filter((load) => !["PROCESSED", "FAILED", "NEEDS_REVIEW"].includes(load.status))) {
            const failures = (load.operational?.failures ?? 0) + Number(f.type !== "PROVIDER_CIRCUIT_OPEN");
            const retry = f.retryable && failures < envPositive("WHATSAPP_ASSET_MAX_FAILURES", 5);
            load.status = retry ? "PENDING_RETRY" : "NEEDS_REVIEW";
            load.error = { type: f.retryable && !retry ? "PROVIDER_UNAVAILABLE_AFTER_RETRIES" : f.type, retryable: f.retryable, stage: "business" };
            load.operational = { failures, nextAttemptAt: Date.now() + backoff(failures, f.retryAfterMs) };
          }
          infrastructureContinuation = true;
          await d.save(snapshot.id, snapshot.revision, snapshot.leaseId, state);
        }
        this.metrics(snapshot);
        if (error instanceof AgentCheckpoint) console.info("WhatsApp worker continuation", { batchId: snapshot.id, status: "PROCESSING_CONTINUES", worker_deadline_exits: Number(Date.now() + 30_000 >= deadline) });
        await d.store.retry(snapshot, infrastructureContinuation || error instanceof AgentCheckpoint || error instanceof AgentSuperseded);
        console.error("WhatsApp agent retry", { burstId: snapshot.id, revision: snapshot.revision, terminationReason: (snapshot.state as AgentState).agent?.termination?.reason, error: error instanceof Error ? error.constructor.name : "UnknownError", ...(error instanceof Error && /^(?:Mistral|OpenAI) respondió HTTP \d{3}$/u.test(error.message) ? { providerStatus: Number(error.message.slice(-3)) } : {}) });
        if (error instanceof AgentCheckpoint) break;
      }
    }
    if (Date.now() < deadline) await d.store.flushReplies(d.send);
  }
  private metrics(snapshot: import("./burst-types.ts").BurstSnapshot) {
    if (snapshot.state.ingestion) updateGraphSummary(snapshot.state.ingestion);
    const statuses = snapshot.messages.map((m) => snapshot.state.ingestion?.assets.find((asset) => asset.id === m.id)?.status ?? m.reading?.ingestion?.status);
    const durations = snapshot.messages.flatMap((m) => m.reading?.ingestion?.operational?.durationMs === undefined ? [] : [m.reading.ingestion.operational.durationMs]).sort((a, b) => a - b);
    console.info("WhatsApp batch metrics", { batchId: snapshot.id, batch_assets_total: statuses.length, batch_assets_completed: statuses.filter((s) => s === "PROCESSED").length, batch_assets_pending: statuses.filter((s) => !s || !["PROCESSED", "FAILED", "NEEDS_REVIEW"].includes(s)).length, batch_assets_failed: statuses.filter((s) => s === "FAILED").length, batch_assets_needs_review: statuses.filter((s) => s === "NEEDS_REVIEW").length, batch_duration_total: snapshot.createdAt ? Date.now() - new Date(snapshot.createdAt).getTime() : undefined, asset_duration_p50: durations[Math.max(0, Math.ceil(durations.length * 0.5) - 1)], asset_duration_p95: durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)] });
  }

}
