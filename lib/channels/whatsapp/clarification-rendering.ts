import type { AgentQuestion } from "./agent-contract.ts";

/** Presentation only: preserve questions, option IDs/order and literal product names. */
export function formatQuestion(text: string): string {
  return text.trim().replace(/\r\n/gu, "\n").replace(/\s+(?:Además|Ademas|También|Tambien)\s*[:,]?\s*/gu, "\n\n").replace(/(?<=\?)\s+(?=[¿A-ZÁÉÍÓÚ])/gu, "\n\n");
}
export function renderClarification(question: Pick<AgentQuestion, "text" | "options" | "products" | "contextSelection">): string {
  const { options, products = [] } = question;
  const sections: string[] = [];
  if (question.contextSelection) {
    sections.push("📍 Viaje\n\n" + formatQuestion(question.text) + "\n\n" + options.map((o, i) => `${i + 1}. ${o.label}`).join("\n"));
  } else {
    // Free questions may include completeness/identity decisions; never discard them.
    sections.push(formatQuestion(question.text));
    if (options.length) sections.push(options.map((o, i) => `${i + 1}. ${o.label}`).join("\n"));
  }
  if (products.length > 1 || question.contextSelection && products.length) {
    sections.push("📦 Productos\n\n" + products.map(p => `• ${p.name} → ${p.supplierQuery ? `¿Pertenece a ${p.supplierQuery}?` : "¿A qué proveedor pertenece?"}`).join("\n"));
  }
  if (options.length) sections.push('Podés responder: "1".' + (question.contextSelection && products.length ? " También podés responder las asociaciones en líneas separadas citando este mensaje." : ""));
  else if (products.length > 1) sections.push("Podés responder una asociación por línea, por ejemplo:\n\n" + products.map(p => `${p.name} → ${p.supplierQuery ?? "nombre del proveedor"}`).join("\n"));
  return sections.filter(Boolean).join("\n\n");
}
export function renderBatchSummary(summary: { totalAssets: number; totalLogicalLoads: number; processed: number; pending: number; needsReview: number; failed: number }): string {
  return `Ráfaga: ${summary.totalAssets} evidencias, ${summary.totalLogicalLoads} cargas.\n\n• ${summary.processed} procesadas\n• ${summary.pending} pendientes\n• ${summary.needsReview} para revisar\n• ${summary.failed} fallidas`;
}
