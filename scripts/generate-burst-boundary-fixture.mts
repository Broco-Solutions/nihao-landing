import { deflateSync } from "node:zlib";

import { mkdir, writeFile } from "node:fs/promises";
import type { ReplayFixture, ReplayMessage } from "../evals/whatsapp-replay/fixture.ts";
import type { CardReading, VisualReading } from "../lib/channels/whatsapp/ingestion-types.ts";
const root = "fixtures/whatsapp-replay/public";
const font = "A:01110/10001/10001/11111/10001/10001/10001 B:11110/10001/10001/11110/10001/10001/11110 C:01111/10000/10000/10000/10000/10000/01111 D:11110/10001/10001/10001/10001/10001/11110 E:11111/10000/10000/11110/10000/10000/11111 F:11111/10000/10000/11110/10000/10000/10000 G:01111/10000/10000/10111/10001/10001/01111 H:10001/10001/10001/11111/10001/10001/10001 I:11111/00100/00100/00100/00100/00100/11111 J:00111/00010/00010/00010/10010/10010/01100 K:10001/10010/10100/11000/10100/10010/10001 L:10000/10000/10000/10000/10000/10000/11111 M:10001/11011/10101/10101/10001/10001/10001 N:10001/11001/10101/10011/10001/10001/10001 O:01110/10001/10001/10001/10001/10001/01110 P:11110/10001/10001/11110/10000/10000/10000 Q:01110/10001/10001/10001/10101/10010/01101 R:11110/10001/10001/11110/10100/10010/10001 S:01111/10000/10000/01110/00001/00001/11110 T:11111/00100/00100/00100/00100/00100/00100 U:10001/10001/10001/10001/10001/10001/01110 V:10001/10001/10001/10001/10001/01010/00100 W:10001/10001/10001/10101/10101/11011/10001 X:10001/10001/01010/00100/01010/10001/10001 Y:10001/10001/01010/00100/00100/00100/00100 Z:11111/00001/00010/00100/01000/10000/11111 0:01110/10001/10011/10101/11001/10001/01110 1:00100/01100/00100/00100/00100/00100/01110 2:01110/10001/00001/00010/00100/01000/11111 3:11110/00001/00001/01110/00001/00001/11110 4:00010/00110/01010/10010/11111/00010/00010 5:11111/10000/10000/11110/00001/00001/11110 6:01110/10000/10000/11110/10001/10001/01110 7:11111/00001/00010/00100/01000/01000/01000 8:01110/10001/10001/01110/10001/10001/01110 9:01110/10001/10001/01111/00001/00001/01110 .:00000/00000/00000/00000/00000/00100/00100 @:01110/10001/10111/10101/10111/10000/01111";
const glyphs = new Map(font.split(" ").map((v) => [v.split(":")[0], v.split(":")[1].split("/")]));
function chunk(kind: string, payload: Buffer) { const data = Buffer.concat([Buffer.from(kind), payload]); let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } const len = Buffer.alloc(4); len.writeUInt32BE(payload.length); const check = Buffer.alloc(4); check.writeUInt32BE((crc ^ 0xffffffff) >>> 0); return Buffer.concat([len, data, check]); }
async function png(id: string, html: string) {
  const width = 640, height = 360; const pixels = Buffer.alloc((width * 3 + 1) * height, 255);
  for (let y = 0; y < height; y++) pixels[y * (width * 3 + 1)] = 0;
  function rect(x: number, y: number, w: number, h: number, color = [22, 50, 79]) { for (let a = Math.max(0, y); a < Math.min(height, y + h); a++) for (let b = Math.max(0, x); b < Math.min(width, x + w); b++) for (let c = 0; c < 3; c++) pixels[a * (width * 3 + 1) + 1 + b * 3 + c] = color[c]; }
  rect(0, 0, width, height, [218, 214, 205]); rect(12, 14, 620, 338, [160, 160, 155]); rect(10, 10, 620, 338, [250, 250, 248]);
  if (id.endsWith("trade_back") || id.endsWith("brand_only")) {
    // Flat printed shaded polygons, inside the card boundary; no physical box faces.
    const polygon = (points: number[][], color: number[]) => {
      for (let y = 235; y < 335; y++) for (let x = 505; x < 615; x++) {
        let inside = false;
        for (let a = 0, b = points.length - 1; a < points.length; b = a++) {
          const [ax, ay] = points[a], [bx, by] = points[b];
          if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
        }
        if (inside) rect(x, y, 1, 1, color);
      }
    };
    polygon([[510, 270], [560, 240], [610, 270], [560, 300]], [150, 188, 202]);
    polygon([[510, 270], [560, 300], [560, 330], [510, 300]], [85, 129, 145]);
    polygon([[560, 300], [610, 270], [610, 300], [560, 330]], [112, 159, 174]);
  }
  if (id === "vaso") { rect(190, 60, 180, 230, [210, 240, 250]); rect(180, 50, 200, 8); rect(185, 55, 8, 235); rect(368, 55, 8, 235); rect(185, 280, 190, 8); }
  else if (id === "martillo") { rect(295, 100, 32, 215, [150, 98, 50]); rect(220, 65, 175, 65, [90, 90, 90]); }
  else { const lines = html.replace(/<[^>]+>/gu, "\n").split("\n").map((v) => v.trim()).filter(Boolean); lines.forEach((line, n) => { for (let i = 0; i < line.length; i++) { const glyph = glyphs.get(line[i].toUpperCase()); glyph?.forEach((row, r) => [...row].forEach((v, c) => { if (v === "1") rect(25 + i * 15 + c * 2, 30 + n * 42 + r * 2, 2, 2); })); } }); }
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  await writeFile(`${root}/assets/${id}.png`, Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]));
}
const card = (companyName: string | null, domain: string | null, extra: Partial<CardReading> = {}): CardReading => ({ companyName, personName: null, role: null, emails: domain ? [`sales@${domain}`] : [], websites: domain ? [`www.${domain}`] : [], phones: [], address: null, visibleText: [], uncertainFields: [], branding: companyName, ...extra });
const entries: Array<[string, VisualReading["side"], CardReading]> = [
  ["trade_front", "FRONT", card("Example Blocks", "example-blocks.test", { personName: "Ava", branding: "EXAMPLE BLOCKS", uncertainFields: ["phones"] })],
  ["trade_back", "BACK", card("Sample Toy Factory Co., Ltd", "example-factory.test", { personName: "Ava", branding: "EXAMPLE BLOCKS", emails: [], visibleText: ["Building blocks", "Custom designs", "Printed cube illustration"] })],
  ["sensor", "FRONT", card("Example Sensors Co., Ltd", "example-sensors.test")],
  ["battery_front", "FRONT", card("Example Renewable Energy Co., Ltd", "example-energy.test", { visibleText: ["lawn mower batteries"], phones: ["+8613812345678"] })],
  ["technology", "FRONT", card("Example Technology", "example-technology.test")],
  ["battery_back", "BACK", card(null, "example-energy.test", { emails: [], branding: "EXAMPLE ENERGY", visibleText: ["Energy storage", "Power solutions", "Battery recycling"] })],
  ["watch", "FRONT", card("Example Watch", "example-watch.test")],
  ["brand_only", "BACK", card(null, null, { branding: "SAMPLE BRICKS", visibleText: ["SAMPLE BRICKS", "MODEL BRICKS"] })],
];
const messages: ReplayMessage[] = [];
{
  await mkdir(`${root}/assets`, { recursive: true });
  for (const [i, [id, side, c]] of entries.entries()) {
    const lines = [c.companyName ?? c.branding, c.personName, ...c.emails, ...c.websites, ...c.phones, ...c.visibleText].filter(Boolean);
    await png(`boundary_${id}`, `<html><body style="margin:0;background:#ddd8cc;font-family:Arial"><main style="margin:160px 120px;width:640px;height:360px;background:${side === "BACK" ? "#194a82" : "#fff"};color:${side === "BACK" ? "#fff" : "#182c3e"};box-shadow:3px 6px 6px #5556;box-sizing:border-box;padding:30px"><h1>${lines[0]}</h1>${lines.slice(1).map(l => `<div style="margin-top:12px">${l}</div>`).join("")}${id === "trade_back" || id === "brand_only" ? '<svg width="100" height="65" style="position:absolute;right:210px;top:410px"><polygon points="10,35 50,10 90,35 50,60" fill="#8cc"/><path d="M50 10V60M10 35H90" stroke="#123"/></svg>' : ''}<small style="position:absolute;left:150px;top:498px">PUBLIC SYNTHETIC CARD</small></main></body></html>`);
    const vision: VisualReading = { type: "BUSINESS_CARD", side, confidence: .98, readability: "readable", visual: "Small flat printed commercial card resting on a table; printed artwork has no physical depth", card: c, product: null };
    messages.push({ id, type: "IMAGE", timestamp: new Date(Date.UTC(2026, 9, 6, 12, 0, i)).toISOString(), asset: `assets/boundary_${id}.png`, mimeType: "image/png", mock: { vision: c.uncertainFields.length ? [vision, vision] : [vision], ocr: lines.join("\n"), extraction: { extractedFields: { companyName: c.companyName }, evidence: [], reviewFields: [], contactMethods: c.emails.map(rawText => ({ type: "EMAIL", rawText })), rawSource: { type: "IMAGE_BUSINESS_CARD", text: lines.join("\n") } } } });
  }
  const suppliers = ["sensor", "technology", "watch"].map(id => { const c = entries.find(e => e[0] === id)![2]; return { id, captureId: `${id}-capture`, companyId: "company", name: c.companyName!, city: null }; });
  const fixture: ReplayFixture = { version: 1, id: "P-eight-independent-cards", description: "Public synthetic equivalent of eight uploads after a suspended workflow. Mock vision tests pipeline integration, not model classification accuracy.", catalog: { trips: [{ id: "trip", name: "Replay China", companies: [{ id: "company", name: "Demo Company" }], suppliers }] }, supplierIdentities: suppliers.map(s => ({ supplierId: s.id, website: entries.find(e => e[0] === s.id)![2].websites[0], emails: entries.find(e => e[0] === s.id)![2].emails, phones: [] })), messages, agentMock: [ { tool: "prepare_evidence", args: { sources: "@activeSources" } }, { tool: "create_supplier_draft", args: { tripId: "@trip", companyId: "@company", evidenceIds: "@evidenceIds", notes: "lawn mower batteries" } }, { tool: "finish_turn", args: { response: null, guidance: null } } ], expected: [ { category: "extraction", path: "counts.assets_total", equals: 8 }, { category: "extraction", path: "counts.business_cards", equals: 8 }, { category: "association", path: "counts.supplier_loads", equals: 7 }, { category: "association", path: "counts.front_back_grouped", equals: 1 } ] };
  await writeFile(`${root}/P-eight-independent-cards.json`, `${JSON.stringify(fixture, null, 2)}\n`);
}
