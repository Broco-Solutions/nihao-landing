import { DevelopmentTextExtractionAdapter } from "./development-text-adapter.ts";
import { SupplierExtractionService } from "./service.ts";

export const supplierExtractionService = new SupplierExtractionService([
  new DevelopmentTextExtractionAdapter(),
]);

export type { ExtractionProvider, SupplierExtractionAdapter } from "./contract.ts";
export { mergeExtractionCandidates } from "./merge.ts";
export { SUPPLIER_EXTRACTION_JSON_SCHEMA } from "./schema.ts";
export type { ContactDetails, SupplierExtractionStructuredOutput } from "./schema.ts";
