export type CommercialFacts = {
  companyName: string | null;
  city: string | null;
  category: string | null;
  contact: string | null;
  productName: string | null;
  fob: { amount: number | null; currency: string | null; unit: string | null } | null;
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
  const moq = object(first("moq"));
  const leadTime = object(first("leadTime"));
  return {
    companyName: string(first("companyName")), city: string(first("city")), category: string(first("category")), contact: string(first("contact")),
    productName: string(singleProduct.name),
    fob: Object.keys(fob).length ? { amount: number(fob.amount), currency: string(fob.currency), unit: string(fob.unit) } : null,
    moq: Object.keys(moq).length ? { quantity: number(moq.quantity), unit: string(moq.unit), notes: string(moq.notes) } : null,
    leadTime: Object.keys(leadTime).length ? { days: number(leadTime.days), rawText: string(leadTime.rawText) } : null,
    notes: string(caption.supplierNotes) ?? string(singleProduct.notes),
  };
}

export function hasProductFacts(facts: CommercialFacts): boolean {
  return Boolean(facts.productName || facts.category || facts.fob || facts.moq || facts.leadTime);
}

export function isCommercialMessage(type: string, text: string | null, reading: unknown): boolean {
  const normalized = (text ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
  if (type.toUpperCase() === "TEXT" && /^(?:y|y ahora\??|hay evidencias pendientes\??|hola|gracias|ok|dale|si|no|listo)[?!.\s]*$/u.test(normalized)) return false;
  const facts = commercialFactsFromReading(reading);
  if (facts.companyName || facts.city || facts.contact || hasProductFacts(facts) || facts.notes) return true;
  if (["IMAGE", "AUDIO", "DOCUMENT", "VIDEO"].includes(type.toUpperCase())) return true;
  if (type.toUpperCase() !== "TEXT") return false;
  if (!normalized) return false;
  return /\b(?:proveedor|fabrica|fabricante|producto|precio|fob|moq|usd|lead\s*time|entrega|cotizacion|pedido|unidades|contacto|wechat|tarjeta)\b/u.test(normalized);
}

export function decisionStatus(facts: CommercialFacts, decisions: Array<{ action: string; appliedFields?: unknown }>) {
  if (decisions.some((item) => item.action === "DISCARD")) return "resolved" as const;
  const productDecisions = decisions.filter((item) => ["APPLY_PRODUCT", "CREATE_PRODUCT", "AUTO_PRODUCT"].includes(item.action));
  const applied = new Set(productDecisions.flatMap((item) => Array.isArray(item.appliedFields) ? item.appliedFields.filter((field): field is string => typeof field === "string") : []));
  const required = [facts.category ? "category" : null, facts.fob ? "fob" : null, facts.moq ? "moq" : null, facts.leadTime ? "leadTime" : null].filter((field): field is string => Boolean(field));
  if (productDecisions.length && (productDecisions.some((item) => item.action === "AUTO_PRODUCT") || required.every((field) => applied.has(field)))) return "resolved" as const;
  if (!hasProductFacts(facts) && decisions.some((item) => ["CREATE_SUPPLIER", "LINK_SUPPLIER", "AUTO_SUPPLIER"].includes(item.action))) return "resolved" as const;
  return "pending" as const;
}
