import { calculateMissingFields, normalizeTier1Data } from "../tier1.ts";
import type { StructuredExtractionResult } from "../types.ts";
import { UnsupportedExtractionSourceError, type ExtractionInput, type SupplierExtractionAdapter } from "./contract.ts";
import { mergeExtractionCandidates } from "./merge.ts";

export class SupplierExtractionService {
  constructor(private readonly adapters: SupplierExtractionAdapter[]) {}

  async extract(input: ExtractionInput): Promise<StructuredExtractionResult> {
    return this.toStructured(await this.extractCandidate(input));
  }

  async extractMany(inputs: ExtractionInput[]): Promise<StructuredExtractionResult> {
    if (inputs.length === 0) throw new UnsupportedExtractionSourceError("No hay fuentes para extraer");
    const candidates = await Promise.all(inputs.map((input) => this.extractCandidate(input)));
    return this.toStructured(mergeExtractionCandidates(candidates));
  }

  private async extractCandidate(input: ExtractionInput) {
    const adapter = this.adapters.find((candidate) => candidate.supports(input.source));
    if (!adapter) throw new UnsupportedExtractionSourceError(`No hay adaptador para ${input.source.type}`);
    return adapter.extract(input);
  }

  private toStructured(candidate: Awaited<ReturnType<SupplierExtractionAdapter["extract"]>>): StructuredExtractionResult {
    const fields = normalizeTier1Data(candidate.extractedFields);
    return {
      ...candidate,
      extractedFields: fields,
      missingFields: calculateMissingFields(fields),
    };
  }
}
