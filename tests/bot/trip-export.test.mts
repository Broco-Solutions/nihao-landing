import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import ExcelJS from "exceljs";
import { sheetsFor, renderPdf, renderXlsx } from "../../lib/bot/trip-export.ts";
import type { TripInsights } from "../../lib/bot/trip-insights.ts";

function largeInsights(): TripInsights {
  const companies = [{ id: "company-a", name: "Broco Internacional" }, { id: "company-b", name: "Comercial del Sur" }];
  const suppliers = Array.from({ length: 15 }, (_, supplierIndex) => ({
    company: companies[supplierIndex % 2].name,
    companyName: supplierIndex === 0 ? "深圳市明华科技有限公司" : `Proveedor internacional con nombre extenso ${supplierIndex + 1}`,
    companyNameLatin: supplierIndex === 0 ? "Shenzhen Minghua Technology Co., Ltd." : null,
    city: ["Shenzhen", "Guangzhou", "Dongguan", "Foshan", "Ningbo", "Yiwu"][supplierIndex % 6],
    province: supplierIndex % 3 ? "Guangdong" : null,
    category: supplierIndex % 2 ? "Electrónica de consumo" : "Equipamiento industrial",
    supplierType: supplierIndex % 3 === 0 ? "FACTORY" : supplierIndex % 3 === 1 ? "TRADING" : "UNKNOWN",
    interestScore: supplierIndex % 4 === 0 ? null : 7 + (supplierIndex % 3),
    website: `https://www.proveedor-${supplierIndex + 1}.example.com/catalogo/internacional/productos-con-un-enlace-muy-extenso`,
    contacts: Array.from({ length: supplierIndex < 5 ? 4 : 2 }, (_, contactIndex) => ({ type: contactIndex % 2 ? "PHONE" : "EMAIL", rawText: contactIndex % 2 ? `+86 755 5555 ${String(supplierIndex * 10 + contactIndex).padStart(4, "0")}` : `contacto.comercial.${supplierIndex + 1}.${contactIndex + 1}@proveedor-internacional.example.com` })),
    products: supplierIndex < 10 ? [{ name: `Producto comercial confirmado ${supplierIndex + 1} – edición premium`, fobAmount: 8.5 + supplierIndex, fobCurrency: "USD", fobUnit: "unidad", moqQuantity: 100 + supplierIndex * 10, moqUnit: "unidades", leadTimeDays: 15 + supplierIndex }] : [],
  }));
  return {
    role: "ADMIN",
    trip: { id: "trip-large", name: "Feria Internacional de Cantón – Misión comercial 2026", startDate: "2026-10-15T00:00:00.000Z", endDate: "2026-10-19T00:00:00.000Z", status: "ACTIVE" },
    companies,
    members: [
      { id: "traveler-a", name: "María José Fernández", email: "maria.fernandez+feria.internacional@example.com", companies: [companies[0].name] },
      { id: "traveler-b", name: "João D’Ávila", email: "joao.davila@example.com", companies: [companies[1].name] },
    ],
    agenda: Array.from({ length: 14 }, (_, index) => ({ id: `agenda-${index}`, userId: index % 2 ? "traveler-a" : "traveler-b", traveler: index % 2 ? "María José Fernández" : "João D’Ávila", date: `2026-10-${String(15 + Math.floor(index / 4)).padStart(2, "0")}`, time: `${String(9 + (index % 8)).padStart(2, "0")}:30`, place: `Complejo ferial, pabellón ${index + 1}`, address: `Calle comercial de acceso ${index + 1}, Guangzhou, Guangdong`, instructions: "Presentarse quince minutos antes y llevar muestras, catálogo y condiciones negociadas." })),
    metrics: { travelerCount: 2, supplierCount: 15, productCount: 10, contactCount: 50, cityCount: 6, pendingCount: 1, satisfaction: 8.5 },
    suppliers,
    products: suppliers.flatMap((supplier, index) => supplier.products.map((product, productIndex) => ({ id: `product-${index}-${productIndex}`, captureId: `capture-${index}`, supplierId: `supplier-${index}`, status: "CONFIRMED", pendingReview: false, needsReanalysis: false, company: supplier.company, supplierName: supplier.companyNameLatin ?? supplier.companyName, reviewFields: [], ...product }))),
    captures: [],
    pendingProducts: [{ company: companies[0].name, supplierName: "Proveedor pendiente de revisión", name: "Producto con especificación incompleta", fobAmount: null, fobCurrency: "USD", moqQuantity: 500, leadTimeDays: null }],
  } as unknown as TripInsights;
}

test("el informe del viajero genera PDF y Excel válidos sin datos de otros viajeros", async () => {
  const data = {
    role: "TRAVELER", trip: { name: "Feria Demo" }, companies: [{ id: "company-a", name: "Broco" }], members: [], agenda: [{ traveler: "Viajero", date: "2026-10-05", time: "09:30", place: "Museo", address: "Calle 123", instructions: null }],
    metrics: { travelerCount: 0, supplierCount: 1, productCount: 1, contactCount: 1, cityCount: 1, pendingCount: 1, satisfaction: null },
    suppliers: [{ company: "Broco", companyName: "Proveedor A", city: "Shenzhen", province: null, category: "Hogar", supplierType: "FACTORY", interestScore: 8, website: null, contacts: [{ type: "EMAIL", rawText: "hola@example.com" }], products: [{ name: "Mesa", fobAmount: 10, fobCurrency: "USD", fobUnit: "unidad", moqQuantity: 50, moqUnit: "unidades", leadTimeDays: 20 }] }],
    products: [{ id: "product-table", captureId: "capture-table", supplierId: "supplier-table", status: "CONFIRMED", pendingReview: false, needsReanalysis: false, reviewFields: [], company: "Broco", supplierName: "Proveedor A", name: "Mesa", fobAmount: 10, fobCurrency: "USD", fobUnit: "unidad", moqQuantity: 50, moqUnit: "unidades", leadTimeDays: 20 }], captures: [],
    pendingProducts: [{ company: "Broco", supplierName: "Proveedor A", name: "Lámpara", fobAmount: 7, fobCurrency: "USD", moqQuantity: 300, leadTimeDays: 21 }],
  } as unknown as TripInsights;
  const sheets = sheetsFor(data, "report");
  assert.deepEqual(sheets.map((sheet) => sheet.title), ["Resumen", "Proveedores", "Productos", "Productos pendientes", "Agenda"]);
  assert.equal(sheets[0].rows.find((row) => row[0] === "Viajeros"), undefined);
  assert.deepEqual(sheets[0].rows.find((row) => row[0] === "Alcance"), ["Alcance", "Mis empresas"]);
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

test("los cuatro tipos de PDF conservan estructura, paginan y admiten datos internacionales", async () => {
  const data = largeInsights();
  const expectedSections = {
    report: ["Resumen", "Viajeros", "Proveedores", "Productos", "Productos pendientes", "Agenda"],
    summary: ["Resumen", "Productos pendientes", "Agenda"],
    suppliers: ["Proveedores"],
    products: ["Productos", "Productos pendientes"],
  } as const;
  for (const kind of ["report", "summary", "suppliers", "products"] as const) {
    const sheets = sheetsFor(data, kind);
    assert.deepEqual(sheets.map((sheet) => sheet.title), expectedSections[kind]);
    const bytes = await renderPdf(sheets, { tripName: data.trip.name, startDate: data.trip.startDate, endDate: data.trip.endDate, generatedAt: new Date("2026-10-10T12:00:00.000Z") });
    const pdf = await PDFDocument.load(bytes);
    assert.ok(bytes.byteLength > 20_000, `${kind} debe contener fuentes, logo y contenido`);
    assert.ok(pdf.getPageCount() >= (kind === "report" ? 5 : 1), `${kind} debe paginar según su volumen`);
    assert.equal(pdf.getTitle(), `${data.trip.name} · Informe de viaje comercial`);
  }
});

test("el PDF vacío sigue siendo legible y no genera páginas vacías", async () => {
  const data = largeInsights();
  data.members = [];
  data.suppliers = [];
  data.pendingProducts = [];
  data.agenda = [];
  data.metrics = { travelerCount: 0, supplierCount: 0, productCount: 0, contactCount: 0, cityCount: 0, pendingCount: 0, satisfaction: null };
  const pdf = await PDFDocument.load(await renderPdf(sheetsFor(data, "report"), { tripName: data.trip.name }));
  assert.ok(pdf.getPageCount() >= 1);
  assert.ok(pdf.getPages().every((page) => page.getWidth() > 0 && page.getHeight() > 0));
});

test("un producto confirmado con proveedor aún en borrador se mantiene consistente en Web y exportaciones", () => {
  const data = largeInsights();
  const product = { id: "confirmed-draft-supplier", captureId: "capture-draft", supplierId: null, status: "CONFIRMED", pendingReview: false, needsReanalysis: false, reviewFields: [], company: "Broco Internacional", supplierName: "Proveedor en revisión", name: "AT-200", fobAmount: 9.5, fobCurrency: "USD", fobUnit: "unidad", moqQuantity: 500, moqUnit: "unidades", leadTimeDays: 21 };
  data.products = [product] as typeof data.products;
  data.suppliers = [];
  data.metrics.productCount = 1;
  const productSheet = sheetsFor(data, "products")[0];
  assert.equal(productSheet.rows.length, data.metrics.productCount);
  assert.deepEqual(productSheet.rows[0].slice(0, 5), ["Broco Internacional", "Proveedor en revisión", "AT-200", 9.5, "USD"]);
});
