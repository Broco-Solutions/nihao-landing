import type { ExtractionCandidate, FieldEvidence, LeadTime, Moq, Fob, Tier1Field } from "./types.ts";

/** Shared Comex vocabulary. Keep this source of truth independent of prompts. */
export const COMMERCIAL_GLOSSARY = {
  MOQ: "Minimum Order Quantity: cantidad mínima de pedido, normalmente expresada en unidades o composición de variantes.",
  FOB: "Free On Board: precio con Incoterm FOB; conservar importe, moneda y unidad sólo si están expresados.",
  LEAD_TIME: "Plazo de fabricación o entrega; semanas se convierten a días multiplicando por siete.",
  OTHER_INCOTERMS: ["EXW", "CIF", "CFR", "DAP", "DDP"] as const,
  TERMS: ["OEM", "ODM", "muestra", "personalización", "packaging", "certificación", "condiciones de pago", "HS Code"] as const,
} as const;

export const COMMERCIAL_EXTRACTION_INSTRUCTIONS = [
  COMMERCIAL_GLOSSARY.MOQ,
  COMMERCIAL_GLOSSARY.FOB,
  COMMERCIAL_GLOSSARY.LEAD_TIME,
  "Separá condiciones comerciales de marcas, modelos, SKU, proveedores y nombres de productos.",
  "No conviertas MOC-200 en MOQ: puede ser un modelo. MOC 200 sin contexto suficiente queda en revisión.",
  "No inventes moneda, unidad, proveedor, producto ni Incoterm.",
].join(" ");

const NUMBER_WORDS: Record<string, number> = {
  cero: 0, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, cien: 100, ciento: 100,
  doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300,
};

function numberValue(value: string): number | null {
  const normalized = value.trim().toLocaleLowerCase("es");
  if (NUMBER_WORDS[normalized] !== undefined) return NUMBER_WORDS[normalized];
  const parsed = Number(normalized.replace(/\.(?=\d{3}(?:\D|$))/gu, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function evidence(field: Tier1Field, text: string, confidence = 1): FieldEvidence {
  return { field, evidence: text.trim(), confidence };
}

function amountValue(value: string): number | null {
  const parsed = Number(value.replace(/\.(?=\d{3}(?:\D|$))/gu, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function currency(value: string | undefined): string | null {
  if (!value) return null;
  if (/USD|US\$|d[oó]lar/iu.test(value)) return "USD";
  if (/EUR|euro/iu.test(value)) return "EUR";
  if (/CNY|yuan/iu.test(value)) return "CNY";
  return value.toUpperCase();
}

export type CommercialFacts = {
  fob?: Fob;
  moq?: Moq;
  leadTime?: LeadTime;
  ambiguousMoq?: string;
  incoterm?: string;
  evidence: FieldEvidence[];
};

/** Extracts only high-signal commercial facts from original text/transcript. */
export function extractCommercialFacts(text: string): CommercialFacts {
  const result: CommercialFacts = { evidence: [] };
  const source = text.trim();
  const moq = source.match(/\b(?:MOQ|M[-\s]?O[-\s]?Q|minimum\s+order\s+quantity|cantidad\s+m[ií]nima(?:\s+de\s+pedido)?|pedido\s+m[ií]nimo)\b\s*(?::|=|es|de)?\s*([\d.,]+|[a-záéíóú]+)(?:\s*(?:unidades?|units?|piezas?|pares?|pcs?))?/iu);
  const phoneticMoq = source.match(/\b(?:eme\s+o\s+cu|moc)\s*(?::|=|es|de)?\s*(\d[\d.,]*|[a-záéíóú]+)/iu);
  const hasModelLikeMoc = /\bmoc\s*[-/]\s*\d/iu.test(source);
  const conflictingMoqSignals = Boolean(moq && hasModelLikeMoc);
  const explicitMoq = conflictingMoqSignals ? null : moq ?? (phoneticMoq && /pedido|order|mínim|minim|cantidad/iu.test(source) ? phoneticMoq : null);
  if (explicitMoq) {
    const quantity = numberValue(explicitMoq[1]);
    const unitMatch = explicitMoq[0].match(/\b(unidades?|units?|piezas?|pares?|pcs?)\b/iu);
    if (quantity !== null) {
      result.moq = { quantity: Math.trunc(quantity), unit: unitMatch?.[1] ?? "unidades", notes: null, rawText: explicitMoq[0].trim().replace(/[,:;.]$/u, "") };
      result.evidence.push(evidence("moq", explicitMoq[0]));
    }
  } else if (phoneticMoq || conflictingMoqSignals) {
    result.ambiguousMoq = (phoneticMoq?.[0] ?? moq?.[0] ?? "MOQ/MOC").trim();
    result.evidence.push(evidence("moq", result.ambiguousMoq, 0.35));
  }

  const composition = source.match(/(?:MOQ|pedido\s+m[ií]nimo|m[ií]nimo)[^.!?\n]{0,80}?([\d.,]+|[a-záéíóú]+)\s+(?:negras?|rojas?|blancas?|azules?|de\s+la\s+variante|de\s+cada)/iu);
  if (result.moq && composition) result.moq.notes = composition[0].trim();

  const incoterm = source.match(/\b(FOB|EXW|CIF|CFR|DAP|DDP)\b/iu);
  if (incoterm) result.incoterm = incoterm[1].toUpperCase();
  const fob = source.match(/\bFOB\b\s*(?:de|es|:)?\s*([\d]+(?:[.,]\d+)?)\s*(USD|US\$|EUR|CNY|d[oó]lares?|euros?|yuan(?:es)?)?(?:\s*(?:por\s+|\/\s*)([\p{L}]+))?/iu);
  if (fob) {
    const amount = amountValue(fob[1]);
    if (amount !== null) {
      const unit = fob[3] ?? fob[4] ?? null;
      result.fob = { amount, currency: currency(fob[2]), unit, rawText: fob[0].trim().replace(/[,:;.]$/u, "") };
      result.evidence.push(evidence("fob", fob[0]));
    }
  }

  const lead = source.match(/(?:lead\s*time|plazo|tarda|demora|fabricar|fabricaci[oó]n)[^.!?\n]{0,35}?((?:\d+(?:[.,]\d+)?|una?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|quince|veinte|treinta)\s*(?:d[ií]as?|semanas?|weeks?|days?|mes(?:es)?|months?))/iu);
  if (lead) {
    const amount = numberValue(lead[1].replace(/\s*(?:d[ií]as?|semanas?|weeks?|days?|mes(?:es)?|months?).*$/iu, ""));
    const days = amount === null ? null : /seman|week/iu.test(lead[1]) ? Math.round(amount * 7) : /mes|month/iu.test(lead[1]) ? Math.round(amount * 30) : Math.round(amount);
    result.leadTime = { rawText: lead[1].trim(), days };
    result.evidence.push(evidence("leadTime", lead[1]));
  }
  return result;
}

function suspiciousCommercialName(value: unknown): boolean {
  return typeof value === "string" && /^(?:moc|moq|m[-\s]?o[-\s]?q|fon)\s*[-:]?\s*\d/i.test(value.trim());
}

/** Applies literal commercial evidence and removes model-only hallucinations. */
export function applyCommercialFacts(text: string, candidate: ExtractionCandidate): ExtractionCandidate {
  const facts = extractCommercialFacts(text);
  const extractedFields = { ...candidate.extractedFields };
  const reviewFields = new Set(candidate.reviewFields);
  const evidence = candidate.evidence.filter(item => !["fob", "moq", "leadTime"].includes(item.field));
  const ambiguousFon = /^\s*fon\s*:?.*$/imu.test(text) && /\bFOB\b/iu.test(text);
  if (facts.fob && !ambiguousFon) { extractedFields.fob = facts.fob; reviewFields.delete("fob"); evidence.push(...facts.evidence.filter(item => item.field === "fob")); }
  else if (ambiguousFon) { delete extractedFields.fob; reviewFields.add("fob"); }
  else if (facts.incoterm && facts.incoterm !== "FOB") { delete extractedFields.fob; reviewFields.delete("fob"); }
  else if (text.trim() && !/\bFOB\b/iu.test(text)) { delete extractedFields.fob; reviewFields.delete("fob"); }
  if (facts.moq) { extractedFields.moq = facts.moq; reviewFields.delete("moq"); evidence.push(...facts.evidence.filter(item => item.field === "moq")); }
  else if (facts.ambiguousMoq) { delete extractedFields.moq; reviewFields.add("moq"); evidence.push(...facts.evidence.filter(item => item.field === "moq")); }
  else if (text.trim() && !/(?:MOQ|minimum\s+order\s+quantity|pedido\s+m[ií]nimo|cantidad\s+m[ií]nima)/iu.test(text)) { delete extractedFields.moq; reviewFields.delete("moq"); }
  if (facts.leadTime) { extractedFields.leadTime = facts.leadTime; reviewFields.delete("leadTime"); evidence.push(...facts.evidence.filter(item => item.field === "leadTime")); }
  if (suspiciousCommercialName(extractedFields.category) || suspiciousCommercialName(extractedFields.companyName)) {
    delete extractedFields.category;
    reviewFields.add("category");
  }
  return { ...candidate, extractedFields, reviewFields: [...reviewFields], evidence };
}
