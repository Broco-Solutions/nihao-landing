import { calculateMissingFields, normalizeTier1Data } from "../tier1.ts";
import type { StructuredExtractionResult } from "../types.ts";
import { UnsupportedExtractionSourceError, type ExtractionInput, type SupplierExtractionAdapter } from "./contract.ts";

export class SupplierExtractionService {
  constructor(private readonly adapters: SupplierExtractionAdapter[]) {}

  async extract(input: ExtractionInput): Promise<StructuredExtractionResult> {
    const adapter = this.adapters.find((candidate) => candidate.supports(input.source));
    if (!adapter) throw new UnsupportedExtractionSourceError(`No hay adaptador para ${input.source.type}`);

    const candidate = await adapter.extract(input);
    const fields = normalizeTier1Data(candidate.extractedFields);
    return {
      ...candidate,
      extractedFields: fields,
      missingFields: calculateMissingFields(fields),
    };
  }
}
