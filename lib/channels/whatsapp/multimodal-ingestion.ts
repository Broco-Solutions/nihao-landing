import { AgentCheckpoint } from "./agent-contract.ts";
import type { BurstReading, BurstSnapshot } from "./burst-types.ts";
import { IngestionValidationError } from "./multimodal-reading.ts";
import { ValidationError } from "../../bot/validation.ts";
import { buildEvidenceGraph } from "./evidence-grouping.ts";
import { backoff, controlError, envPositive, failure, operationContext, requireTime } from "./operational-runtime.ts";

export async function ingestBurst(snapshot: BurstSnapshot, reader: { read(message: BurstSnapshot["messages"][number], save: (reading: BurstReading) => Promise<void>, revision?: number): Promise<BurstReading> }, save: (id: string, reading: BurstReading) => Promise<void>, deadline: number, options: { concurrency?: number; group?: boolean } = {}) {
  return operationContext.run({ deadline }, async () => {
    const retryRequested = snapshot.messages.some((m) => m.envelope.type === "TEXT" && /^reintentar[.!]?$/iu.test(m.envelope.text?.trim() ?? "") && m.sequence > (snapshot.state.ingestion?.revision ?? 0));
    let cursor = 0; let stop: unknown; let pending = false;
    const concurrency = options.concurrency ?? envPositive("WHATSAPP_ASSET_CONCURRENCY", 2);
    if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("Invalid asset concurrency");
    const maxFailures = envPositive("WHATSAPP_ASSET_MAX_FAILURES", 5);
    await Promise.all(Array.from({ length: Math.min(concurrency, snapshot.messages.length) }, async () => {
      while (!stop && cursor < snapshot.messages.length) {
        const message = snapshot.messages[cursor++];
        const previous = message.reading?.ingestion;
        if (previous?.status === "FAILED" && !previous.error?.retryable) continue;
        if ((previous?.status === "FAILED" || previous?.status === "NEEDS_REVIEW" && retryRequested) && previous.error?.retryable) { previous.status = "PENDING_RETRY"; previous.operational = { failures: 0 }; }
        if (previous?.status === "NEEDS_REVIEW") continue;
        if ((previous?.operational?.nextAttemptAt ?? 0) > Date.now()) { pending = true; continue; }
        try {
          requireTime(message.reading?.complete ? 0 : 30_000, deadline);
          message.reading ??= { segments: [] };
          message.reading.ingestion ??= { status: "RECEIVED", stage: "received", attempts: [], loadIds: [] };
          const started = Date.now();
          // Persistence failures must stop the worker, never be relabelled as an asset failure.
          let persistenceError: unknown;
          try {
            message.reading = await reader.read(message, async (reading) => {
              message.reading = reading;
              try { await save(message.id, reading); } catch (error) { persistenceError = error; throw error; }
            }, snapshot.revision);
            message.reading.ingestion ??= { status: "PARSED", stage: "parsed", attempts: [], loadIds: [] };
            message.reading.ingestion.operational = { failures: 0, durationMs: (previous?.operational?.durationMs ?? 0) + Date.now() - started };
          } catch (error) {
            if (controlError(error) || persistenceError) throw error;
            const meta = message.reading.ingestion!;
            const f = error instanceof IngestionValidationError || error instanceof ValidationError ? { type: error instanceof IngestionValidationError ? error.message : "INVALID_ASSET", retryable: false } : failure(error);
            const failures = (meta.operational?.failures ?? 0) + Number(f.type !== "PROVIDER_CIRCUIT_OPEN");
            const exhausted = failures >= maxFailures;
            meta.error = { type: exhausted && f.retryable ? "PROVIDER_UNAVAILABLE_AFTER_RETRIES" : f.type, retryable: f.retryable, stage: meta.stage };
            meta.status = f.retryable && !exhausted ? "PENDING_RETRY" : "NEEDS_REVIEW";
            meta.operational = { failures, nextAttemptAt: Date.now() + backoff(failures, f.retryAfterMs), durationMs: (meta.operational?.durationMs ?? 0) + Date.now() - started };
            meta.attempts.push({ stage: meta.stage, attempt: failures, revision: snapshot.revision, errorType: meta.error.type, retryable: f.retryable });
            pending ||= meta.status === "PENDING_RETRY";
            console.info("WhatsApp asset ingestion", { batchId: snapshot.id, assetId: message.id, stage: meta.stage, attempt: failures, reason: meta.error.type, retryable: f.retryable });
          }
          await save(message.id, message.reading);
        } catch (error) { stop ??= error; }
      }
    }));
    // Drain every started asset before releasing its lease. Never publish an incomplete graph.
    if (stop) throw stop;
    if (pending) throw new AgentCheckpoint();
    requireTime(0, deadline);
    if (options.group === false) return;
    if (snapshot.state.ingestion?.revision !== snapshot.revision) snapshot.state.ingestion = buildEvidenceGraph(snapshot);
    for (const message of snapshot.messages) if (message.reading) await save(message.id, message.reading);
    console.info("WhatsApp evidence grouping", { batchId: snapshot.id, ...snapshot.state.ingestion.summary });
  });
}
