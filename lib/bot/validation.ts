import {
  TIER_1_FIELDS,
  type Fob,
  type LeadTime,
  type Moq,
  type SupplierType,
  type Tier1Field,
  type Tier1FieldUpdate,
} from "./types.ts";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError(`${name} debe ser un objeto`);
  return value as Record<string, unknown>;
}

function requiredId(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,79}$/.test(value)) {
    throw new ValidationError(`${name} no es válido`);
  }
  return value;
}

function nullableString(value: unknown, name: string): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 500) throw new ValidationError(`${name} no es válido`);
  return value;
}

function nullableNumber(value: unknown, name: string): number | null {
  if (value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new ValidationError(`${name} no es válido`);
  return value;
}

function supplierType(value: unknown): SupplierType {
  if (value === "FACTORY" || value === "TRADING" || value === "UNKNOWN") return value;
  throw new ValidationError("supplierType no es válido");
}

function fob(value: unknown): Fob | null {
  if (value === null) return null;
  const input = object(value, "fob");
  return {
    amount: nullableNumber(input.amount, "fob.amount"),
    currency: nullableString(input.currency, "fob.currency"),
    unit: nullableString(input.unit, "fob.unit"),
    rawText: nullableString(input.rawText, "fob.rawText") ?? "",
  };
}

function moq(value: unknown): Moq | null {
  if (value === null) return null;
  const input = object(value, "moq");
  const quantity = nullableNumber(input.quantity, "moq.quantity");
  if (quantity !== null && !Number.isInteger(quantity)) throw new ValidationError("moq.quantity debe ser entero");
  return {
    quantity,
    unit: nullableString(input.unit, "moq.unit"),
    notes: nullableString(input.notes, "moq.notes"),
    rawText: nullableString(input.rawText, "moq.rawText") ?? "",
  };
}

function leadTime(value: unknown): LeadTime | null {
  if (value === null) return null;
  const input = object(value, "leadTime");
  return {
    rawText: nullableString(input.rawText, "leadTime.rawText") ?? "",
    days: nullableNumber(input.days, "leadTime.days"),
  };
}

export function parseExtractionRequest(value: unknown) {
  const input = object(value, "body");
  const source = object(input.source, "source");
  if (source.type !== "TEXT") throw new ValidationError("Esta iteración sólo admite source.type TEXT");
  if (typeof source.text !== "string" || source.text.trim().length < 2 || source.text.length > 10_000) {
    throw new ValidationError("source.text debe tener entre 2 y 10000 caracteres");
  }
  return {
    userId: requiredId(input.userId, "userId"),
    tripId: requiredId(input.tripId, "tripId"),
    tripName: nullableString(input.tripName, "tripName") ?? "Viaje sin nombre",
    source: { type: "TEXT" as const, text: source.text.trim() },
  };
}

export function parseContext(value: unknown) {
  const input = object(value, "body");
  return { userId: requiredId(input.userId, "userId"), tripId: requiredId(input.tripId, "tripId") };
}

export function parseCorrectionRequest(value: unknown): {
  userId: string;
  tripId: string;
  correction: Tier1FieldUpdate;
  acknowledgedUnknown: boolean;
} {
  const input = object(value, "body");
  const correction = parseTier1FieldUpdate(input.field, input.value);
  return {
    userId: requiredId(input.userId, "userId"),
    tripId: requiredId(input.tripId, "tripId"),
    correction,
    acknowledgedUnknown: input.acknowledgedUnknown === true,
  };
}

function isTier1Field(value: unknown): value is Tier1Field {
  return typeof value === "string" && TIER_1_FIELDS.includes(value as Tier1Field);
}

function parseTier1FieldUpdate(field: unknown, value: unknown): Tier1FieldUpdate {
  if (!isTier1Field(field)) throw new ValidationError("field no es válido");
  switch (field) {
    case "supplierType": return { field, value: supplierType(value) };
    case "fob": return { field, value: fob(value) };
    case "moq": return { field, value: moq(value) };
    case "leadTime": return { field, value: leadTime(value) };
    case "interestScore": {
      const score = nullableNumber(value, "interestScore");
      if (score !== null && (!Number.isInteger(score) || score < 1 || score > 5)) throw new ValidationError("interestScore debe estar entre 1 y 5");
      return { field, value: score };
    }
    case "companyName":
    case "city":
    case "province":
    case "contact":
    case "category":
      return { field, value: nullableString(value, field) };
  }
}
