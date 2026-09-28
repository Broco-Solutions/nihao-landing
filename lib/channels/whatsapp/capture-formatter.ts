import type { SupplierCaptureRecord, Tier1Field } from "../../bot/types.ts";

const labels: Partial<Record<Tier1Field, string>> = { category: "categoría", supplierType: "tipo de proveedor", companyName: "empresa", fob: "FOB", moq: "MOQ", leadTime: "tiempo de entrega" };

export function formatWhatsAppCaptureReply(capture: SupplierCaptureRecord, title = "Guardé la captura ✅", includeReview = true): string {
  const lines = [title];
  if (capture.fields.companyName) lines.push(`Empresa: ${capture.fields.companyName}`);
  if (capture.fields.category) lines.push(`Categoría: ${capture.fields.category}`);
  if (capture.fields.supplierType && capture.fields.supplierType !== "UNKNOWN") lines.push(`Tipo de proveedor: ${capture.fields.supplierType}`);
  if (capture.fields.contact) lines.push(`Contacto: ${capture.fields.contact}`);
  if (capture.fields.city) lines.push(`Ciudad: ${capture.fields.city}`);
  if (capture.fields.province) lines.push(`Provincia: ${capture.fields.province}`);
  if (capture.fields.fob) lines.push(`FOB: ${[capture.fields.fob.currency, capture.fields.fob.amount, capture.fields.fob.unit].filter((value) => value !== null && value !== "").join(" ")}`);
  if (capture.fields.moq) lines.push(`MOQ: ${[capture.fields.moq.quantity, capture.fields.moq.unit].filter((value) => value !== null && value !== "").join(" ")}`);
  const delivery = capture.fields.leadTime?.rawText || (capture.fields.leadTime?.days != null ? `${capture.fields.leadTime.days} días` : null);
  if (delivery) lines.push(`Entrega: ${delivery}`);
  if (capture.fields.interestScore !== null) lines.push(`Interés: ${capture.fields.interestScore}`);
  const review = [...new Set([...capture.reviewFields, ...capture.missingFields])].map((field) => labels[field]).filter((label): label is string => Boolean(label));
  if (includeReview && review.length) lines.push(`Falta revisar: ${review.slice(0, 2).join(", ")}.`);
  lines.push("La captura quedó pendiente de revisión en Nihao.");
  return lines.join("\n");
}
