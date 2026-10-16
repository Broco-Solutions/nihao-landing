import type { BurstSnapshot } from "./burst-types.ts";
import type { AgentReceipt, AgentQuestion, AgentState } from "./agent-contract.ts";

/** Presentation only: preserve option IDs/order and literal product names. */
export function formatQuestion(text: string): string {
  return text.trim().replace(/\r\n/gu, "\n").replace(/\s+(?:Además|Ademas|También|Tambien)\s*[:,]?\s*/gu, "\n\n").replace(/(?<=\?)\s+(?=[¿A-ZÁÉÍÓÚ])/gu, "\n\n");
}

/** Presentation only: normalize sentence starts without changing names, URLs or option values. */
export function polishUserFacingText(text: string): string {
  const capitalize = (value: string) => value.replace(/^(\s*)(\p{Ll})/u, (_match, spacing: string, letter: string) => `${spacing}${letter.toLocaleUpperCase("es")}`);
  return text.split("\n").map((line) => {
    if (/^\s*(?:https?:\/\/|www\.)/iu.test(line) || /^\s*\d+\.\s/u.test(line)) return line;
    const namedBullet = /^(\s*•\s+\*[^*]+:\*\s*)(.*)$/u.exec(line);
    if (namedBullet) return namedBullet[1] + capitalize(namedBullet[2]);
    const bullet = /^(\s*•\s+)(.*)$/u.exec(line);
    if (bullet) return bullet[1] + capitalize(bullet[2]);
    return capitalize(line);
  }).join("\n");
}
const fieldLabels: Record<string, string> = { companyName: "Nombre", name: "Nombre", contact: "Contacto", email: "Correo", phone: "Teléfono", city: "Ciudad", province: "Provincia", category: "Categoría", supplierType: "Tipo de proveedor", status: "Estado", fob: "FOB", moq: "MOQ", leadTime: "Entrega", interestScore: "Interés", description: "Descripción", website: "Sitio web" };
function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "sin datos";
  if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${fieldLabels[key] ?? key}: ${displayValue(item)}`).join("; ");
  return ({ DRAFT: "borrador", CONFIRMED: "confirmado", NEEDS_REVIEW: "necesita confirmación", FACTORY: "fábrica", TRADER: "comercializador", UNKNOWN: "por confirmar" } as Record<string, string>)[String(value)] ?? String(value);
}
export function userQuestion(text: string): string {
  text = text.replace(/\*\*([^\n]+?)\*\*/gu, "*$1*").replace(/^Necesito confirmar algunos datos:/u, "❓ Necesito confirmar algunos datos:");
  text = text.replace(/^(Actual|Nuevo): (\{[^\n]*\})$/gmu, (_line, title: string, json: string) => {
    try { return `${title}:\n${Object.entries(JSON.parse(json)).map(([key, value]) => `• ${fieldLabels[key] ?? key}: ${displayValue(value)}`).join("\n")}`; } catch { return `${title}: datos por confirmar`; }
  });
  if (/^Quedaron \d+ evidencias para revisar/u.test(text)) return "❓ Necesito confirmar algunos datos:\n\n• No pude leer con claridad algunas imágenes. Los originales siguen guardados; podés reenviarlas con mejor calidad.";
  const formatted = /(?:^|\n)• /u.test(text) ? text.trim().replace(/\r\n/gu, "\n") : formatQuestion(text);
  return polishUserFacingText(formatted.replace(/Alcancé el límite de rondas de esta ráfaga\./gu, "Necesito continuar con el procesamiento.").replace(/a qué carga/giu, "a qué proveedor o producto").replace(/esta ráfaga/giu, "estos datos").replace(/Las cargas terminadas y las evidencias siguen guardadas\./gu, "La información que pude guardar se conservó.").replace(/Las evidencias originales siguen guardadas\./gu, "Las imágenes originales siguen guardadas.").replace(/revisá la carga/giu, "revisá los datos"));
}

const responseParagraphs = (text: string) => text.trim().replace(/\r\n/gu, "\n").split(/\n{2,}/u).map((paragraph) => paragraph.trim()).filter(Boolean);

/**
 * Compose independently rendered user-facing sections without repeating an
 * identical section that is already present on paragraph boundaries. This is
 * intentionally narrower than text-level deduplication: distinct questions
 * for separate cards remain intact, even when they share a heading.
 */
export function composeTravelerResponse(...sections: Array<string | null | undefined>): string {
  const paragraphs: string[] = [];
  for (const section of sections) {
    if (!section?.trim()) continue;
    const candidate = responseParagraphs(section);
    const alreadyIncluded = candidate.length <= paragraphs.length && paragraphs.some((_paragraph, start) =>
      start + candidate.length <= paragraphs.length && candidate.every((value, offset) => paragraphs[start + offset] === value));
    if (alreadyIncluded) continue;
    // A durable review outcome may repeat the rendered receipts and add a
    // final instruction. Retain only that new suffix. Do not merge on a lone
    // common heading: separate clarifications can legitimately share one.
    const overlap = Array.from({ length: Math.min(paragraphs.length, candidate.length) }, (_, index) => index + 1)
      .reverse()
      .find((size) => size >= 2 && candidate.slice(0, size).every((value, index) => paragraphs.at(-size + index) === value)) ?? 0;
    paragraphs.push(...candidate.slice(overlap));
  }
  return paragraphs.join("\n\n");
}
const confirmationHeading = "❓ Necesito confirmar algunos datos:";
/** Keep all requested fields together in one bullet for the saved card/product. */
export function renderDraftConfirmation(name: string, needs: string[]): string {
  const fields = [...new Set(needs)];
  if (!fields.length) return "";
  const request = fields.length > 1 ? `${fields.slice(0, -1).join(", ")} y ${fields.at(-1)}` : fields[0];
  return `*${name}:* Necesito confirmar ${request}.`;
}
export function renderConfirmation(doubts: string[]): string {
  return doubts.length ? `${confirmationHeading}\n\n${doubts.map(doubt => doubt.startsWith("• ") ? doubt : `• ${doubt}`).join("\n\n")}` : "";
}
export function renderClarification(question: Pick<AgentQuestion, "text" | "options" | "products" | "contextSelection">): string {
  const { options, products = [] } = question;
  const sections: string[] = [];
  const text = userQuestion(question.text);
  const associationIntro = /^(?:Necesito confirmar las asociaciones\.?|¿A qué proveedor pertenece cada producto\?|Contexto y productos)$/u.test(question.text);
  const doubts: string[] = [];
  if (question.contextSelection) {
    sections.push("📍 Viaje\n\n" + text);
    if (options.length) sections.push(options.map((o, i) => `${i + 1}. ${o.label}`).join("\n"));
  } else if (!products.length || !associationIntro) {
    const body = text.startsWith(`${confirmationHeading}\n\n`) ? text.slice(confirmationHeading.length + 2) : text;
    if (products.length === 1) doubts.push(`*${products[0].name}:* ${body.replace(/\n+/gu, " ")}`);
    else doubts.push(...body.split("\n\n"));
  }
  if (products.length && (products.length > 1 || question.contextSelection || associationIntro)) {
    doubts.push(...products.map(p => `*${p.name}:* ${p.supplierQuery ? `¿Pertenece a ${p.supplierQuery}?` : "¿A qué proveedor pertenece?"}`));
  }
  sections.push(renderConfirmation(doubts));
  if (!question.contextSelection && options.length) sections.push(options.map((o, i) => `${i + 1}. ${o.label}`).join("\n"));
  if (options.length) sections.push('Podés responder: "1".' + (question.contextSelection && products.length ? " También podés responder las asociaciones en líneas separadas citando este mensaje." : ""));
  else if (products.length > 1) sections.push("Podés responder una asociación por línea, por ejemplo:\n\n" + products.map(p => `${p.name} → ${p.supplierQuery ?? "nombre del proveedor"}`).join("\n"));
  return sections.filter(Boolean).join("\n\n");
}
type BatchSummary = { totalAssets: number; totalLogicalLoads: number; processed: number; pending: number; needsReview: number; failed: number };
type RenderOptions = { includeDraftNavigation?: boolean };
const namedResult = (count: number, singular: string, plural: string, records: AgentReceipt[]) => {
  if (!count) return "";
  const names = [...new Set(records.map((record) => record.name?.trim()).filter((name): name is string => Boolean(name)))];
  const visible = names.slice(0, 5).map((name) => `«${name}»`).join(", ");
  const remaining = names.length > 5 ? ` y ${names.length - 5} más` : "";
  return `${count} ${count === 1 ? singular : plural}${visible ? `: ${visible}${remaining}` : ""}`;
};
function commercialFacts(record: AgentReceipt): string {
  if (!record.tool.includes("product")) return "";
  const fields = record.data?.fields as Record<string, unknown> | undefined;
  if (!fields) return "";
  const fob = fields.fob as { amount?: unknown; currency?: unknown; unit?: unknown } | null | undefined;
  const moq = fields.moq as { quantity?: unknown; unit?: unknown } | null | undefined;
  const review = new Set(Array.isArray(fields.reviewFields) ? fields.reviewFields.filter((field): field is string => typeof field === "string") : []);
  const items: string[] = [];
  if (typeof fob?.amount === "number") items.push(`FOB: ${typeof fob.currency === "string" ? `${fob.currency} ` : ""}${fob.amount}${typeof fob.unit === "string" && fob.unit ? ` por ${fob.unit}` : ""}${review.has("fob") ? " (a revisar)" : ""}.`);
  if (typeof moq?.quantity === "number") items.push(`MOQ: ${moq.quantity}${typeof moq.unit === "string" && moq.unit ? ` ${moq.unit}` : ""}${review.has("moq") ? " (a revisar)" : ""}.`);
  return items.length ? `• *${record.name ?? "Producto"}:* ${items.join(" ")}` : "";
}

export function renderSavedResults(receipts: AgentReceipt[], question?: string | null, revision?: number, snapshot?: BurstSnapshot, batchSummary?: BatchSummary, options: RenderOptions = {}): string {
  const resourceStatus = (record: AgentReceipt): "DRAFT" | "CONFIRMED" | undefined => record.resourceStatus
    ?? (["create_supplier_draft", "create_product_draft"].includes(record.tool) ? "DRAFT" : undefined)
    ?? (["resolve_existing_resource", "resolve_existing_product"].includes(record.tool) ? "CONFIRMED" : undefined);
  const stored = new Map<string, AgentReceipt>();
  const updates: AgentReceipt[] = [];
  for (const r of receipts.filter(r => r.status === "COMPLETED" && (revision === undefined || r.completedRevision === undefined || r.completedRevision === revision))) {
    if (r.tool === "preserve_product_facts") { updates.push(r); continue; }
    const kind = r.tool.includes("product") ? "product" : "supplier";
    const key = `${kind}:${kind === "product" ? r.id : r.captureId ?? r.id}`;
    if (["create_supplier_draft", "create_product_draft", "resolve_existing_resource", "resolve_existing_product"].includes(r.tool) || stored.has(key)) stored.set(key, r);
    else updates.push(r);
  }
  const suppliers = [...stored.values()].filter(r => r.tool !== "create_product_draft" && r.tool !== "update_product" && r.tool !== "resolve_existing_product");
  const products = [...stored.values()].filter(r => r.tool === "create_product_draft" || r.tool === "update_product" || r.tool === "resolve_existing_product");
  // Older receipts predate resourceStatus. Keep their semantics explicit so a
  // legacy draft cannot disappear from the response or produce "Todo listo".
  const drafts = [...stored.values()].filter(r => resourceStatus(r) === "DRAFT");
  const confirmedSuppliers = suppliers.filter((record) => resourceStatus(record) === "CONFIRMED");
  const draftSuppliers = suppliers.filter((record) => resourceStatus(record) === "DRAFT");
  const confirmedProducts = products.filter((record) => resourceStatus(record) === "CONFIRMED");
  const draftProducts = products.filter((record) => resourceStatus(record) === "DRAFT");
  const counts = [
    confirmedSuppliers.length ? `✅ ${namedResult(confirmedSuppliers.length, "proveedor cargado y confirmado", "proveedores cargados y confirmados", confirmedSuppliers)}` : "",
    draftSuppliers.length ? `📝 ${namedResult(draftSuppliers.length, "proveedor cargado como borrador para revisión", "proveedores cargados como borradores para revisión", draftSuppliers)}` : "",
    confirmedProducts.length ? `✅ ${namedResult(confirmedProducts.length, "producto cargado y confirmado", "productos cargados y confirmados", confirmedProducts)}` : "",
    draftProducts.length ? `📦 ${namedResult(draftProducts.length, "producto cargado como borrador para revisión", "productos cargados como borradores para revisión", draftProducts)}` : "",
  ].filter(Boolean).join("\n\n");
  const doubts = drafts.map(r => {
    const fields = new Set<string>();
    const labels: Record<string, string> = { phone: "el teléfono", phones: "el teléfono", email: "el correo electrónico", emails: "el correo electrónico", companyName: "el nombre del proveedor", company: "el nombre del proveedor", address: "la dirección", website: "el sitio web", websites: "el sitio web", personName: "el nombre del contacto" };
    const loads = snapshot?.state.ingestion?.loads.filter(l => r.logicalLoadIds?.includes(l.id) || l.resourceId === r.id || l.resourceId === r.captureId) ?? [];
    for (const message of snapshot?.messages.filter(m => loads.some(l => l.assetIds.includes(m.id))) ?? []) {
      const reading = message.reading?.ingestion;
      for (const field of reading?.classification?.card?.uncertainFields ?? []) if (labels[field]) fields.add(labels[field]);
      for (const field of reading?.reconciliation?.second?.disagreements ?? reading?.reconciliation?.first.disagreements ?? []) if (labels[field]) fields.add(labels[field]);
    }
    if (Array.isArray(r.data?.possibleSuppliers) && r.data.possibleSuppliers.length) fields.add("a qué proveedor corresponde esta tarjeta");
    if (!r.name || r.tool.includes("product") && r.name.trim() === "Producto sin nombre") fields.add(r.tool.includes("product") ? "el nombre del producto" : "el nombre del proveedor");
    const doubt = renderDraftConfirmation(r.name ?? (r.tool.includes("product") ? "Producto sin nombre" : "Tarjeta sin nombre"), [...fields]);
    return doubt ? `• ${doubt}` : "";
  });
  const changes = updates.map(r => r.tool === "preserve_product_facts" ? `📝 Condiciones guardadas para el próximo producto de «${r.name ?? "este proveedor"}»: ${r.data?.text ?? ""}.` : `✅ ${r.tool.includes("product") ? "Producto" : "Proveedor"} «${r.name ?? "seleccionado"}» actualizado${r.confirmationReason ? " y confirmado" : ""}.`);
  const terms = products.map(commercialFacts).filter(Boolean);
  const renderedQuestion = question ? userQuestion(question) : "";
  const dataQuestion = renderedQuestion.startsWith(`${confirmationHeading}\n\n`) ? renderedQuestion.slice(confirmationHeading.length + 2) : "";
  // Fold a named follow-up into its saved record's bullet. Names shared by
  // separate records stay separate; a product question never folds into a supplier.
  const pendingProducts = (snapshot?.state as AgentState | undefined)?.agent?.pending?.products ?? [];
  const remaining: string[] = [];
  for (const block of dataQuestion.split("\n\n").filter(Boolean)) {
    const match = /^• \*(.+?):\* (.+)$/u.exec(block);
    const records = match ? [...stored.values()].filter(r => r.name === match[1]) : [];
    const record = records.length === 1 ? records[0] : null;
    const productQuestion = match && pendingProducts.some(p => p.name === match[1]);
    const index = record && !(productQuestion && !record.tool.includes("product")) ? drafts.indexOf(record) : -1;
    if (index >= 0 && match) {
      const body = doubts[index] || `• *${match[1]}:*`;
      if (!body.includes(match[2])) doubts[index] = `${body} ${match[2]}`;
    } else remaining.push(block);
  }
  const confirmation = [...doubts, ...remaining].filter(Boolean).join("\n\n");
  const unexplainedDrafts = drafts.filter((record) => !doubts[drafts.indexOf(record)]);
  const draftNote = unexplainedDrafts.length && options.includeDraftNavigation !== false
    ? `Hay información que todavía necesita revisión${draftSuppliers.length ? "; al proveedor le falta un correo o teléfono para quedar confirmado" : ""}. Abrí Nihao → tu viaje → Pendientes.`
    : "";
  const summary = batchSummary ?? snapshot?.state.ingestion?.summary;
  const operationalNotes = (summary?.failed || summary?.needsReview) && !question && !confirmation
    ? `No pude identificar o completar algunos datos con seguridad. ${originalsNotice(snapshot)} Revisalos en Nihao.`
    : "";
  const hasPending = Boolean(drafts.length || question || confirmation || summary?.pending || summary?.needsReview || summary?.failed);
  const storedOriginals = drafts.length && snapshot?.messages.some((message) => message.envelope.type === "IMAGE") ? originalsNotice(snapshot) : "";
  // A terminal review outcome can already contain the receipt-derived summary.
  // Compose at paragraph boundaries so adding it as the pending question does
  // not repeat saved suppliers/products and the review navigation in one bubble.
  return composeTravelerResponse(
    counts,
    ...terms,
    ...changes,
    draftNote,
    storedOriginals,
    operationalNotes,
    confirmation ? `${confirmationHeading}\n\n${confirmation}` : "",
    dataQuestion ? "" : renderedQuestion,
    counts && !hasPending ? "Todo listo." : "",
  );
}
export function renderBatchSummary(summary: BatchSummary, receipts: AgentReceipt[] = [], question?: string | null, snapshot?: BurstSnapshot): string {
  return renderSavedResults(receipts, question, undefined, snapshot, summary) || (summary.failed || summary.needsReview
    ? `No pude identificar algunos datos con seguridad. ${originalsNotice(snapshot)} Revisalos en Nihao.`
    : "Recibí la información y continúa su procesamiento.");
}
export function originalsNotice(snapshot?: BurstSnapshot): string {
  const images = snapshot?.messages.filter(m => m.envelope.type === "IMAGE") ?? [];
  const stored = images.filter(m => m.reading?.storageKey).length;
  return images.length && stored === images.length ? "Las imágenes originales están guardadas." : stored ? `Hay ${stored} imágenes guardadas; quedan originales pendientes de guardar.` : "Quedan datos pendientes de procesar; no pude verificar que los originales estén guardados.";
}
/** Explicit debug only; normal WhatsApp responses use renderSavedResults. */
export function renderTechnicalSummary(summary: { totalAssets: number; totalLogicalLoads: number; processed: number; pending: number; needsReview: number; failed: number }): string {
  return JSON.stringify(summary);
}
