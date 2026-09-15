import { DevelopmentTextExtractionAdapter } from "./development-text-adapter.ts";
import { SupplierExtractionService } from "./service.ts";

export const supplierExtractionService = new SupplierExtractionService([
  new DevelopmentTextExtractionAdapter(),
]);

export type { ExtractionProvider, SupplierExtractionAdapter } from "./contract.ts";
export { mergeExtractionCandidates } from "./merge.ts";
export { SUPPLIER_EXTRACTION_JSON_SCHEMA, parseSupplierExtractionStructuredOutput } from "./schema.ts";
export type { ContactDetails, SupplierExtractionStructuredOutput } from "./schema.ts";
export { MistralExtractionProvider, FetchMistralHttpClient, createMistralExtractionProviderFromEnvironment } from "./mistral-extraction-provider.ts";
export { StorageBusinessCardResolver } from "./storage-business-card-resolver.ts";
export type { MistralExtractionProviderOptions, MistralHttpClient } from "./mistral-extraction-provider.ts";
export type { BusinessCardResolver, ResolvedBusinessCard } from "./storage-business-card-resolver.ts";
