import { DevelopmentTextExtractionAdapter } from "./development-text-adapter.ts";
import { SupplierExtractionService } from "./service.ts";

export const supplierExtractionService = new SupplierExtractionService([
  new DevelopmentTextExtractionAdapter(),
]);

export type { SupplierExtractionAdapter } from "./contract.ts";
