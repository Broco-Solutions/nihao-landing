import { MISTRAL_TEXT_MODEL } from "../../lib/bot/extraction/mistral-extraction-provider.ts";
import { SupplierExtractionService } from "../../lib/bot/extraction/service.ts";
import { observedMistralProvider } from "../core/provider.ts";
import { errorCase, scoreExtraction } from "../core/scoring.ts";
import type { EvalCase } from "../core/types.ts";
import { TEXT_CASES } from "./cases.ts";

export async function runText(): Promise<EvalCase[]> {
  const results: EvalCase[] = [];
  for (const fixture of TEXT_CASES) {
    const start = performance.now();
    try {
      const { provider, usage } = observedMistralProvider({ async resolve() { throw new Error("No card in text eval"); } });
      const service = new SupplierExtractionService([provider]);
      const extraction = await service.extract({ source: { type: "TEXT", text: fixture.text } });
      results.push(scoreExtraction("text", fixture, extraction.extractedFields, extraction.reviewFields, Math.round(performance.now() - start), MISTRAL_TEXT_MODEL, { usage }));
    } catch (error) { results.push(errorCase("text", fixture.caseId, error, Math.round(performance.now() - start), MISTRAL_TEXT_MODEL)); }
  }
  return results;
}
