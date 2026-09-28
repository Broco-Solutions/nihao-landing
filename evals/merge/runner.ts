import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SupplierExtractionService } from "../../lib/bot/extraction/service.ts";
import { runProductExtraction } from "../../lib/bot/extraction/production.ts";
import { FileSupplierCaptureRepository } from "../../lib/bot/persistence/file-repository.ts";
import { EMPTY_TIER_1_DATA } from "../../lib/bot/types.ts";
import { calculateMissingFields } from "../../lib/bot/tier1.ts";
import type { ExtractionProvider } from "../../lib/bot/extraction/contract.ts";
import type { ExtractionCandidate, Tier1Data } from "../../lib/bot/types.ts";
import { scoreExtraction } from "../core/scoring.ts";
import type { EvalCase } from "../core/types.ts";
import { MERGE_CASES } from "./cases.ts";

function providerFor(values: Array<Partial<Tier1Data>>): ExtractionProvider {
  return { name: "synthetic-evidence", supports: () => true, async extract(input): Promise<ExtractionCandidate> {
    const index = Number(input.source.text?.replace("evidence-", "") ?? 0);
    return { rawSource: input.source, extractedFields: values[index] ?? {}, reviewFields: [], evidence: [] };
  } };
}
export async function runMerge(): Promise<EvalCase[]> {
  const results: EvalCase[] = [];
  for (const fixture of MERGE_CASES) {
    const start = performance.now();
    const extraction = await new SupplierExtractionService([providerFor(fixture.evidence)]).extractMany(fixture.evidence.map((_, index) => ({ source: { type: "TEXT", text: `evidence-${index}` } })));
    const result = scoreExtraction("merge", fixture, extraction.extractedFields, extraction.reviewFields, Math.round(performance.now() - start), "deterministic", { evidenceCount: fixture.evidence.length });
    const conflictExpected = fixture.reviewExpected?.length ? fixture.reviewExpected : [];
    result.mergeCorrect = extraction.mergedSources?.length === fixture.evidence.length
      && conflictExpected.every((field) => extraction.sourceConflicts?.some((item) => item.field === field))
      && (extraction.sourceConflicts?.length ?? 0) === conflictExpected.length;
    if (!result.mergeCorrect) result.status = "FAIL";
    results.push(result);
  }
  const temporary = await mkdtemp(path.join(os.tmpdir(), "nihao-eval-merge-"));
  try {
    const repository = new FileSupplierCaptureRepository(path.join(temporary, "captures.json"));
    const captures = Object.assign(repository, { async hasTripAccess() { return true; } });
    for (const [caseId, corrections] of [["M06-human-override", { moq: { quantity: 250, unit: "unidades", notes: null, rawText: "250 unidades" } }],
      ["M07-multiple-human-corrections", { moq: { quantity: 250, unit: "unidades", notes: null, rawText: "250 unidades" }, companyName: "Human Corrected Co" }]] as const) {
      const start = performance.now();
      const base = { ...EMPTY_TIER_1_DATA, companyName: "AI Initial Co", moq: { quantity: 100, unit: "unidades", notes: null, rawText: "100 unidades" } };
      const capture = await repository.createDraft({ userId: "eval-user", tripId: "eval-trip", extraction: { rawSource: { type: "TEXT", text: "initial" }, extractedFields: base, mergedSources: [], reviewFields: [], evidence: [], missingFields: calculateMissingFields(base) } });
      for (const [field, value] of Object.entries(corrections)) await repository.correctField({ userId: "eval-user", tripId: "eval-trip", captureId: capture.id, field: field as "moq" | "companyName", value: value as never, acknowledgedUnknown: false } as never);
      const service = new SupplierExtractionService([providerFor([{ companyName: "AI Reanalysis Co", moq: { quantity: 500, unit: "unidades", notes: null, rawText: "500 unidades" } }])]);
      const updated = await runProductExtraction({ userId: "eval-user", tripId: "eval-trip", captureId: capture.id, text: "evidence-0", businessCardAttachmentIds: [] },
        { captures, attachments: { async get() { return null; } }, extraction: service });
      const result = scoreExtraction("merge", { caseId, expected: corrections, mustRemainMissing: [] }, updated.fields, updated.reviewFields, Math.round(performance.now() - start), "deterministic",
        { humanCorrectedFields: updated.humanCorrectedFields });
      result.humanOverridePreserved = Object.entries(corrections).every(([field, value]) => JSON.stringify(updated.fields[field as keyof Tier1Data]) === JSON.stringify(value));
      result.mergeCorrect = result.humanOverridePreserved;
      if (!result.humanOverridePreserved) result.status = "FAIL";
      results.push(result);
    }
  } finally { await rm(temporary, { recursive: true, force: true }); }
  return results;
}
