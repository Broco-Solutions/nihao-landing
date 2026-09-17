import {
  EMPTY_TIER_1_DATA,
  TIER_1_FIELDS,
  type SupplierCaptureRecord,
  type Tier1Data,
  type Tier1Field,
} from "./types.ts";

const NUMBER_WORDS: Record<string, number> = {
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  quince: 15,
  veinte: 20,
  treinta: 30,
};

export function parseLocalizedNumber(raw: string): number | null {
  const numeric = raw.match(/\d+(?:[.,]\d+)?/);
  if (numeric) return Number(numeric[0].replace(",", "."));

  const normalized = raw.toLocaleLowerCase("es");
  for (const [word, value] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(normalized)) return value;
  }
  return null;
}

export function normalizeLeadTimeToDays(rawText: string): number | null {
  const amount = parseLocalizedNumber(rawText);
  if (amount === null) return null;

  const normalized = rawText.toLocaleLowerCase("es");
  if (/semana|week/.test(normalized)) return Math.round(amount * 7);
  if (/mes|month/.test(normalized)) return Math.round(amount * 30);
  if (/d[ií]a|day/.test(normalized)) return Math.round(amount);
  return null;
}

export function normalizeTier1Data(input: Partial<Tier1Data>): Tier1Data {
  const fields: Tier1Data = {
    ...EMPTY_TIER_1_DATA,
    ...input,
    companyName: input.companyName?.trim() || null,
    city: input.city?.trim() || null,
    province: input.province?.trim() || null,
    contact: input.contact?.trim() || null,
    category: input.category?.trim() || null,
    supplierType: input.supplierType ?? "UNKNOWN",
    fob: input.fob
      ? {
          amount: input.fob.amount,
          currency: input.fob.currency?.trim().toUpperCase() || null,
          unit: input.fob.unit?.trim() || null,
          rawText: input.fob.rawText.trim(),
        }
      : null,
    moq: input.moq
      ? {
          quantity: input.moq.quantity,
          unit: input.moq.unit?.trim() || null,
          notes: input.moq.notes?.trim() || null,
          rawText: input.moq.rawText.trim(),
        }
      : null,
    leadTime: input.leadTime
      ? {
          rawText: input.leadTime.rawText.trim(),
          days: input.leadTime.days ?? normalizeLeadTimeToDays(input.leadTime.rawText),
        }
      : null,
    interestScore: input.interestScore ?? null,
  };

  if (fields.interestScore !== null && (!Number.isInteger(fields.interestScore) || fields.interestScore < 1 || fields.interestScore > 5)) {
    fields.interestScore = null;
  }
  return fields;
}

export function calculateMissingFields(fields: Tier1Data): Tier1Field[] {
  const missing = new Set<Tier1Field>();
  if (!fields.companyName) missing.add("companyName");
  if (!fields.city) missing.add("city");
  if (!fields.province) missing.add("province");
  if (!fields.contact) missing.add("contact");
  if (!fields.category) missing.add("category");
  if (fields.supplierType === "UNKNOWN") missing.add("supplierType");
  if (!fields.fob || fields.fob.amount === null) missing.add("fob");
  if (!fields.moq || fields.moq.quantity === null) missing.add("moq");
  if (!fields.leadTime || fields.leadTime.days === null) missing.add("leadTime");
  if (fields.interestScore === null) missing.add("interestScore");
  return TIER_1_FIELDS.filter((field) => missing.has(field));
}

// En Tier 1 la captura no se convierte en un interrogatorio completo: categoría
// (bloqueante) e interés son las preguntas activas; el resto queda visible como pendiente.
export function calculateQuestionFields(
  fields: Tier1Data,
  acknowledgedUnknownFields: Tier1Field[] = [],
): Tier1Field[] {
  const acknowledged = new Set(acknowledgedUnknownFields);
  return (["category", "interestScore"] as Tier1Field[]).filter(
    (field) => calculateMissingFields(fields).includes(field) && !acknowledged.has(field),
  );
}

export function canConfirmCapture(capture: SupplierCaptureRecord): boolean {
  return Boolean(capture.fields.category) || capture.acknowledgedUnknownFields.includes("category");
}

export function setTier1Field<Field extends Tier1Field>(
  fields: Tier1Data,
  field: Field,
  value: Tier1Data[Field],
): Tier1Data {
  return normalizeTier1Data({ ...fields, [field]: value });
}
