import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import ExcelJS from "exceljs";
import { sheetsFor, renderPdf, renderXlsx } from "../../lib/bot/trip-export.ts";
import type { TripInsights } from "../../lib/bot/trip-insights.ts";

test("el informe del viajero genera PDF y Excel válidos sin datos de otros viajeros", async () => {
  const data = {
    role: "TRAVELER", trip: { name: "Feria Demo" }, companies: [{ id: "company-a", name: "Broco" }], members: [], agenda: [{ traveler: "Viajero", date: "2026-10-05", time: "09:30", place: "Museo", address: "Calle 123", instructions: null }],
    metrics: { travelerCount: 0, supplierCount: 1, productCount: 1, contactCount: 1, cityCount: 1, pendingCount: 1, satisfaction: null },
    suppliers: [{ company: "Broco", companyName: "Proveedor A", city: "Shenzhen", province: null, category: "Hogar", supplierType: "FACTORY", interestScore: 8, website: null, contacts: [{ type: "EMAIL", rawText: "hola@example.com" }], products: [{ name: "Mesa", fobAmount: 10, fobCurrency: "USD", fobUnit: "unidad", moqQuantity: 50, moqUnit: "unidades", leadTimeDays: 20 }] }],
    pendingProducts: [{ company: "Broco", supplierName: "Proveedor A", name: "Lámpara", fobAmount: 7, fobCurrency: "USD", moqQuantity: 300, leadTimeDays: 21 }],
  } as unknown as TripInsights;
  const sheets = sheetsFor(data, "report");
  assert.deepEqual(sheets.map((sheet) => sheet.title), ["Resumen", "Proveedores", "Productos", "Productos pendientes", "Agenda"]);
  assert.equal(sheets[1].rows[0][1], "Proveedor A");
  assert.deepEqual(sheets[4].columns, ["Viajero", "Fecha", "Hora", "Lugar", "Dirección", "Instrucciones"]);
  assert.deepEqual(sheets[4].rows[0].slice(0, 5), ["Viajero", "2026-10-05", "09:30", "Museo", "Calle 123"]);
  assert.equal(sheets[2].rows.length, 1);
  assert.equal(sheets[3].rows[0][2], "Lámpara");
  assert.equal(sheets[3].rows[0][7], "Pendiente de revisión");
  assert.deepEqual(sheetsFor(data, "products").map((sheet) => sheet.title), ["Productos", "Productos pendientes"]);
  const pdf = await PDFDocument.load(await renderPdf(sheets));
  assert.ok(pdf.getPageCount() >= 1);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await renderXlsx(sheets));
  assert.equal(workbook.getWorksheet("Productos")?.getRow(2).getCell(3).value, "Mesa");
  assert.equal(workbook.getWorksheet("Productos pendientes")?.getRow(2).getCell(3).value, "Lámpara");
});
