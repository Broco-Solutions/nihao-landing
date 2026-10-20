import type { CommercialFacts } from "./commercial-review.ts";

export type EvidencePreviewSource = {
  type: string;
  text?: string | null;
  transcript?: string | null;
  ocr?: string | null;
  visual?: string | null;
  facts: CommercialFacts;
};

const short = (value: string, limit = 140) => {
  const clean = value.replace(/\s+/gu, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit - 1).trimEnd()}…` : clean;
};

const contentType = (type: string) => ({ AUDIO: "Audio", IMAGE: "Fotografía", DOCUMENT: "Documento", VIDEO: "Video", TEXT: "Mensaje" })[type.toUpperCase() as "AUDIO" | "IMAGE" | "DOCUMENT" | "VIDEO" | "TEXT"] ?? "Mensaje";

function detail(facts: CommercialFacts) {
  if (facts.quotedPrice?.amount !== null && facts.quotedPrice?.amount !== undefined) {
    const price = facts.quotedPrice;
    return `Precio cotizado: ${price.currency ? `${price.currency} ` : "moneda pendiente · "}${price.amount}${price.unit ? ` / ${price.unit}` : ""}.`;
  }
  if (facts.fob?.amount !== null && facts.fob?.amount !== undefined) {
    const fob = facts.fob;
    return `FOB explícito: ${fob.currency ? `${fob.currency} ` : "moneda pendiente · "}${fob.amount}${fob.unit ? ` / ${fob.unit}` : ""}.`;
  }
  if (facts.moq?.quantity !== null && facts.moq?.quantity !== undefined) return `MOQ: ${facts.moq.quantity}${facts.moq.unit ? ` ${facts.moq.unit}` : " (unidad pendiente)"}.`;
  return null;
}

export function evidencePreview(message: EvidencePreviewSource) {
  const { facts } = message;
  const kind = contentType(message.type);
  const title = facts.productName && facts.companyName ? `${facts.productName} — ${facts.companyName}`
    : facts.productName ?? facts.companyName ?? (facts.category ? `Consulta sobre ${facts.category}` : null)
    ?? (message.type.toUpperCase() === "IMAGE" ? "Fotografía pendiente de identificar" : `${kind} pendiente de revisar`);
  const literal = message.text ?? message.transcript ?? message.ocr ?? message.visual;
  const summary = detail(facts) ?? (literal ? short(literal) : facts.companyName && !facts.productName
    ? `${kind}. Se identificó un proveedor, pero no un producto.`
    : `No se obtuvieron datos suficientes. ${kind === "Fotografía" ? "Original disponible para revisar." : "Revisá la fuente original."}`);
  return { title: short(title, 100), summary, kind };
}

export function negotiationPreview(messages: EvidencePreviewSource[]) {
  const names = (key: "companyName" | "productName" | "category") => [...new Set(messages.map((message) => message.facts[key]).filter((value): value is string => Boolean(value)))];
  const suppliers = names("companyName"), products = names("productName"), categories = names("category");
  const ambiguous = suppliers.length > 1 || products.length > 1 || categories.length > 1;
  const title = ambiguous ? "Negociación con datos por separar" : products.length && suppliers.length ? `${products[0]} — ${suppliers[0]}`
    : products[0] ?? suppliers[0] ?? (categories[0] ? `Consulta sobre ${categories[0]}` : "Negociación pendiente de revisar");
  const highlights = messages.map((message) => detail(message.facts)).filter((value): value is string => Boolean(value));
  const distinct = [...new Set(highlights)];
  const literal = messages.map((message) => message.text ?? message.transcript ?? message.ocr ?? message.visual).find((value): value is string => Boolean(value));
  const summary = ambiguous ? "Hay proveedores, productos o categorías diferentes. Seleccioná las fuentes que correspondan."
    : distinct.length === 1 ? distinct[0] : distinct.length > 1 ? "Hay varias condiciones comerciales. Revisá cada fuente."
    : literal ? short(literal) : "Revisá las fuentes originales antes de decidir.";
  const counts = [...new Set(messages.map((message) => contentType(message.type)))];
  return { title: short(title, 100), summary, kinds: counts.join(" · "), ambiguous };
}
