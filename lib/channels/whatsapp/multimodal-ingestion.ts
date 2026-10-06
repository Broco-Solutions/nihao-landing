import { AgentCheckpoint, AgentSuperseded } from "./agent-contract.ts";
import type { BurstReading, BurstSnapshot } from "./burst-types.ts";
import { IngestionValidationError } from "./multimodal-reading.ts";
import { ValidationError } from "../../bot/validation.ts";
import { buildEvidenceGraph } from "./evidence-grouping.ts";

export async function ingestBurst(snapshot: BurstSnapshot, reader: { read(message: BurstSnapshot["messages"][number], save: (reading: BurstReading) => Promise<void>, revision?: number): Promise<BurstReading> }, save: (id: string, reading: BurstReading) => Promise<void>, deadline: number) {
  const retryRequested = snapshot.messages.some((m) => m.envelope.type === "TEXT" && /^reintentar[.!]?$/iu.test(m.envelope.text?.trim() ?? "") && m.sequence > (snapshot.state.ingestion?.revision ?? 0));
  for (const message of snapshot.messages) {
    const previous = message.reading?.ingestion;
    if (previous?.status === "FAILED" && (!previous.error?.retryable || !retryRequested)) continue;
    if (previous?.status === "FAILED" && retryRequested && previous.error?.retryable) { previous.status = "PARSED"; previous.error = undefined; }
    if (previous?.status === "NEEDS_REVIEW" && message.reading?.complete) continue;
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (Date.now() + 30_000 > deadline) throw new AgentCheckpoint();
      message.reading ??= { segments: [] };
      message.reading.ingestion ??= { status: "RECEIVED", stage: "received", attempts: [], loadIds: [] };
      try {
        message.reading = await reader.read(message, async (reading) => { message.reading = reading; await save(message.id, reading); }, snapshot.revision);
        message.reading.ingestion ??= { status: "PARSED", stage: "parsed", attempts: [], loadIds: [] };
        await save(message.id, message.reading); break;
      } catch (error) {
        if (error instanceof AgentCheckpoint || error instanceof AgentSuperseded) throw error;
        const meta = message.reading.ingestion!;
        const retryable = !(error instanceof IngestionValidationError || error instanceof ValidationError) && !(error instanceof Error && /HTTP (?:400|401|403|404|422)\b/u.test(error.message));
        const errorType = error instanceof IngestionValidationError ? error.message : error instanceof Error ? error.constructor.name : "UnknownError";
        meta.error = { type: errorType, retryable, stage: meta.stage };
        meta.status = retryable ? "FAILED" : "NEEDS_REVIEW";
        const activeAttempt = meta.attempts.at(-1);
        if (activeAttempt?.stage === meta.stage && !activeAttempt.errorType) Object.assign(activeAttempt, { errorType, retryable });
        else meta.attempts.push({ stage: meta.stage, attempt, revision: snapshot.revision, errorType, retryable });
        await save(message.id, message.reading);
        console.info("WhatsApp asset ingestion", { batchId: snapshot.id, assetId: message.id, type: message.envelope.type, stage: meta.stage, attempt, errorType, retryable });
        if (!retryable) break;
      }
    }
  }
  snapshot.state.ingestion = buildEvidenceGraph(snapshot);
  for (const message of snapshot.messages) if (message.reading) await save(message.id, message.reading);
  console.info("WhatsApp evidence grouping", { batchId: snapshot.id, ...snapshot.state.ingestion.summary, associations: snapshot.state.ingestion.links.filter((l) => snapshot.messages.some((m) => m.id === l.sourceAssetId && m.envelope.type === "AUDIO")).map((l) => ({ assetId: l.sourceAssetId, candidateTargets: l.candidateTargets, selectedTarget: l.targetLoadId, associationReason: l.reasons, confidence: l.confidence })) });
}
