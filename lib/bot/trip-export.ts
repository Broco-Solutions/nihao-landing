import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import ExcelJS from "exceljs";
import type { TripInsights } from "./trip-insights";

export type Kind = "report" | "summary" | "suppliers" | "products";
export type Sheet = { title: string; columns: string[]; rows: Array<Array<string | number | null>> };
export type PdfRenderOptions = { tripName?: string; startDate?: string | null; endDate?: string | null; generatedAt?: Date };

const A4: [number, number] = [595.28, 841.89];
const COLORS = {
  wine: rgb(0x93 / 255, 0x11 / 255, 0x11 / 255), wineDark: rgb(0x73 / 255, 0x0d / 255, 0x0d / 255), wineSoft: rgb(0xfd / 255, 0xf0 / 255, 0xf0 / 255),
  gold: rgb(0xe6 / 255, 0xb0 / 255, 0x41 / 255), goldSoft: rgb(0xfb / 255, 0xf3 / 255, 0xe0 / 255), ink: rgb(0x22 / 255, 0x20 / 255, 0x1f / 255),
  muted: rgb(0x69 / 255, 0x65 / 255, 0x62 / 255), line: rgb(0xe7 / 255, 0xe3 / 255, 0xdf / 255), paper: rgb(0xfa / 255, 0xfa / 255, 0xfa / 255), white: rgb(1, 1, 1),
};

export function sheetsFor(data: TripInsights, kind: Kind): Sheet[] {
  const summary: Sheet = { title: "Resumen", columns: ["Indicador", "Valor"], rows: [["Viaje", data.trip.name], ["Empresas", data.companies.length], ...(data.role === "ADMIN" ? [["Viajeros", data.metrics.travelerCount] as [string, string | number]] : []), ["Proveedores", data.metrics.supplierCount], ["Productos", data.metrics.productCount], ["Contactos", data.metrics.contactCount], ["Ciudades", data.metrics.cityCount], ["Pendientes", data.metrics.pendingCount], ["Satisfacción", data.role === "ADMIN" ? data.metrics.satisfaction : null], ...(data.role === "ADMIN" ? [] : [["Alcance", "Mis empresas"] as [string, string]])] };
  const suppliers: Sheet = { title: "Proveedores", columns: ["Empresa del viaje", "Proveedor", "Ciudad", "Provincia", "Categoría", "Tipo", "Interés", "Sitio web", "Contactos"], rows: data.suppliers.map((s) => [s.company, s.companyNameLatin ?? s.companyName, s.city, s.province, s.category, s.supplierType, s.interestScore, s.website, s.contacts.map((c) => `${contactLabel(c.type)}: ${c.rawText}`).join("; ")]) };
  const products: Sheet = { title: "Productos", columns: ["Empresa del viaje", "Proveedor", "Producto", "FOB", "Moneda", "Unidad FOB", "MOQ", "Unidad MOQ", "Lead time (días)"], rows: data.products.filter((product) => product.status === "CONFIRMED" && !product.pendingReview).map((product) => [product.company, product.supplierName, product.name, product.fobAmount, product.fobCurrency, product.fobUnit, product.moqQuantity, product.moqUnit, product.leadTimeDays]) };
  const pendingProducts: Sheet = { title: "Productos pendientes", columns: ["Empresa del viaje", "Proveedor", "Producto", "FOB sin confirmar", "Moneda", "MOQ sin confirmar", "Lead time sin confirmar (días)", "Estado"], rows: data.pendingProducts.map((p) => [p.company, p.supplierName, p.name, p.fobAmount, p.fobCurrency, p.moqQuantity, p.leadTimeDays, "Pendiente de revisión"]) };
  const agenda: Sheet = { title: "Agenda", columns: ["Viajero", "Fecha", "Hora", "Lugar", "Dirección", "Instrucciones"], rows: data.agenda.map((e) => [e.traveler, e.date, e.time, e.place, e.address, e.instructions]) };
  const travelers: Sheet = { title: "Viajeros", columns: ["Nombre", "Email", "Empresas"], rows: data.members.map((m) => [m.name, m.email, m.companies.join(", ")]) };
  if (kind === "suppliers") return [suppliers];
  if (kind === "products") return [products, pendingProducts];
  if (kind === "summary") return [summary, pendingProducts, agenda];
  return data.role === "ADMIN" ? [summary, travelers, suppliers, products, pendingProducts, agenda] : [summary, suppliers, products, pendingProducts, agenda];
}

function contactLabel(type: string | null): string { return ({ EMAIL: "Email", PHONE: "Teléfono", FAX: "Fax", WECHAT: "WeChat" } as Record<string, string>)[type ?? ""] ?? "Contacto"; }
function supplierTypeLabel(value: unknown): string { return ({ FACTORY: "Fabricante", TRADING: "Comercializadora", UNKNOWN: "Por confirmar" } as Record<string, string>)[String(value)] ?? display(value); }
function display(value: unknown): string { return value === null || value === undefined || value === "" ? "—" : String(value); }
function recordFor(sheet: Sheet, row: Sheet["rows"][number]): Record<string, string | number | null> { return Object.fromEntries(sheet.columns.map((column, index) => [column, row[index] ?? null])); }
function dateLabel(value?: string | null): string { return value ? new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value)) : "Fecha a definir"; }
async function optionalAsset(...segments: string[]): Promise<Uint8Array | null> { try { return new Uint8Array(await readFile(path.join(process.cwd(), ...segments))); } catch { return null; } }

type TextLine = { text: string; size: number; color: typeof COLORS.ink; indent?: number; gapAfter?: number };

class PdfComposer {
  readonly margin = 42; readonly contentWidth = A4[0] - 84; readonly bottom = 52; readonly top = 745;
  page!: PDFPage; y = this.top;
  constructor(readonly document: PDFDocument, readonly font: PDFFont, readonly cjkFont: PDFFont, readonly fallbackFont: PDFFont, readonly logo: PDFImage | null, readonly reportTitle: string) { this.newPage(); }

  fontFor(text: string): PDFFont { return /[\u3400-\u9fff\uf900-\ufaff]/u.test(text) ? this.cjkFont : this.font; }

  private drawHeader(): void {
    this.page.drawRectangle({ x: 0, y: A4[1] - 76, width: A4[0], height: 76, color: COLORS.white });
    this.page.drawRectangle({ x: 0, y: A4[1] - 79, width: A4[0], height: 3, color: COLORS.gold });
    if (this.logo) {
      const dimensions = this.logo.scale(0.105);
      this.page.drawImage(this.logo, { x: this.margin, y: A4[1] - 58, width: dimensions.width, height: dimensions.height });
    } else this.page.drawText("NIHAO NEGOCIOS", { x: this.margin, y: A4[1] - 48, size: 12, font: this.fallbackFont, color: COLORS.wine });
    this.page.drawText(this.reportTitle, { x: A4[0] - this.margin - this.fontFor(this.reportTitle).widthOfTextAtSize(this.reportTitle, 9), y: A4[1] - 48, size: 9, font: this.fontFor(this.reportTitle), color: COLORS.muted });
  }

  newPage(continuation?: string): void {
    this.page = this.document.addPage(A4); this.page.drawRectangle({ x: 0, y: 0, width: A4[0], height: A4[1], color: COLORS.paper }); this.drawHeader(); this.y = this.top;
    if (continuation) { const label = `${continuation} · continuación`; this.page.drawText(label, { x: this.margin, y: this.y, size: 10, font: this.fontFor(label), color: COLORS.wine }); this.y -= 24; }
  }
  ensure(height: number, continuation?: string): void { if (this.y - height < this.bottom) this.newPage(continuation); }
  wrap(text: string, maxWidth: number, size: number): string[] {
    const lines: string[] = [];
    for (const paragraph of display(text).split(/\n/gu)) {
      const words = paragraph.split(/\s+/gu).filter(Boolean); if (!words.length) { lines.push(""); continue; }
      let line = "";
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (this.fontFor(candidate).widthOfTextAtSize(candidate, size) <= maxWidth) { line = candidate; continue; }
        if (line) lines.push(line);
        if (this.fontFor(word).widthOfTextAtSize(word, size) <= maxWidth) { line = word; continue; }
        let fragment = "";
        for (const character of [...word]) {
          if (fragment && this.fontFor(fragment + character).widthOfTextAtSize(fragment + character, size) > maxWidth) { lines.push(fragment); fragment = character; } else fragment += character;
        }
        line = fragment;
      }
      if (line) lines.push(line);
    }
    return lines.length ? lines : [""];
  }
  section(title: string, subtitle?: string, keepWith = 0): void {
    this.ensure((subtitle ? 62 : 42) + keepWith); this.y -= 8;
    this.page.drawRectangle({ x: this.margin, y: this.y - 2, width: 24, height: 2, color: COLORS.gold });
    this.page.drawText(title, { x: this.margin, y: this.y - 23, size: 17, font: this.fontFor(title), color: COLORS.wineDark }); this.y -= 36;
    if (subtitle) { for (const line of this.wrap(subtitle, this.contentWidth, 9)) { this.page.drawText(line, { x: this.margin, y: this.y, size: 9, font: this.fontFor(line), color: COLORS.muted }); this.y -= 12; } this.y -= 4; }
  }
  card(title: string, lines: TextLine[], options: { subtitle?: string; tone?: "default" | "pending" } = {}): void {
    const innerWidth = this.contentWidth - 28; const rendered: TextLine[] = [];
    for (const line of lines) for (const wrapped of this.wrap(line.text, innerWidth - (line.indent ?? 0), line.size)) rendered.push({ ...line, text: wrapped });
    const headerHeight = options.subtitle ? 46 : 31; const maxBodyHeight = this.top - this.bottom - headerHeight - 32;
    let cursor = 0; let part = 0;
    while (cursor < rendered.length || part === 0) {
      const availableLines: TextLine[] = []; let bodyHeight = 0;
      while (cursor < rendered.length) { const candidate = rendered[cursor]; const height = candidate.size + 4 + (candidate.gapAfter ?? 0); if (availableLines.length && bodyHeight + height > maxBodyHeight) break; availableLines.push(candidate); bodyHeight += height; cursor += 1; }
      const cardHeight = headerHeight + Math.max(bodyHeight, 14) + 18; this.ensure(cardHeight + 10, title); const bottom = this.y - cardHeight;
      this.page.drawRectangle({ x: this.margin, y: bottom, width: this.contentWidth, height: cardHeight, color: options.tone === "pending" ? COLORS.goldSoft : COLORS.white, borderColor: options.tone === "pending" ? COLORS.gold : COLORS.line, borderWidth: 0.8 });
      const cardTitle = part ? `${title} · continuación` : title; this.page.drawText(cardTitle, { x: this.margin + 14, y: this.y - 22, size: 12, font: this.fontFor(cardTitle), color: COLORS.ink });
      let lineY = this.y - 39;
      if (options.subtitle && !part) { this.page.drawText(options.subtitle, { x: this.margin + 14, y: lineY, size: 8.5, font: this.fontFor(options.subtitle), color: COLORS.muted }); lineY -= 17; }
      for (const line of availableLines) { this.page.drawText(line.text, { x: this.margin + 14 + (line.indent ?? 0), y: lineY, size: line.size, font: this.fontFor(line.text), color: line.color }); lineY -= line.size + 4 + (line.gapAfter ?? 0); }
      this.y = bottom - 10; part += 1;
      if (cursor < rendered.length) this.newPage(title); if (!rendered.length) break;
    }
  }
  table(title: string, columns: Array<{ label: string; width: number }>, rows: string[][]): void {
    const drawHeader = () => { const height = 24; this.page.drawRectangle({ x: this.margin, y: this.y - height, width: this.contentWidth, height, color: COLORS.wine }); let x = this.margin + 8; for (const column of columns) { this.page.drawText(column.label, { x, y: this.y - 16, size: 8, font: this.fontFor(column.label), color: COLORS.white }); x += column.width; } this.y -= height; };
    drawHeader();
    for (let index = 0; index < rows.length; index += 1) {
      const wrapped = rows[index].map((cell, column) => this.wrap(cell, columns[column].width - 14, 8)); const height = Math.max(27, Math.max(...wrapped.map((lines) => lines.length)) * 11 + 12);
      if (this.y - height < this.bottom) { this.newPage(title); drawHeader(); }
      if (index % 2 === 0) this.page.drawRectangle({ x: this.margin, y: this.y - height, width: this.contentWidth, height, color: COLORS.white });
      let x = this.margin + 8;
      wrapped.forEach((cellLines, column) => { cellLines.forEach((line, lineIndex) => this.page.drawText(line, { x, y: this.y - 16 - lineIndex * 11, size: 8, font: this.fontFor(line), color: COLORS.ink })); x += columns[column].width; });
      this.page.drawLine({ start: { x: this.margin, y: this.y - height }, end: { x: this.margin + this.contentWidth, y: this.y - height }, thickness: 0.5, color: COLORS.line }); this.y -= height;
    }
    if (!rows.length) { this.page.drawText("Sin datos para mostrar", { x: this.margin + 8, y: this.y - 18, size: 9, font: this.fontFor("Sin datos para mostrar"), color: COLORS.muted }); this.y -= 34; }
    this.y -= 12;
  }
}

function metricRows(sheet: Sheet): Array<{ label: string; value: string }> { return sheet.rows.filter((row) => row[0] !== "Viaje" && row[1] !== null).map((row) => ({ label: display(row[0]), value: display(row[1]) })); }
function drawMetrics(composer: PdfComposer, metrics: Array<{ label: string; value: string }>): void {
  const gap = 8; const width = (composer.contentWidth - gap * 3) / 4;
  metrics.forEach((metric, index) => { if (index % 4 === 0) composer.ensure(64, "Indicadores principales"); const column = index % 4; const x = composer.margin + column * (width + gap); const top = composer.y; composer.page.drawRectangle({ x, y: top - 54, width, height: 54, color: COLORS.white, borderColor: COLORS.line, borderWidth: 0.8 }); const valueSize = metric.value.length > 12 ? 12 : 17; const valueLines = composer.wrap(metric.value, width - 22, valueSize).slice(0, 2); valueLines.forEach((line, lineIndex) => composer.page.drawText(line, { x: x + 11, y: top - 20 - lineIndex * (valueSize + 1), size: valueSize, font: composer.fontFor(line), color: COLORS.wineDark })); composer.page.drawText(metric.label, { x: x + 11, y: top - 44, size: 8, font: composer.fontFor(metric.label), color: COLORS.muted }); if (column === 3 || index === metrics.length - 1) composer.y -= 63; });
}
function fieldLine(label: string, value: unknown): TextLine[] { return value === null || value === undefined || value === "" ? [] : [{ text: `${label}: ${display(value)}`, size: 9, color: COLORS.ink, gapAfter: 1 }]; }
async function embedBrand(document: PDFDocument): Promise<{ font: PDFFont; cjkFont: PDFFont; fallback: PDFFont; logo: PDFImage | null }> {
  const fallback = await document.embedFont(StandardFonts.HelveticaBold);
  const [latinBytes, cjkBytes] = await Promise.all([optionalAsset("node_modules", "dejavu-fonts-ttf", "ttf", "DejaVuSans.ttf"), optionalAsset("node_modules", "@fontpkg", "droid-sans-fallback", "Droid Sans.ttf")]);
  let font: PDFFont = fallback; let cjkFont: PDFFont = fallback;
  if (latinBytes || cjkBytes) document.registerFontkit(fontkit);
  if (latinBytes) font = await document.embedFont(latinBytes, { subset: false, features: { liga: false, clig: false, rlig: false } });
  if (cjkBytes) cjkFont = await document.embedFont(cjkBytes, { subset: false, features: { liga: false, clig: false, rlig: false } });
  const logoBytes = await optionalAsset("public", "logo-nihao.png"); return { font, cjkFont, fallback, logo: logoBytes ? await document.embedPng(logoBytes) : null };
}

export async function renderPdf(sheets: Sheet[], options: PdfRenderOptions = {}) {
  const document = await PDFDocument.create(); const { font, cjkFont, fallback, logo } = await embedBrand(document); const composer = new PdfComposer(document, font, cjkFont, fallback, logo, "Informe de viaje comercial");
  const summary = sheets.find((sheet) => sheet.title === "Resumen"); const inferredTrip = summary?.rows.find((row) => row[0] === "Viaje")?.[1]; const tripName = options.tripName ?? display(inferredTrip === undefined ? "Viaje comercial" : inferredTrip); const generatedAt = options.generatedAt ?? new Date();
  composer.page.drawText("INFORME DE VIAJE COMERCIAL", { x: composer.margin, y: composer.y, size: 10, font: composer.fontFor("INFORME DE VIAJE COMERCIAL"), color: COLORS.wine }); composer.y -= 31;
  for (const line of composer.wrap(tripName, composer.contentWidth, 25)) { composer.page.drawText(line, { x: composer.margin, y: composer.y, size: 25, font: composer.fontFor(line), color: COLORS.ink }); composer.y -= 31; }
  const period = options.startDate || options.endDate ? `${dateLabel(options.startDate)} — ${dateLabel(options.endDate)}` : "Fechas a definir";
  const generatedLabel = `Generado el ${new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeZone: "UTC" }).format(generatedAt)}`;
  const scope = summary?.rows.find((row) => row[0] === "Alcance")?.[1];
  composer.page.drawText(period, { x: composer.margin, y: composer.y, size: 10, font: composer.fontFor(period), color: COLORS.muted }); composer.page.drawText(generatedLabel, { x: composer.margin, y: composer.y - 17, size: 9, font: composer.fontFor(generatedLabel), color: COLORS.muted });
  if (scope) { const scopeLabel = `Alcance de este informe: ${display(scope)}`; composer.page.drawText(scopeLabel, { x: composer.margin, y: composer.y - 32, size: 8.5, font: composer.fontFor(scopeLabel), color: COLORS.muted }); composer.y -= 67; } else composer.y -= 52;

  for (const sheet of sheets) {
    if (sheet.title === "Resumen") { composer.section("Indicadores principales", "Una lectura ejecutiva del viaje y de la información comercial disponible."); drawMetrics(composer, metricRows(sheet)); continue; }
    if (sheet.title === "Viajeros") { composer.section("Participantes", undefined, 52); composer.table("Participantes", [{ label: "Nombre", width: 150 }, { label: "Email", width: 190 }, { label: "Empresa participante", width: composer.contentWidth - 340 }], sheet.rows.map((row) => row.map(display))); continue; }
    if (sheet.title === "Proveedores") {
      // Keep the heading with a representative supplier card. Contact lists and
      // long URLs make these cards taller than the compact product cards.
      composer.section("Proveedores", "Información confirmada y organizada por empresa participante.", 210);
      if (!sheet.rows.length) composer.card("Sin proveedores", [{ text: "Todavía no hay proveedores confirmados para este viaje.", size: 9, color: COLORS.muted }]);
      for (const row of sheet.rows) {
        const item = recordFor(sheet, row); const location = [item.Ciudad, item.Provincia].filter((value) => value !== null && value !== "").map(display).join(" · ") || "Ubicación por confirmar";
        const lines: TextLine[] = [...fieldLine("Empresa participante", item["Empresa del viaje"]), { text: location, size: 9, color: COLORS.muted, gapAfter: 4 }, ...fieldLine("Categoría", item.Categoría), ...fieldLine("Tipo", supplierTypeLabel(item.Tipo)), ...fieldLine("Interés", item.Interés === null ? null : `${item.Interés}/10`), ...fieldLine("Sitio web", item["Sitio web"])];
        const contacts = display(item.Contactos) === "—" ? [] : display(item.Contactos).split(/;\s*/gu);
        if (contacts.length) { lines.push({ text: "Contactos", size: 9, color: COLORS.wine, gapAfter: 2 }); lines.push(...contacts.map((contact) => ({ text: `• ${contact}`, size: 8.5, color: COLORS.ink, indent: 8 } satisfies TextLine))); }
        composer.card(display(item.Proveedor) === "—" ? "Proveedor sin nombre" : display(item.Proveedor), lines);
      }
      continue;
    }
    if (sheet.title === "Productos" || sheet.title === "Productos pendientes") {
      const pending = sheet.title === "Productos pendientes";
      composer.section(pending ? "Información pendiente de revisión" : "Productos", pending ? "Estos datos todavía no representan condiciones comerciales confirmadas." : "Condiciones comerciales confirmadas, agrupadas por producto.", 88);
      if (!sheet.rows.length) composer.card(pending ? "Sin pendientes" : "Sin productos", [{ text: pending ? "No hay productos pendientes de revisión." : "Todavía no hay productos confirmados.", size: 9, color: COLORS.muted }], { tone: pending ? "pending" : "default" });
      for (const row of sheet.rows) {
        const item = recordFor(sheet, row); const fob = item.FOB ?? item["FOB sin confirmar"]; const moq = item.MOQ ?? item["MOQ sin confirmar"]; const leadTime = item["Lead time (días)"] ?? item["Lead time sin confirmar (días)"];
        const lines: TextLine[] = [...fieldLine("Proveedor", item.Proveedor), ...fieldLine("Empresa participante", item["Empresa del viaje"]), ...fieldLine("FOB", fob === null ? null : [display(fob), display(item.Moneda), display(item["Unidad FOB"])].filter((value) => value !== "—").join(" ")), ...fieldLine("MOQ", moq === null ? null : [display(moq), display(item["Unidad MOQ"])].filter((value) => value !== "—").join(" ")), ...fieldLine("Lead time", leadTime === null ? null : `${display(leadTime)} días`)];
        composer.card(display(item.Producto) === "—" ? "Producto sin nombre" : display(item.Producto), lines, { tone: pending ? "pending" : "default" });
      }
      continue;
    }
    if (sheet.title === "Agenda") { composer.section("Agenda", undefined, 76); composer.table("Agenda", [{ label: "Viajero", width: 92 }, { label: "Fecha y hora", width: 86 }, { label: "Lugar", width: 105 }, { label: "Dirección e instrucciones", width: composer.contentWidth - 283 }], sheet.rows.map((row) => [display(row[0]), `${display(row[1])} · ${display(row[2])}`, display(row[3]), [display(row[4]), display(row[5])].filter((value) => value !== "—").join(" · ") || "—"])); continue; }
    composer.section(sheet.title); composer.table(sheet.title, sheet.columns.map((label) => ({ label, width: composer.contentWidth / sheet.columns.length })), sheet.rows.map((row) => row.map(display)));
  }
  const pages = document.getPages(); pages.forEach((page, index) => { const pageLabel = `${index + 1} / ${pages.length}`; page.drawLine({ start: { x: 42, y: 35 }, end: { x: A4[0] - 42, y: 35 }, thickness: 0.6, color: COLORS.line }); page.drawText("Nihao Negocios · Información comercial confidencial", { x: 42, y: 20, size: 7.5, font, color: COLORS.muted }); page.drawText(pageLabel, { x: A4[0] - 42 - font.widthOfTextAtSize(pageLabel, 7.5), y: 20, size: 7.5, font, color: COLORS.muted }); });
  document.setTitle(`${tripName} · Informe de viaje comercial`); document.setAuthor("Nihao Negocios"); document.setSubject("Informe comercial de viaje"); document.setCreator("Nihao Negocios"); return document.save();
}

export async function renderXlsx(sheets: Sheet[]) {
  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) { const tab = workbook.addWorksheet(sheet.title); tab.addRow(sheet.columns); for (const row of sheet.rows) tab.addRow(row); tab.getRow(1).font = { bold: true }; tab.columns.forEach((column) => { column.width = 24; }); }
  return workbook.xlsx.writeBuffer();
}
