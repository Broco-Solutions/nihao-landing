import { PDFDocument, StandardFonts } from "pdf-lib";
import ExcelJS from "exceljs";
import type { TripInsights } from "./trip-insights";

export type Kind = "report" | "summary" | "suppliers" | "products";
type Sheet = { title: string; columns: string[]; rows: Array<Array<string | number | null>> };

export function sheetsFor(data: TripInsights, kind: Kind): Sheet[] {
  const summary: Sheet = { title: "Resumen", columns: ["Indicador", "Valor"], rows: [["Viaje", data.trip.name], ["Empresas", data.companies.length], ["Viajeros", data.role === "ADMIN" ? data.metrics.travelerCount : "Alcance: mis empresas"], ["Proveedores", data.metrics.supplierCount], ["Productos", data.metrics.productCount], ["Contactos", data.metrics.contactCount], ["Ciudades", data.metrics.cityCount], ["Pendientes", data.metrics.pendingCount], ["Satisfaccion", data.role === "ADMIN" ? data.metrics.satisfaction : null]] };
  const suppliers: Sheet = { title: "Proveedores", columns: ["Empresa del viaje", "Proveedor", "Ciudad", "Provincia", "Categoria", "Tipo", "Interes", "Sitio web", "Contactos"], rows: data.suppliers.map((s) => [s.company, s.companyName, s.city, s.province, s.category, s.supplierType, s.interestScore, s.website, s.contacts.map((c) => `${c.type ?? "Contacto"}: ${c.rawText}`).join("; ")]) };
  const products: Sheet = { title: "Productos", columns: ["Empresa del viaje", "Proveedor", "Producto", "FOB", "Moneda", "Unidad FOB", "MOQ", "Unidad MOQ", "Lead time (dias)"], rows: data.suppliers.flatMap((s) => s.products.map((p) => [s.company, s.companyName, p.name, p.fobAmount, p.fobCurrency, p.fobUnit, p.moqQuantity, p.moqUnit, p.leadTimeDays])) };
  const pendingProducts: Sheet = { title: "Productos pendientes", columns: ["Empresa del viaje", "Proveedor", "Producto", "FOB sin confirmar", "Moneda", "MOQ sin confirmar", "Lead time sin confirmar (dias)", "Estado"], rows: data.pendingProducts.map((p) => [p.company, p.supplierName, p.name, p.fobAmount, p.fobCurrency, p.moqQuantity, p.leadTimeDays, "Pendiente de revisión"]) };
  const agenda: Sheet = { title: "Agenda", columns: ["Viajero", "Fecha", "Hora", "Lugar", "Dirección", "Instrucciones"], rows: data.agenda.map((e) => [e.traveler, e.date, e.time, e.place, e.address, e.instructions]) };
  const travelers: Sheet = { title: "Viajeros", columns: ["Nombre", "Email", "Empresas"], rows: data.members.map((m) => [m.name, m.email, m.companies.join(", ")]) };
  if (kind === "suppliers") return [suppliers];
  if (kind === "products") return [products, pendingProducts];
  if (kind === "summary") return [summary, pendingProducts, agenda];
  return data.role === "ADMIN" ? [summary, travelers, suppliers, products, pendingProducts, agenda] : [summary, suppliers, products, pendingProducts, agenda];
}

export async function renderPdf(sheets: Sheet[]) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  let page = document.addPage([595, 842]); let y = 800;
  const write = (line: string, size = 10) => {
    if (y < 55) { page = document.addPage([595, 842]); y = 800; }
    const safe = line.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, " ");
    for (let offset = 0; offset < safe.length || offset === 0; offset += 88) {
      if (y < 55) { page = document.addPage([595, 842]); y = 800; }
      page.drawText(safe.slice(offset, offset + 88), { x: 40, y, size, font }); y -= size + 6;
    }
  };
  for (const sheet of sheets) {
    y -= 10; write(sheet.title, 17); y -= 5;
    if (!sheet.rows.length) write("Sin datos para mostrar");
    for (const row of sheet.rows) write(row.map((cell, index) => `${sheet.columns[index]}: ${cell ?? "-"}`).join(" | "));
  }
  return document.save();
}

export async function renderXlsx(sheets: Sheet[]) {
  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const tab = workbook.addWorksheet(sheet.title);
    tab.addRow(sheet.columns);
    for (const row of sheet.rows) tab.addRow(row);
    tab.getRow(1).font = { bold: true };
    tab.columns.forEach((column) => { column.width = 24; });
  }
  return workbook.xlsx.writeBuffer();
}

