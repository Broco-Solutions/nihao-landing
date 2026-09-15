import type { ExtractionCandidate, RawSource } from "../types.ts";

export type ExtractionInput = {
  source: RawSource;
};

export interface SupplierExtractionAdapter {
  readonly name: string;
  supports(source: RawSource): boolean;
  extract(input: ExtractionInput): Promise<ExtractionCandidate>;
}

export class UnsupportedExtractionSourceError extends Error {}
