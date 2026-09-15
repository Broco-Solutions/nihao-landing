import type { ExtractionCandidate, RawSource } from "../types.ts";

export type ExtractionInput = {
  source: RawSource;
};

/**
 * Provider boundary: implementations may be deterministic, mocked, or backed
 * by an external multimodal API. It intentionally knows nothing about HTTP,
 * credentials, Prisma, or storage.
 */
export interface ExtractionProvider {
  readonly name: string;
  supports(source: RawSource): boolean;
  extract(input: ExtractionInput): Promise<ExtractionCandidate>;
}

/** @deprecated Use ExtractionProvider in new code. */
export type SupplierExtractionAdapter = ExtractionProvider;

export class UnsupportedExtractionSourceError extends Error {}
