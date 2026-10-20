import type { Fob } from "../../bot/types.ts";

export type CommercialFacts = {
  companyName: string | null;
  city: string | null;
  category: string | null;
  contact: string | null;
  productName: string | null;
  fob: Fob | null;
  quotedPrice: Fob | null;
  moq: { quantity: number | null; unit: string | null; notes: string | null } | null;
  leadTime: { days: number | null; rawText: string | null } | null;
  notes: string | null;
};

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const string = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

/** Read literal extracted fields only. A later one-word message is never a product name. */
export function commercialFactsFromReading(readingValue: unknown): CommercialFacts {
  const reading = object(readingValue);
  const segments = Array.isArray(reading.segments) ? reading.segments : [];
  const fields = segments.map((segment) => object(object(object(segment).candidate).extractedFields));
  const caption = object(object(reading.ingestion).caption);
  const products = Array.isArray(caption.products) ? caption.products.map(object) : [];
  const singleProduct = products.length === 1 ? products[0] : {};
  const first = (key: string) => fields.find((entry) => entry[key] !== undefined && entry[key] !== null)?.[key] ?? singleProduct[key] ?? null;
  const fob = object(first("fob"));
  const quotedPrice = object(first("quotedPrice"));
  const moq = object(first("moq"));
  const leadTime = object(first("leadTime"));
  return {
    companyName: string(first("companyName")), city: string(first("city")), category: string(first("category")), contact: string(first("contact")),
    productName: string(singleProduct.name),
    fob: Object.keys(fob).length ? { amount: number(fob.amount), currency: string(fob.currency), unit: string(fob.unit), rawText: string(fob.rawText) ?? "" } : null,
    quotedPrice: Object.keys(quotedPrice).length ? { amount: number(quotedPrice.amount), currency: string(quotedPrice.currency), unit: string(quotedPrice.unit), rawText: string(quotedPrice.rawText) ?? "" } : null,
    moq: Object.keys(moq).length ? { quantity: number(moq.quantity), unit: string(moq.unit), notes: string(moq.notes) } : null,
    leadTime: Object.keys(leadTime).length ? { days: number(leadTime.days), rawText: string(leadTime.rawText) } : null,
    notes: string(caption.supplierNotes) ?? string(singleProduct.notes),
  };
}

/** Preserve a literal USD quote without turning it into an Incoterm. */
export function literalQuotedPrice(value: string | null | undefined): Fob | null {
  if (!value) return null;
  for (const clause of value.split(/\.(?!\d)|(?<!\d)\.|[!?;\n]/u)) {
    if (/\bfob\b/iu.test(clause)) continue;
    const match = clause.match(/((?:USD|US\$|\$)\s*(\d+(?:[.,]\d{1,4})?)|(\d+(?:[.,]\d{1,4})?)\s*(?:USD|d[oó]lar(?:es)?))(?:\s+(cada uno|por unidad|la unidad|por pieza))?/iu);
    if (!match) continue;
    const amount = Number((match[2] ?? match[3]).replace(",", "."));
    if (!Number.isFinite(amount)) continue;
    return { amount, currency: "USD", unit: match[4] ? "unidad" : null, rawText: match[0].trim() };
  }
  return null;
}

/** Small literal fallback for short follow-up texts. It never infers an Incoterm or model. */
export function commercialFactsFromMessage(type: string, text: string | null, reading: unknown): CommercialFacts {
  const extracted = commercialFactsFromReading(reading);
  const readingObject = object(reading);
  const source = text ?? (type.toUpperCase() === "AUDIO" ? string(readingObject.transcript) : null);
  if (!source) return extracted;
  const supplier = source.match(/^\s*se llama\s+([\p{L}\p{N}][\p{L}\p{N} .,&'-]{1,118})\s*[.!]?\s*$/iu);
  const category = source.match(/\b(?:vende|fabrican?|producto(?:s)?)\s+(?:un[ao]s?\s+)?([\p{L}][\p{L} -]{2,75})\s*[.!]?\s*$/iu);
  const moq = source.match(/\bmoq\s*[:=]?\s*(\d{1,9})(?:\s+(unidades|piezas|pares|cajas|sets))?\b/iu);
  return {
    ...extracted,
    companyName: extracted.companyName ?? supplier?.[1]?.trim() ?? null,
    category: extracted.category ?? category?.[1]?.trim() ?? null,
    moq: extracted.moq ?? (moq ? { quantity: Number(moq[1]), unit: moq[2]?.toLowerCase() ?? null, notes: null } : null),
    quotedPrice: extracted.quotedPrice ?? literalQuotedPrice(source),
  };
}

export function hasProductFacts(facts: CommercialFacts): boolean {
  return Boolean(facts.productName || facts.category || facts.fob || facts.quotedPrice || facts.moq || facts.leadTime);
}

export function isCommercialMessage(type: string, text: string | null, reading: unknown): boolean {
  const normalized = (text ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
  if (type.toUpperCase() === "TEXT" && /^(?:y|y ahora\??|hay evidencias pendientes\??|hola|gracias|ok|dale|si|no|listo)[?!.\s]*$/u.test(normalized)) return false;
  const facts = commercialFactsFromMessage(type, text, reading);
  if (facts.companyName || facts.city || facts.contact || hasProductFacts(facts) || facts.notes) return true;
  if (["IMAGE", "AUDIO", "DOCUMENT", "VIDEO"].includes(type.toUpperCase())) return true;
  if (type.toUpperCase() !== "TEXT") return false;
  if (!normalized) return false;
  return /\b(?:proveedor|empresa|vende|fabrican?|se llama|valen?|cuestan?|fabrica|fabricante|producto|precio|fob|moq|usd|lead\s*time|entrega|cotizacion|pedido|unidades|contacto|wechat|tarjeta)\b/u.test(normalized);
}

export function decisionStatus(facts: CommercialFacts, decisions: Array<{ action: string; appliedFields?: unknown }>) {
  const latestDisposition = decisions.findLast((item) => item.action === "DISCARD" || item.action === "RECOVER");
  if (latestDisposition?.action === "DISCARD") return "discarded" as const;
  const activeDecisions = decisions.filter((item) => item.action !== "DISCARD" && item.action !== "RECOVER");
  const productDecisions = activeDecisions.filter((item) => ["APPLY_PRODUCT", "CREATE_PRODUCT", "AUTO_PRODUCT"].includes(item.action));
  const applied = new Set(productDecisions.flatMap((item) => Array.isArray(item.appliedFields) ? item.appliedFields.filter((field): field is string => typeof field === "string") : []));
  const required = [facts.category ? "category" : null, facts.fob ? "fob" : null, facts.quotedPrice ? "quotedPrice" : null, facts.moq ? "moq" : null, facts.leadTime ? "leadTime" : null].filter((field): field is string => Boolean(field));
  if (productDecisions.length && required.every((field) => applied.has(field)) && !productDecisions.every((item) => item.action === "AUTO_PRODUCT")) return "resolved" as const;
  if (!hasProductFacts(facts) && activeDecisions.some((item) => ["CREATE_SUPPLIER", "LINK_SUPPLIER", "APPLY_NEGOTIATION"].includes(item.action))) return "resolved" as const;
  if (!required.length && activeDecisions.some((item) => item.action === "LINK_PRODUCT" || item.action === "APPLY_NEGOTIATION")) return "resolved" as const;
  if (required.length && activeDecisions.some((item) => item.action === "APPLY_NEGOTIATION" && required.every((field) => Array.isArray(item.appliedFields) && item.appliedFields.includes(field)))) return "resolved" as const;
  return "pending" as const;
}
