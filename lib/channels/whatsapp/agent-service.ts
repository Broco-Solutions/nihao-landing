import { ingestBurst } from "./multimodal-ingestion.ts";
import { nextIngestionQuestion, updateGraphSummary } from "./evidence-grouping.ts";
import { renderReceipts } from "./agent-tools.ts";
import { agentState } from "./agent-contract.ts";
import type { BurstEnvelope, BurstReading, BurstMessage, BurstStore } from "./burst-types.ts";
import { AgentCheckpoint, AgentSuperseded, type AgentDomain, type AgentState } from "./agent-contract.ts";
import type { WhatsAppAgentOrchestrator } from "./agent-orchestrator.ts";

export class WhatsAppAgentService {
  constructor(private readonly deps: { ingestion?: boolean; store: BurstStore; orchestrator: WhatsAppAgentOrchestrator; domain: AgentDomain; save(snapshotId: string, revision: number, leaseId: string | null, state: AgentState): Promise<boolean>; reader: { read(message: BurstMessage, save: (reading: BurstReading) => Promise<void>): Promise<BurstReading> }; send(phone: string, text: string, context?: import("./supplier-picker.ts").ReplyContext): Promise<void> }) {}
  receive(envelope: BurstEnvelope) { return this.deps.store.receive(envelope); }
  async processDue(limit = 10) {
    const d = this.deps; const deadline = Date.now() + 220_000;
    for (let index = 0; index < limit && Date.now() < deadline; index++) {
      const [snapshot] = await d.store.claim(1); if (!snapshot) break;
      try {
        const catalog = await d.store.catalog(snapshot.userId);
        if (!catalog.trips.length) throw new Error("Contexto autorizado revocado");
        const save = async (state: AgentState) => {
          snapshot.state = state;
          if (!(await d.save(snapshot.id, snapshot.revision, snapshot.leaseId, state))) throw new AgentSuperseded();
        };
        if (d.ingestion) await ingestBurst(snapshot, d.reader, (id, reading) => d.store.saveReading(id, reading), deadline);
        else for (const message of snapshot.messages) {
          if (Date.now() + 30_000 > deadline) throw new AgentCheckpoint();
          message.reading = await d.reader.read(message, (reading) => d.store.saveReading(message.id, reading));
        }
        await save(agentState(snapshot.state));
        let state = agentState(snapshot.state); let text = ""; let remainderText = "";
        const graph = state.ingestion;
        const ready = graph?.loads.filter((load) => !["PROCESSED", "FAILED", "NEEDS_REVIEW"].includes(load.status)) ?? [];
        // Each logical card has its own bounded loop and durable operations; the worker
        // checkpoints between cards. No transaction or model-round budget spans the batch.
        const cardBatch = Boolean(graph && ready.some((load) => load.type === "SUPPLIER"));
        if (cardBatch && graph) {
          for (const load of ready.filter((load) => load.type === "SUPPLIER")) {
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
          }
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
        } else {
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
            if (asset && message.reading?.ingestion) { message.reading.ingestion.status = asset.status; message.reading.ingestion.loadIds = asset.loadIds; message.reading.ingestion.error = asset.error; await d.store.saveReading(message.id, message.reading); }
          }
          await save(state);
        }
        await d.store.finish(snapshot, state, text);
        if (state.agent.pending?.proposalId) await d.domain.displayed(snapshot, state.agent.pending.proposalId);
        console.info("WhatsApp agent processed", { burstId: snapshot.id, revision: snapshot.revision, rounds: state.agent.rounds, operationCount: state.agent.receipts.length, pending: Boolean(state.question), terminationReason: state.agent.termination?.reason, ingestionSummary: state.ingestion?.summary });
      } catch (error) {
        await d.store.retry(snapshot, error instanceof AgentCheckpoint || error instanceof AgentSuperseded);
        console.error("WhatsApp agent retry", { burstId: snapshot.id, revision: snapshot.revision, terminationReason: (snapshot.state as AgentState).agent?.termination?.reason, error: error instanceof Error ? error.constructor.name : "UnknownError", ...(error instanceof Error && /^(?:Mistral|OpenAI) respondió HTTP \d{3}$/u.test(error.message) ? { providerStatus: Number(error.message.slice(-3)) } : {}) });
        if (error instanceof AgentCheckpoint) break;
      }
    }
    await d.store.flushReplies(d.send);
  }
}
