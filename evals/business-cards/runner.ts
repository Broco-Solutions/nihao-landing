import { readFile } from "node:fs/promises";
import path from "node:path";
import { MISTRAL_OCR_MODEL } from "../../lib/bot/extraction/mistral-extraction-provider.ts";
import { SupplierExtractionService } from "../../lib/bot/extraction/service.ts";
import { observedMistralProvider } from "../core/provider.ts";
import { errorCase, scoreExtraction } from "../core/scoring.ts";
import type { EvalCase } from "../core/types.ts";

type PrivateCase = { caseId: string; images: string[]; expectedFacts: Record<string, unknown>; expectedNihao: Record<string, unknown>; mustRemainMissing: string[]; mergeExpectations?: { supplierCaptureCount?: number; businessCardAttachmentCount?: number; requiresBothImages?: boolean; conflictExpected?: boolean } };
function fact(caseData: PrivateCase, key: string): unknown {
  return caseData.expectedFacts[key] ?? (caseData.expectedFacts.merged as Record<string, unknown> | undefined)?.[key];
}
export async function runBusinessCards(root: string): Promise<EvalCase[]> {
  const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")) as { cases: Array<{ caseId: string }> };
  const results: EvalCase[] = [];
  for (const entry of manifest.cases) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(entry.caseId)) throw new Error("Invalid private case ID");
    const start = performance.now();
    try {
    const caseDir = path.join(root, entry.caseId);
    const fixture = JSON.parse(await readFile(path.join(caseDir, "expected.json"), "utf8")) as PrivateCase;
    const images = new Map<string, Uint8Array>();
    for (const name of fixture.images) {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name) || name.includes("..")) throw new Error("Invalid image name");
      images.set(name, new Uint8Array(await readFile(path.join(caseDir, name))));
    }
    const { provider, usage } = observedMistralProvider({ async resolve(id) {
      const bytes = images.get(id); if (!bytes) throw new Error("Missing local card image");
      return { bytes, mimeType: id.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg" };
    } });
    const extraction = await new SupplierExtractionService([provider]).extractMany(fixture.images.map((attachmentId) => ({ source: { type: "IMAGE_BUSINESS_CARD", attachmentId } })));
    const expected = { ...fixture.expectedNihao };
    const email = fact(fixture, "email"); if (typeof email === "string") expected.email = email;
    const phoneOptions = [fact(fixture, "phone"), fact(fixture, "mobile"), ...(Array.isArray(fact(fixture, "phones")) ? fact(fixture, "phones") as unknown[] : [])].filter((value): value is string => typeof value === "string");
    if (phoneOptions.length) expected.phone = phoneOptions;
    const result = scoreExtraction("business-cards", { caseId: fixture.caseId, expected, mustRemainMissing: fixture.mustRemainMissing }, extraction.extractedFields,
      extraction.reviewFields, Math.round(performance.now() - start), MISTRAL_OCR_MODEL,
      { imageCount: fixture.images.length, expectedFactsKeys: Object.keys(fixture.expectedFacts), unsupportedFacts: ["website", "address", "services", "contactTitle"].filter((key) => fact(fixture, key) !== undefined), sourceConflicts: extraction.sourceConflicts?.map((item) => item.field) ?? [], usage });
    if (fixture.mergeExpectations?.requiresBothImages) {
      result.mergeCorrect = extraction.mergedSources?.length === fixture.images.length
        && fixture.mergeExpectations.businessCardAttachmentCount === fixture.images.length
        && fixture.mergeExpectations.supplierCaptureCount === 1
        && Boolean(extraction.sourceConflicts?.length) === Boolean(fixture.mergeExpectations.conflictExpected);
      if (!result.mergeCorrect && result.status === "PASS") result.status = "FAIL";
    }
    result.ocrResult = { fields: extraction.extractedFields, reviewFields: extraction.reviewFields, conflicts: extraction.sourceConflicts?.map((item) => item.field) ?? [] };
    results.push(result);
    } catch (error) { results.push(errorCase("business-cards", entry.caseId, error, Math.round(performance.now() - start), MISTRAL_OCR_MODEL)); }
  }
  return results;
}
