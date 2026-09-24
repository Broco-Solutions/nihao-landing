import type { SupplierCaptureRecord, Tier1Field } from "../../bot/types.ts";

const labels: Partial<Record<Tier1Field, string>> = { category: "categoría", supplierType: "tipo de proveedor", companyName: "empresa", fob: "FOB", moq: "MOQ", leadTime: "tiempo de entrega" };

export function formatWhatsAppCaptureReply(capture: SupplierCaptureRecord): string {
  const lines = ["Guardé la captura ✅"];
  if (capture.fields.companyName) lines.push(`Empresa: ${capture.fields.companyName}`);
  if (capture.fields.fob) lines.push(`FOB: ${[capture.fields.fob.currency, capture.fields.fob.amount, capture.fields.fob.unit].filter((value) => value !== null && value !== "").join(" ")}`);
  if (capture.fields.moq) lines.push(`MOQ: ${[capture.fields.moq.quantity, capture.fields.moq.unit].filter((value) => value !== null && value !== "").join(" ")}`);
  if (capture.fields.leadTime?.rawText) lines.push(`Entrega: ${capture.fields.leadTime.rawText}`);
  const review = [...new Set([...capture.reviewFields, ...capture.missingFields])].map((field) => labels[field]).filter((label): label is string => Boolean(label));
  if (review.length) lines.push(`Falta revisar: ${review.slice(0, 2).join(", ")}.`);
  lines.push("La captura quedó pendiente de revisión en Nihao.");
  return lines.join("\n");
}
