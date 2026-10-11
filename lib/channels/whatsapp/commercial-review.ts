export type CommercialFacts = {
  companyName: string | null;
  city: string | null;
  category: string | null;
  contact: string | null;
  productName: string | null;
  fob: { amount: number | null; currency: string | null; unit: string | null } | null;
  quotedPrice: { amount: number | null; currency: string | null; unit: string | null } | null;
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
    fob: Object.keys(fob).length ? { amount: number(fob.amount), currency: string(fob.currency), unit: string(fob.unit) } : null,
    quotedPrice: Object.keys(quotedPrice).length ? { amount: number(quotedPrice.amount), currency: string(quotedPrice.currency), unit: string(quotedPrice.unit) } : null,
    moq: Object.keys(moq).length ? { quantity: number(moq.quantity), unit: string(moq.unit), notes: string(moq.notes) } : null,
    leadTime: Object.keys(leadTime).length ? { days: number(leadTime.days), rawText: string(leadTime.rawText) } : null,
    notes: string(caption.supplierNotes) ?? string(singleProduct.notes),
  };
}

/** Small literal fallback for short follow-up texts. It never infers an Incoterm or model. */
export function commercialFactsFromMessage(type: string, text: string | null, reading: unknown): CommercialFacts {
  const extracted = commercialFactsFromReading(reading);
  if (type.toUpperCase() !== "TEXT" || !text) return extracted;
  const supplier = text.match(/^\s*se llama\s+([\p{L}\p{N}][\p{L}\p{N} .,&'-]{1,118})\s*[.!]?\s*$/iu);
  const category = text.match(/\b(?:vende|fabrican?|producto(?:s)?)\s+(?:un[ao]s?\s+)?([\p{L}][\p{L} -]{2,75})\s*[.!]?\s*$/iu);
  const moq = text.match(/\bmoq\s*[:=]?\s*(\d{1,9})(?:\s+(unidades|piezas|pares|cajas|sets))?\b/iu);
  const price = text.match(/\b(?:valen?|cuestan?|precio(?:\s+cotizado)?)\s*[:=]?\s*(?:usd\s*)?(\d+(?:[.,]\d{1,4})?)\s*(usd|d[oó]lares)(?:\s+(cada uno|por unidad|la unidad|por pieza))?/iu);
  return {
    ...extracted,
    companyName: extracted.companyName ?? supplier?.[1]?.trim() ?? null,
    category: extracted.category ?? category?.[1]?.trim() ?? null,
    moq: extracted.moq ?? (moq ? { quantity: Number(moq[1]), unit: moq[2]?.toLowerCase() ?? null, notes: null } : null),
    quotedPrice: extracted.quotedPrice ?? (price ? { amount: Number(price[1].replace(",", ".")), currency: "USD", unit: price[3] ? "unidad" : null } : null),
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
  if (decisions.some((item) => item.action === "DISCARD")) return "resolved" as const;
  const productDecisions = decisions.filter((item) => ["APPLY_PRODUCT", "CREATE_PRODUCT", "AUTO_PRODUCT"].includes(item.action));
  const applied = new Set(productDecisions.flatMap((item) => Array.isArray(item.appliedFields) ? item.appliedFields.filter((field): field is string => typeof field === "string") : []));
  const required = [facts.category ? "category" : null, facts.fob ? "fob" : null, facts.quotedPrice ? "quotedPrice" : null, facts.moq ? "moq" : null, facts.leadTime ? "leadTime" : null].filter((field): field is string => Boolean(field));
  if (productDecisions.length && required.every((field) => applied.has(field)) && !productDecisions.every((item) => item.action === "AUTO_PRODUCT")) return "resolved" as const;
  if (!hasProductFacts(facts) && decisions.some((item) => ["CREATE_SUPPLIER", "LINK_SUPPLIER", "APPLY_NEGOTIATION"].includes(item.action))) return "resolved" as const;
  if (!required.length && decisions.some((item) => item.action === "LINK_PRODUCT" || item.action === "APPLY_NEGOTIATION")) return "resolved" as const;
  if (required.length && decisions.some((item) => item.action === "APPLY_NEGOTIATION" && required.every((field) => Array.isArray(item.appliedFields) && item.appliedFields.includes(field)))) return "resolved" as const;
  return "pending" as const;
}
