export type SupplierType = "FACTORY" | "TRADING" | "UNKNOWN";
export type CaptureStatus = "DRAFT" | "CONFIRMED";

export type FobValue = {
  amount: number | null;
  currency: string;
  unit: string;
  rawText: string;
};

export type MoqValue = {
  quantity: number | null;
  unit: string;
  notes: string;
  rawText: string;
};

export type LeadTimeValue = {
  rawText: string;
  days: number | null;
};

export type SupplierCaptureDraft = {
  companyName: string;
  city: string;
  province: string;
  contact: string;
  category: string;
  supplierType: SupplierType | null;
  fob: FobValue;
  moq: MoqValue;
  leadTime: LeadTimeValue;
  interestScore: number | null;
  pendingFields: string[];
};

export type StoredSupplierCapture = SupplierCaptureDraft & {
  id: string;
  status: CaptureStatus;
  createdAt: string;
  updatedAt: string;
};

export const EMPTY_CAPTURE: SupplierCaptureDraft = {
  companyName: "",
  city: "",
  province: "",
  contact: "",
  category: "",
  supplierType: null,
  fob: { amount: null, currency: "USD", unit: "unidad", rawText: "" },
  moq: { quantity: null, unit: "unidades", notes: "", rawText: "" },
  leadTime: { rawText: "", days: null },
  interestScore: null,
  pendingFields: [],
};

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

function extractFirstNumber(value: string): number | null {
  const numeric = value.match(/\d+(?:[.,]\d+)?/);
  if (numeric) return Number(numeric[0].replace(",", "."));

  const normalized = value.toLocaleLowerCase("es");
  for (const [word, number] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(normalized)) return number;
  }
  return null;
}

export function normalizeLeadTimeToDays(rawText: string): number | null {
  const amount = extractFirstNumber(rawText);
  if (amount === null) return null;

  const normalized = rawText.toLocaleLowerCase("es");
  if (/semana|week/.test(normalized)) return Math.round(amount * 7);
  if (/mes|month/.test(normalized)) return Math.round(amount * 30);
  if (/d[ií]a|day/.test(normalized)) return Math.round(amount);
  return null;
}

export function getPendingFields(capture: SupplierCaptureDraft): string[] {
  const fields: string[] = [];
  if (!capture.companyName.trim()) fields.push("companyName");
  if (!capture.city.trim() && !capture.province.trim()) fields.push("location");
  if (!capture.contact.trim()) fields.push("contact");
  if (!capture.category.trim()) fields.push("category");
  if (!capture.supplierType || capture.supplierType === "UNKNOWN") fields.push("supplierType");
  if (capture.fob.amount === null) fields.push("fob");
  if (capture.moq.quantity === null) fields.push("moq");
  if (capture.leadTime.days === null) fields.push("leadTime");
  if (capture.interestScore === null) fields.push("interestScore");
  return fields;
}

export function prepareCapture(draft: SupplierCaptureDraft): SupplierCaptureDraft {
  const leadTime = {
    rawText: draft.leadTime.rawText.trim(),
    days: normalizeLeadTimeToDays(draft.leadTime.rawText),
  };
  const normalized = { ...draft, leadTime };
  return { ...normalized, pendingFields: getPendingFields(normalized) };
}

export const CAPTURE_STORAGE_KEY = "nihao:supplier-captures:v1";
