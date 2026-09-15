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

/** Raised when a provider returns a payload that does not satisfy our contract. */
export class InvalidSupplierExtractionOutputError extends Error {}

const TIER_1_FIELD_VALUES: readonly Tier1Field[] = [
  "companyName", "city", "province", "contact", "category", "supplierType", "fob", "moq", "leadTime", "interestScore",
];

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function nullableStringValue(value: unknown): string | null | undefined {
  return value === null || typeof value === "string" ? value : undefined;
}

function nullableNumberValue(value: unknown, integer = false): number | null | undefined {
  return value === null || (typeof value === "number" && Number.isFinite(value) && (!integer || Number.isInteger(value))) ? value : undefined;
}

function fieldList(value: unknown): Tier1Field[] | null {
  if (!Array.isArray(value) || !value.every((field): field is Tier1Field => typeof field === "string" && TIER_1_FIELD_VALUES.includes(field as Tier1Field))) return null;
  return [...new Set(value)];
}

/**
 * Runtime counterpart to SUPPLIER_EXTRACTION_JSON_SCHEMA. Providers must call
 * this after parsing a model response: a JSON-mode response is not evidence of
 * a valid or safe extraction result by itself.
 */
export function parseSupplierExtractionStructuredOutput(value: unknown): SupplierExtractionStructuredOutput {
  const result = record(value);
  if (!result) throw new InvalidSupplierExtractionOutputError("La respuesta de extracción no es un objeto");

  const companyName = nullableStringValue(result.companyName);
  const city = nullableStringValue(result.city);
  const province = nullableStringValue(result.province);
  const category = nullableStringValue(result.category);
  const interestScore = nullableNumberValue(result.interestScore, true);
  const contact = record(result.contact);
  const fob = result.fob === null ? null : record(result.fob);
  const moq = result.moq === null ? null : record(result.moq);
  const leadTime = result.leadTime === null ? null : record(result.leadTime);
  const supplierType = result.supplierType;
  const detectedFields = fieldList(result.detectedFields);
  const reviewFields = fieldList(result.reviewFields);
  const missingFields = fieldList(result.missingFields);
  const evidence = result.evidence;

  if (companyName === undefined || city === undefined || province === undefined || category === undefined
    || interestScore === undefined || (interestScore !== null && (interestScore < 1 || interestScore > 5))
    || !contact || !fob && result.fob !== null || !moq && result.moq !== null || !leadTime && result.leadTime !== null
    || (supplierType !== "FACTORY" && supplierType !== "TRADING" && supplierType !== "UNKNOWN")
    || !detectedFields || !reviewFields || !missingFields || !Array.isArray(evidence)) {
    throw new InvalidSupplierExtractionOutputError("La respuesta no cumple el schema de extracción");
  }

  const name = nullableStringValue(contact.name);
  const email = nullableStringValue(contact.email);
  const phone = nullableStringValue(contact.phone);
  const wechat = nullableStringValue(contact.wechat);
  if (name === undefined || email === undefined || phone === undefined || wechat === undefined) {
    throw new InvalidSupplierExtractionOutputError("El contacto no cumple el schema de extracción");
  }

  const parseFob = () => {
    if (!fob) return null;
    const amount = nullableNumberValue(fob.amount);
    const currency = nullableStringValue(fob.currency);
    const unit = nullableStringValue(fob.unit);
    if (amount === undefined || (amount !== null && amount < 0) || currency === undefined || unit === undefined || typeof fob.rawText !== "string") throw new InvalidSupplierExtractionOutputError("FOB inválido");
    return { amount, currency, unit, rawText: fob.rawText };
  };
  const parseMoq = () => {
    if (!moq) return null;
    const quantity = nullableNumberValue(moq.quantity, true);
    const unit = nullableStringValue(moq.unit);
    const notes = nullableStringValue(moq.notes);
    if (quantity === undefined || (quantity !== null && quantity < 0) || unit === undefined || notes === undefined || typeof moq.rawText !== "string") throw new InvalidSupplierExtractionOutputError("MOQ inválido");
    return { quantity, unit, notes, rawText: moq.rawText };
  };
  const parseLeadTime = () => {
    if (!leadTime) return null;
    const days = nullableNumberValue(leadTime.days, true);
    if (days === undefined || (days !== null && days < 0) || typeof leadTime.rawText !== "string") throw new InvalidSupplierExtractionOutputError("Lead time inválido");
    return { rawText: leadTime.rawText, days };
  };
  const parsedEvidence: FieldEvidence[] = evidence.map((item) => {
    const entry = record(item);
    const confidence = entry && nullableNumberValue(entry.confidence);
    if (!entry || !TIER_1_FIELD_VALUES.includes(entry.field as Tier1Field) || confidence === undefined || confidence === null || confidence < 0 || confidence > 1 || typeof entry.evidence !== "string" || !entry.evidence.trim()) {
      throw new InvalidSupplierExtractionOutputError("Evidencia inválida");
    }
    return { field: entry.field as Tier1Field, confidence, evidence: entry.evidence };
  });

  return {
    companyName, city, province, contact: { name, email, phone, wechat }, supplierType,
    fob: parseFob(), moq: parseMoq(), leadTime: parseLeadTime(), category, interestScore,
    detectedFields, reviewFields, missingFields, evidence: parsedEvidence,
  };
}
