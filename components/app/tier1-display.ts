import type { SupplierType, Tier1Data, Tier1Field } from "@/lib/bot/types";

export const FIELD_LABELS: Record<Tier1Field, string> = {
  companyName: "Empresa",
  city: "Ciudad",
  province: "Provincia",
  contact: "Contacto",
  category: "Categoría",
  supplierType: "Tipo de proveedor",
  fob: "Precio FOB",
  moq: "MOQ",
  leadTime: "Lead time",
  interestScore: "Interés",
};

export function supplierTypeLabel(value: SupplierType) {
  return value === "FACTORY" ? "Fábrica" : value === "TRADING" ? "Trading" : "Sin definir";
}

export function fieldValue(fields: Tier1Data, field: Tier1Field): string {
  switch (field) {
    case "supplierType": return supplierTypeLabel(fields.supplierType);
    case "fob": return fields.fob ? `${fields.fob.currency ?? "Moneda pendiente"} ${fields.fob.amount ?? "—"} / ${fields.fob.unit ?? "unidad"}` : "Pendiente";
    case "moq": return fields.moq ? `${fields.moq.quantity ?? "—"} ${fields.moq.unit ?? "unidades"}${fields.moq.notes ? ` · ${fields.moq.notes}` : ""}` : "Pendiente";
    case "leadTime": return fields.leadTime ? fields.leadTime.rawText || (fields.leadTime.days ? `${fields.leadTime.days} días` : "Pendiente") : "Pendiente";
    case "interestScore": return fields.interestScore === null ? "Pendiente" : `${fields.interestScore} / 5`;
    default: return fields[field] || "Pendiente";
  }
}
