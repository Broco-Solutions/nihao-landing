import { inheritConversationScope } from "./conversation-context.ts";
import { resolveBurstContext, askBurstContext, explicitLoadContexts, contextOptions } from "./burst-context.ts";
import { renderClarification, renderBatchSummary, originalsNotice, userQuestion } from "./clarification-rendering.ts";
import { backoff, controlError, envPositive, failure, operationContext, requireTime, safeDeadline, sanitizedStack } from "./operational-runtime.ts";
import { ingestBurst } from "./multimodal-ingestion.ts";
import { nextIngestionQuestion, updateGraphSummary, describeEvidence } from "./evidence-grouping.ts";
import { observedProduct } from "./product-observation.ts";
import { renderReceipts, recordReceipt } from "./agent-tools.ts";
import { agentState } from "./agent-contract.ts";
import { answerPersistedCatalogQuery } from "./persisted-query.ts";
import { answerDeterministicConversationIntent } from "./conversation-intent.ts";
import type { BurstCatalog, BurstEnvelope, BurstReading, BurstMessage, BurstSnapshot, BurstStore } from "./burst-types.ts";
import { AgentCheckpoint, AgentSuperseded, AgentToolError, type AgentDomain, type AgentState } from "./agent-contract.ts";
import type { WhatsAppAgentOrchestrator } from "./agent-orchestrator.ts";

function deterministicRetryBlock(snapshot: BurstSnapshot, state: AgentState, catalog: BurstCatalog): string | null {
  const previous = state.agent.termination;
  if (previous?.reason !== "tool_error" || previous.failedTool !== "finish_turn" || !["UNFINISHED_OPERATION", "UNVERIFIED_RESPONSE"].includes(previous.errorCode ?? "")) return null;
  const retryMessages = snapshot.messages.filter((message) => message.sequence > previous.revision);
  if (!retryMessages.length || retryMessages.some((message) => message.envelope.type !== "TEXT" || !/^reintentar[.!]?$/iu.test(message.envelope.text?.trim() ?? ""))) return null;
  const graph = state.ingestion;
  if (!graph?.loads.some((load) => !load.resolution && !["PROCESSED", "FAILED"].includes(load.status))) return null;
  for (const load of graph.loads.filter((candidate) => !candidate.resolution && !["PROCESSED", "FAILED"].includes(candidate.status))) {
    load.status = "NEEDS_REVIEW";
    load.error = { type: previous.errorCode!, retryable: false, stage: "business" };
    load.reasons = [...new Set([...load.reasons, "MANUAL_REVIEW_REQUIRED_AFTER_TOOL_ERROR"])];
    load.question = undefined;
    load.questionText = null;
  }
  graph.activeLoadId = undefined;
  updateGraphSummary(graph);
  const tripId = state.tripId ?? state.operationalContext?.tripId;
  const trip = catalog.trips.find((item) => item.id === tripId);
  const href = trip ? `\n\nAbrí *${trip.name}* → *Evidencias de WhatsApp*: /app/viajes/${encodeURIComponent(trip.id)}` : "\n\nAbrí Nihao, elegí el viaje correspondiente y entrá a *Evidencias de WhatsApp*.";
  const text = `⚠️ No puedo resolver este bloqueo repitiendo el mismo intento (${previous.errorCode}). La evidencia y los originales se conservan para revisión manual. No se confirmó ninguna operación nueva.${href}`;
  state.controlIds = [...new Set([...state.controlIds, ...retryMessages.map((message) => message.id)])];
  state.evaluatedRevision = snapshot.revision;
  state.question = text;
  state.agent.pending = { type: "CLARIFICATION", terminalFailure: true, text, options: [], revision: snapshot.revision };
  state.agent.terminal = { revision: snapshot.revision, response: text };
  state.agent.termination = { ...previous, revision: snapshot.revision, rounds: 0 };
  return text;
}

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
      let stage = "context";
      try {
        requireTime(30_000, deadline);
        const catalog = await d.store.catalog(snapshot.userId);
        if (!catalog.trips.length) throw new Error("Contexto autorizado revocado");
        const save = async (state: AgentState) => {
          snapshot.state = state;
          if (!(await d.save(snapshot.id, snapshot.revision, snapshot.leaseId, state))) throw new AgentSuperseded();
        };
        let state = agentState(snapshot.state);
        state.loadContexts ??= explicitLoadContexts(snapshot, catalog);
        snapshot.state = state;
        const conversationContext = await d.domain.conversationContext?.(snapshot);
        if (conversationContext) inheritConversationScope(snapshot, catalog, conversationContext);
        resolveBurstContext(snapshot, catalog, state);
        await save(state);
        stage = "deterministic_retry_block";
        const blockedRetry = deterministicRetryBlock(snapshot, state, catalog);
        if (blockedRetry) {
          await save(state);
          await d.store.finish(snapshot, state, blockedRetry);
          this.metrics(snapshot);
          console.info("WhatsApp deterministic retry blocked", { burstId: snapshot.id, revision: snapshot.revision, failedTool: state.agent.termination?.failedTool, errorCode: state.agent.termination?.errorCode, modelCalls: 0, operationCount: 0 });
          continue;
        }
        stage = "deterministic_intent";
        const deterministicReply = answerDeterministicConversationIntent(snapshot, state);
        if (deterministicReply) {
          await save(state);
          await d.store.finish(snapshot, state, deterministicReply.text);
          this.metrics(snapshot);
          console.info("WhatsApp deterministic conversation processed", { burstId: snapshot.id, revision: snapshot.revision, conversationIntent: deterministicReply.intent, modelCalls: 0, rounds: 0, operationCount: 0 });
          continue;
        }
        stage = "persisted_query";
        const persistedQueryReply = await answerPersistedCatalogQuery({ snapshot, state, catalog, domain: d.domain });
        if (persistedQueryReply) {
          await save(state);
          await d.store.finish(snapshot, state, persistedQueryReply);
          this.metrics(snapshot);
          console.info("WhatsApp persisted query processed", { burstId: snapshot.id, revision: snapshot.revision, ingestionSummary: state.ingestion?.summary });
          continue;
        }
        stage = "multimodal_ingestion";
        if (d.ingestion) await ingestBurst(snapshot, d.reader, (id, reading) => d.store.saveReading(id, reading, snapshot), deadline, { concurrency: d.assetConcurrency });
        else await ingestBurst(snapshot, d.reader, (id, reading) => d.store.saveReading(id, reading, snapshot), deadline, { concurrency: d.assetConcurrency, group: false });
        state = agentState(snapshot.state);
        await save(state);
        stage = "persist_previous_supplier_comments";
        for (const receipt of await d.domain.persistPreviousSupplierComments?.(snapshot) ?? []) recordReceipt(state, receipt);
        stage = "persist_captions";
        await d.domain.persistCaptions?.(snapshot);
        stage = "persist_product_loads";
        for (const receipt of await d.domain.persistProductLoads?.(snapshot) ?? []) recordReceipt(state, receipt);
        await save(state);
        let text = "";
        const graph = state.ingestion;
        const hasImage = (load: import("./ingestion-types.ts").LogicalLoad) => load.assetIds.some(id => snapshot.messages.some(m => m.id === id && m.envelope.type === "IMAGE"));
        const ready = graph?.loads.filter(load => !load.resolution && load.status !== "PROCESSED" && !["FAILED", "NEEDS_REVIEW"].includes(load.status) && !(load.type === "EVIDENCE" && hasImage(load))) ?? [];
        // Each logical card has its own bounded loop and durable operations; the worker
        // checkpoints between cards. No transaction or model-round budget spans the batch.
        const cardBatch = Boolean(graph && ready.some((load) => load.type === "SUPPLIER"));
        const unsolicitedSelection = !state.agent.pending && !state.question && snapshot.messages.every(m => m.envelope.type === "TEXT" && /^\d+$/u.test(m.envelope.text?.trim() ?? "") && !m.envelope.quotedMessageId && !m.envelope.selectionId);
        const obsoleteCorrection = !state.agent.pending && !state.question && Boolean(conversationContext?.suppliers.length) && !conversationContext?.products.length && snapshot.messages.every(m => m.envelope.type === "TEXT" && /^(?:no confirmo|es un proveedor no un producto)[.!]?$/iu.test(m.envelope.text?.trim() ?? ""));
        const savedComments = graph && ready.length === 0 && !state.agent.pending && !state.question && graph.loads.every(l => l.status === "PROCESSED" || l.resolution) && state.agent.receipts.some(r => r.status === "COMPLETED" && r.completedRevision === snapshot.revision);
        if (unsolicitedSelection || obsoleteCorrection || savedComments) {
          for (const load of graph?.loads ?? []) { load.status = "PROCESSED"; load.reasons.push(savedComments ? "COMMENTS_SAVED" : obsoleteCorrection ? "NO_PENDING_CORRECTION" : "NO_PENDING_SELECTION"); }
          for (const asset of graph?.assets ?? []) asset.status = "PROCESSED";
          text = unsolicitedSelection ? "No hay una selección pendiente para ese número." : obsoleteCorrection ? "No hay una confirmación pendiente. Las tarjetas están registradas como proveedores." : renderReceipts(state.agent.receipts.filter(r => r.completedRevision === snapshot.revision));
          state.agent.terminal = { revision: snapshot.revision, response: savedComments ? "" : text };
          state.agent.termination = { reason: "completed", revision: snapshot.revision, rounds: 0 };
        } else if (cardBatch && graph) {
          let needsBurstContext = false;
          for (const load of ready.filter((load) => load.type === "SUPPLIER" && !load.resolution)) {
            requireTime(30_000, deadline);
            if ((load.operational?.nextAttemptAt ?? 0) > Date.now()) continue;
            if (state.loadContexts) {
              graph.activeLoadId = load.id;
              let context = state.loadContexts[load.id];
              const available = contextOptions(catalog, { ...state, tripId: null, operationalContext: undefined });
              if (!context && available.length === 1) { context = { tripId: available[0].tripId, companyId: available[0].companyId }; state.loadContexts[load.id] = context; }
              if (!context) {
                state.tripId = null; state.operationalContext = undefined;
                askBurstContext(snapshot, catalog, state, load.id);
                load.question = state.agent.pending!; load.questionText = state.question;
                await save(state); continue;
              }
              state.tripId = context.tripId; state.operationalContext = context; await save(state);
            }
            try {
              const existing = await d.domain.resolveExistingSupplier?.(snapshot, load.id);
              if (existing) {
                recordReceipt(state, existing);
                await save(state);
                continue;
              }
              if (!state.operationalContext && !state.loadContexts) { needsBurstContext = true; continue; }
              if (d.domain.persistImageLoad) {
                const persisted = await d.domain.persistImageLoad(snapshot, load.id);
                recordReceipt(state, persisted);
                await save(state);
                if (!load.assetIds.some(id => snapshot.messages.some(m => m.id === id && m.envelope.type !== "IMAGE"))) continue;
              }
              graph.activeLoadId = load.id;
              state.agent.pending = load.question ?? state.agent.pending; state.question = load.questionText ?? state.question;
              await save(state);
              stage = "agent_orchestrator_card";
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
              const f = error instanceof AgentToolError ? { type: error.code, retryable: error.code === "ORIGINAL_NOT_STORED" } : failure(error);
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
          stage = "persist_captions_after_cards";
          await d.domain.persistCaptions?.(snapshot);
          stage = "persist_product_loads_after_cards";
          for (const receipt of await d.domain.persistProductLoads?.(snapshot) ?? []) recordReceipt(state, receipt);
          await save(state);
          if (state.loadContexts) { state.tripId = null; state.operationalContext = undefined; }
          updateGraphSummary(graph);
          const pendingLoad = graph.loads.find((load) => !load.resolution && load.question);
          const ingestionQuestion = nextIngestionQuestion(snapshot);
          state.agent.pending = pendingLoad?.question ?? (ingestionQuestion ? { type: "CLARIFICATION", text: ingestionQuestion.question, options: ingestionQuestion.options, revision: snapshot.revision, associationSource: ingestionQuestion.associationSource } : null);
          state.question = state.agent.pending?.type === "CLARIFICATION" ? renderClarification(state.agent.pending) : pendingLoad?.questionText ?? (ingestionQuestion ? renderClarification({ text: ingestionQuestion.question, options: ingestionQuestion.options }) : null);
          if (needsBurstContext) askBurstContext(snapshot, catalog, state);
          if (!needsBurstContext && ready.some((load) => load.type !== "SUPPLIER" && load.status !== "PROCESSED")) {
            // Valid non-card loads continue after the cards, using their real receipts.
            state.agent.terminal = undefined; state.agent.historyRevision = -1;
            await save(state);
            const remainder = await d.orchestrator.run(snapshot, catalog, save, deadline);
            state = remainder.state; text = remainder.text;
          }
          state.agent.scopeId = undefined;
          state.agent.terminal = { revision: snapshot.revision, response: state.agent.terminal?.revision === snapshot.revision ? state.agent.terminal.response : "" };
          state.agent.termination = { reason: state.question ? "asked_clarification" : "completed", revision: snapshot.revision, rounds: state.agent.rounds };
        } else if (graph && ready.length === 0 && graph.assets.some((asset) => ["FAILED", "NEEDS_REVIEW"].includes(asset.status))) {
          const question = nextIngestionQuestion(snapshot);
          state.agent.pending = question ? { type: "CLARIFICATION", text: question.question, options: question.options, revision: snapshot.revision, associationSource: question.associationSource } : null;
          state.question = state.agent.pending ? renderClarification(state.agent.pending) : null;
          text = state.question ?? "No pude identificar algunos datos con seguridad. Los originales se conservan para que puedas revisarlos en Nihao.";
          state.agent.terminal = { revision: snapshot.revision, response: text };
          state.agent.termination = { reason: state.question ? "asked_clarification" : "completed", revision: snapshot.revision, rounds: 0 };
        } else if (graph && ready.length === 0 && graph.loads.some((load) => load.error?.type === "PROVIDER_UNAVAILABLE_AFTER_RETRIES")) {
          state.question = `El servicio que procesa esta información tuvo una falla temporal. ${originalsNotice(snapshot)} Respondé REINTENTAR para intentar de nuevo, o revisá la carga en Nihao.`;
          state.agent.pending = { type: "CLARIFICATION", text: state.question, options: [], revision: snapshot.revision };
          text = [renderReceipts(state.agent.receipts, snapshot.revision), state.question].filter(Boolean).join("\n\n");
        } else {
          if (ready.some((load) => (load.operational?.nextAttemptAt ?? 0) > Date.now())) throw new AgentCheckpoint();
          const namedPhotos = graph?.loads.length && graph.loads.every(load => load.type === "PRODUCT" && load.assetIds.every(id => snapshot.messages.some(m => m.id === id && observedProduct(m))));
          if (namedPhotos && d.domain.persistProductLoads && state.agent.pending?.type !== "APPROVAL") {
            const pendingPhoto = graph?.loads.find(load => !load.resourceId && !load.resolution);
            const image = pendingPhoto && snapshot.messages.find(m => pendingPhoto.assetIds.includes(m.id) && observedProduct(m));
            state.agent.pending = pendingPhoto && image ? { type: "CLARIFICATION", loadId: pendingPhoto.id, text: `${describeEvidence(snapshot, image.id)}\n¿A qué proveedor pertenece? Escribí su nombre.`, options: [], revision: snapshot.revision, products: [{ name: observedProduct(image)!.name, sourceMessageIds: pendingPhoto.assetIds }], sourceMessageIds: pendingPhoto.assetIds } : null;
            state.question = state.agent.pending ? renderClarification(state.agent.pending) : null;
            if (pendingPhoto && state.agent.pending) { pendingPhoto.question = state.agent.pending; pendingPhoto.questionText = state.question; }
            state.agent.terminal = { revision: snapshot.revision, response: "" };
            text = state.question ?? "";
          } else {
            stage = "agent_orchestrator";
            const result = await d.orchestrator.run(snapshot, catalog, save, deadline);
            state = result.state; text = result.text;
          }
        }
        if (d.domain.persistImageLoad && state.ingestion) {
          // Product originals are already retained by ingestion. A missing product
          // destination must never turn that photograph into a supplier capture.
          for (const load of state.ingestion.loads.filter(l => l.type !== "PRODUCT" && !l.resourceId && !l.resolution && l.assetIds.some(id => snapshot.messages.some(m => m.id === id && m.envelope.type === "IMAGE")))) {
            if (load.status === "PENDING_RETRY" && (load.operational?.nextAttemptAt ?? 0) > Date.now()) throw new AgentCheckpoint();
            if (!state.loadContexts?.[load.id] && !state.operationalContext) {
              const options = contextOptions(catalog, { ...state, tripId: null, operationalContext: undefined });
              if (options.length === 1) (state.loadContexts ??= {})[load.id] = { tripId: options[0].tripId, companyId: options[0].companyId };
              else { askBurstContext(snapshot, catalog, state, load.id); continue; }
            }
            recordReceipt(state, await d.domain.persistImageLoad(snapshot, load.id));
            await save(state);
          }
        }
        stage = "persist_captions_final";
        await d.domain.persistCaptions?.(snapshot);
        stage = "read_receipts";
        for (const receipt of await d.domain.receipts(snapshot)) recordReceipt(state, receipt);
        // Historical maintenance must never reclassify a successful domain effect as
        // an asset failure. Failure here checkpoints the worker for a safe retry.
        for (const load of state.ingestion?.loads.filter(l => l.type === "SUPPLIER" && l.status === "PROCESSED") ?? []) {
          requireTime(30_000, deadline);
          await d.domain.resolveHistoricalEvidence?.(snapshot, load.id);
          await save(state);
        }
        if (state.ingestion) {
          updateGraphSummary(state.ingestion);
          const summary = state.ingestion.summary;
          const current = state.agent.receipts.filter(r => r.completedRevision === undefined || r.completedRevision === snapshot.revision);
          if (cardBatch || current.length || state.question) {
            const queryResponse = [...new Set([...(state.agent.queryResponses ?? []).filter(r => r.revision === snapshot.revision).map(r => r.response), state.agent.terminal?.revision === snapshot.revision ? state.agent.terminal.response : ""].filter(Boolean))].join("\n\n");
            text = [renderBatchSummary(summary, cardBatch ? state.agent.receipts : current, state.question, snapshot), userQuestion(queryResponse)].filter(Boolean).join("\n\n");
          }
          for (const message of snapshot.messages) {
            const asset = state.ingestion.assets.find((asset) => asset.id === message.id);
            if (asset && message.reading?.ingestion) { message.reading.ingestion.resolution ??= asset.resolution; message.reading.ingestion.status = asset.status; message.reading.ingestion.loadIds = asset.loadIds; message.reading.ingestion.error = asset.error; await d.store.saveReading(message.id, message.reading, snapshot); }
          }
          await save(state);
        }
        requireTime(0, deadline);
        if (!text.trim()) text = state.question ?? "Recibí y conservé tus mensajes. No encontré cambios comerciales para confirmar todavía; podés seguir enviando información o revisarlos en Nihao.";
        stage = "finish_burst";
        await d.store.finish(snapshot, state, text);
        this.metrics(snapshot);
        if (state.agent.pending?.proposalId) await d.domain.displayed(snapshot, state.agent.pending.proposalId);
        console.info("WhatsApp agent processed", { batchStatus: state.ingestion?.summary.needsReview ? state.ingestion.summary.processed ? "PARTIAL" : "NEEDS_REVIEW" : state.ingestion?.summary.failed ? state.ingestion.summary.processed ? "PARTIAL" : "FAILED" : state.ingestion?.summary.pending ? "PARTIAL" : "COMPLETED", burstId: snapshot.id, revision: snapshot.revision, rounds: state.agent.rounds, toolCallCount: state.agent.calls.length, failedToolCallCount: state.agent.calls.filter((call) => Boolean((call.result as { error?: unknown } | null)?.error)).length, completedOperationCount: state.agent.receipts.length, failedTool: state.agent.termination?.failedTool, errorCode: state.agent.termination?.errorCode, pending: Boolean(state.question), terminationReason: state.agent.termination?.reason, ingestionSummary: state.ingestion?.summary });
      } catch (error) {
        let infrastructureContinuation = false;
        const state = agentState(snapshot.state);
        if (!controlError(error) && state.ingestion && state.agent.termination?.reason === "model_error") {
          const f = failure(error);
          for (const load of state.ingestion.loads.filter((load) => !load.resolution && !["PROCESSED", "FAILED", "NEEDS_REVIEW"].includes(load.status))) {
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
        const classified = failure(error);
        await d.store.retry(snapshot, infrastructureContinuation || error instanceof AgentCheckpoint || error instanceof AgentSuperseded, error);
        console.error("WhatsApp agent retry", { burstId: snapshot.id, revision: snapshot.revision, stage, terminationReason: (snapshot.state as AgentState).agent?.termination?.reason, error: error instanceof Error ? error.constructor.name : "UnknownError", errorCode: classified.type, retryable: classified.retryable, stack: sanitizedStack(error), ...(error instanceof Error && /^(?:Mistral|OpenAI) respondió HTTP \d{3}$/u.test(error.message) ? { providerStatus: Number(error.message.slice(-3)) } : {}) });
        if (error instanceof AgentCheckpoint) break;
      }
    }
    if (Date.now() < deadline) await d.store.flushReplies(d.send);
  }
  private metrics(snapshot: import("./burst-types.ts").BurstSnapshot) {
    if (snapshot.state.ingestion) updateGraphSummary(snapshot.state.ingestion);
    const controls = new Set(snapshot.state.controlIds);
    const actionable = snapshot.messages.filter(m => !controls.has(m.id) && !(snapshot.state.ingestion?.assets.find(asset => asset.id === m.id)?.resolution ?? m.reading?.ingestion?.resolution));
    const resolvedHistorical = snapshot.messages.filter(m => !controls.has(m.id) && Boolean(snapshot.state.ingestion?.assets.find(asset => asset.id === m.id)?.resolution ?? m.reading?.ingestion?.resolution)).length;
    const statuses = actionable.map((m) => snapshot.state.ingestion?.assets.find((asset) => asset.id === m.id)?.status ?? m.reading?.ingestion?.status);
    const durations = snapshot.messages.flatMap((m) => m.reading?.ingestion?.operational?.durationMs === undefined ? [] : [m.reading.ingestion.operational.durationMs]).sort((a, b) => a - b);
    console.info("WhatsApp batch metrics", { batchId: snapshot.id, batch_messages_received_total: snapshot.messages.length, batch_conversation_controls_total: controls.size, batch_assets_total: actionable.length + resolvedHistorical, batch_assets_resolved_historical: resolvedHistorical, batch_assets_completed: statuses.filter((s) => s === "PROCESSED").length, batch_assets_pending: statuses.filter((s) => !s || !["PROCESSED", "FAILED", "NEEDS_REVIEW"].includes(s)).length, batch_assets_failed: statuses.filter((s) => s === "FAILED").length, batch_assets_needs_review: statuses.filter((s) => s === "NEEDS_REVIEW").length, batch_duration_total: snapshot.createdAt ? Date.now() - new Date(snapshot.createdAt).getTime() : undefined, asset_duration_p50: durations[Math.max(0, Math.ceil(durations.length * 0.5) - 1)], asset_duration_p95: durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)] });
  }

}
