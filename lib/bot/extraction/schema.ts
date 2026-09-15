import type { FieldEvidence, SupplierType, Tier1Field } from "../types.ts";

export type ContactDetails = {
  name: string | null;
  email: string | null;
  phone: string | null;
  wechat: string | null;
};

export type SupplierExtractionStructuredOutput = {
  companyName: string | null;
  city: string | null;
  province: string | null;
  contact: ContactDetails;
  supplierType: SupplierType;
  fob: { amount: number | null; currency: string | null; unit: string | null; rawText: string } | null;
  moq: { quantity: number | null; unit: string | null; notes: string | null; rawText: string } | null;
  leadTime: { rawText: string; days: number | null } | null;
  category: string | null;
  interestScore: number | null;
  detectedFields: Tier1Field[];
  reviewFields: Tier1Field[];
  missingFields: Tier1Field[];
  evidence: FieldEvidence[];
};

const nullableString = { type: ["string", "null"] } as const;
const nullableNumber = { type: ["number", "null"] } as const;
const tier1Field = { type: "string", enum: ["companyName", "city", "province", "contact", "category", "supplierType", "fob", "moq", "leadTime", "interestScore"] } as const;

/** JSON Schema ready for a future Structured Outputs provider. */
export const SUPPLIER_EXTRACTION_JSON_SCHEMA = {
  name: "nihao_supplier_extraction",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["companyName", "city", "province", "contact", "supplierType", "fob", "moq", "leadTime", "category", "interestScore", "detectedFields", "reviewFields", "missingFields", "evidence"],
    properties: {
      companyName: nullableString,
      city: nullableString,
      province: nullableString,
      contact: { type: "object", additionalProperties: false, required: ["name", "email", "phone", "wechat"], properties: { name: nullableString, email: nullableString, phone: nullableString, wechat: nullableString } },
      supplierType: { type: "string", enum: ["FACTORY", "TRADING", "UNKNOWN"] },
      fob: { type: ["object", "null"], additionalProperties: false, required: ["amount", "currency", "unit", "rawText"], properties: { amount: nullableNumber, currency: nullableString, unit: nullableString, rawText: { type: "string" } } },
      moq: { type: ["object", "null"], additionalProperties: false, required: ["quantity", "unit", "notes", "rawText"], properties: { quantity: { type: ["integer", "null"] }, unit: nullableString, notes: nullableString, rawText: { type: "string" } } },
      leadTime: { type: ["object", "null"], additionalProperties: false, required: ["rawText", "days"], properties: { rawText: { type: "string" }, days: { type: ["integer", "null"] } } },
      category: nullableString,
      interestScore: { type: ["integer", "null"], minimum: 1, maximum: 5 },
      detectedFields: { type: "array", items: tier1Field },
      reviewFields: { type: "array", items: tier1Field },
      missingFields: { type: "array", items: tier1Field },
      evidence: { type: "array", items: { type: "object", additionalProperties: false, required: ["field", "confidence", "evidence"], properties: { field: tier1Field, confidence: { type: "number", minimum: 0, maximum: 1 }, evidence: { type: "string" } } } },
    },
  },
} as const;
