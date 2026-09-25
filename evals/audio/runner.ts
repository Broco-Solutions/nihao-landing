import { readFile } from "node:fs/promises";
import path from "node:path";
import { MISTRAL_TEXT_MODEL } from "../../lib/bot/extraction/mistral-extraction-provider.ts";
import { SupplierExtractionService } from "../../lib/bot/extraction/service.ts";
import { observedMistralProvider } from "../core/provider.ts";
import { createMistralTranscriptionProviderFromEnvironment } from "../../lib/bot/transcription.ts";
import { errorCase, scoreExtraction } from "../core/scoring.ts";
import { normalizeString } from "../core/normalize.ts";
import type { EvalCase } from "../core/types.ts";
import { TRANSCRIPT_CASES } from "./transcript-cases.ts";

export async function runTranscripts(): Promise<EvalCase[]> {
  const results: EvalCase[] = [];
  for (const fixture of TRANSCRIPT_CASES) {
    const start = performance.now();
    try {
      const { provider, usage } = observedMistralProvider({ async resolve() { throw new Error("No card in transcript eval"); } });
      const service = new SupplierExtractionService([provider]);
      const extraction = await service.extract({ source: { type: "AUDIO_TRANSCRIPT", text: fixture.transcript } });
      results.push(scoreExtraction("transcript", fixture, extraction.extractedFields, extraction.reviewFields, Math.round(performance.now() - start), MISTRAL_TEXT_MODEL,
        { usage, ...(fixture.observational ? { observation: "Verbal self-correction has no approved normative expectation yet", actualMoq: extraction.extractedFields.moq } : {}) }));
    } catch (error) { results.push(errorCase("transcript", fixture.caseId, error, Math.round(performance.now() - start), MISTRAL_TEXT_MODEL)); }
  }
  return results;
}

type AudioCase = { caseId: string; file: string; expectedTranscript?: string; expectedNihao?: Record<string, unknown>; mustRemainMissing?: string[] };
export async function runRealAudio(root: string): Promise<EvalCase[]> {
  let manifest: { cases: AudioCase[] };
  try { manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return [{ caseId: "real-audio", suite: "audio", status: "SKIPPED", correctFields: [], missingExpectedFields: [], wrongFields: [], hallucinatedFields: [], reviewExpected: [], reviewActual: [], reviewCorrect: null, latencyMs: 0, model: null, metadata: { reason: "NO FIXTURES" } }]; throw error; }
  if (!manifest.cases?.length) return [{ caseId: "real-audio", suite: "audio", status: "SKIPPED", correctFields: [], missingExpectedFields: [], wrongFields: [], hallucinatedFields: [], reviewExpected: [], reviewActual: [], reviewCorrect: null, latencyMs: 0, model: null, metadata: { reason: "NO FIXTURES" } }];
  const transcriber = createMistralTranscriptionProviderFromEnvironment();
  const results: EvalCase[] = [];
  for (const fixture of manifest.cases) {
    const start = performance.now();
    try {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(fixture.caseId) || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(fixture.file) || fixture.file.includes("..")) throw new Error("Invalid audio fixture path");
    const bytes = new Uint8Array(await readFile(path.join(root, fixture.caseId, fixture.file)));
    const ext = path.extname(fixture.file).toLowerCase();
    const mimeType = ext === ".ogg" ? "audio/ogg" : ext === ".mp3" ? "audio/mpeg" : ext === ".wav" ? "audio/wav" : "audio/webm";
    const transcript = await transcriber.transcribe({ bytes, mimeType, filename: fixture.file });
    const { provider, usage } = observedMistralProvider({ async resolve() { throw new Error("No card in audio eval"); } });
    const service = new SupplierExtractionService([provider]);
    const extraction = await service.extract({ source: { type: "AUDIO_TRANSCRIPT", text: transcript.text } });
    const scored = scoreExtraction("audio", { caseId: fixture.caseId, expected: fixture.expectedNihao ?? {}, mustRemainMissing: fixture.mustRemainMissing ?? [] },
      extraction.extractedFields, extraction.reviewFields, Math.round(performance.now() - start), transcript.model, { usage });
    scored.transcriptionResult = transcript.text;
    if (fixture.expectedTranscript && normalizeString(transcript.text) !== normalizeString(fixture.expectedTranscript)) {
      scored.wrongFields.push({ field: "transcriptionResult", expected: fixture.expectedTranscript, actual: transcript.text });
      scored.status = "FAIL";
    }
    results.push(scored);
    } catch (error) { results.push(errorCase("audio", fixture.caseId, error, Math.round(performance.now() - start), null)); }
  }
  return results;
}
