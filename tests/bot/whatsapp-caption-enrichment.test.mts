import test from "node:test";
import assert from "node:assert/strict";
import { cardCandidate } from "../../lib/channels/whatsapp/multimodal-reading.ts";
import { BurstReader } from "../../lib/channels/whatsapp/burst-reader.ts";
import { readCaption, romanizeCompanyName } from "../../lib/channels/whatsapp/reading-enrichment.ts";
import { productUpdateData, parseProduct } from "../../lib/bot/supplier-edit.ts";
import { assertGroundedNotes } from "../../lib/bot/notes.ts";
import type { BurstMessage } from "../../lib/channels/whatsapp/burst-types.ts";
import type { VisualReading } from "../../lib/channels/whatsapp/ingestion-types.ts";
const response = (value: unknown) => ({ choices: [{ message: { content: JSON.stringify(value) } }] });
const caption = "Tienen vasos de color rojo y verde con un precio FOB de 30usd";
const extracted = { supplierReference: null, supplierNotes: null, products: [{ name: "vasos", notes: "de color rojo y verde", fob: { amount: 30, currency: "USD", unit: null, rawText: "FOB de 30usd" }, moq: null, leadTime: null }] };
test("caption keeps literal colours, structured FOB and rejects invented prices", async () => {
  const result = await readCaption({ async post() { return response(extracted); } }, caption);
  assert.equal(result.products[0].fob!.amount, 30); assert.equal(result.products[0].notes, "de color rojo y verde");
  const invented = structuredClone(extracted); invented.products[0].fob.amount = 300;
  await assert.rejects(readCaption({ async post() { return response(invented); } }, caption), /numérico/);
  assert.equal(result.pendingFacts, null);
});
const pendingCaption = { supplierReference: null, supplierNotes: null, products: [], pendingFacts: { fob: { amount: 50, currency: null, unit: null, rawText: "FOB 50" }, moq: { quantity: 15000, unit: null, notes: null, rawText: "MOQ 15000" }, leadTime: null, notes: null } };
test("caption preserves unnamed commercial facts without assuming currency or a product", async () => {
  const result = await readCaption({ async post(_path, body) {
    const request = body as { response_format: { json_schema: { schema: { required: string[]; properties: Record<string, unknown> } } }; messages: Array<{ content: string }> };
    assert.ok(request.response_format.json_schema.schema.required.includes("pendingFacts"));
    assert.ok(request.messages[0].content.includes("currency=null"));
    return response(pendingCaption);
  } }, "FOB 50 MOQ 15000");
  assert.deepEqual(result.products, []);
  assert.deepEqual(result.pendingFacts, pendingCaption.pendingFacts);
});
test("pending caption facts reject invented values, currencies and nonliteral source text", async () => {
  const inventedAmount = structuredClone(pendingCaption); inventedAmount.pendingFacts.fob.amount = 500;
  await assert.rejects(readCaption({ async post() { return response(inventedAmount); } }, "FOB 50 MOQ 15000"), /numérico/);
  const inventedCurrency = { ...pendingCaption, pendingFacts: { ...pendingCaption.pendingFacts, fob: { ...pendingCaption.pendingFacts.fob, currency: "USD" } } };
  await assert.rejects(readCaption({ async post() { return response(inventedCurrency); } }, "FOB 50 MOQ 15000"), /Moneda/);
  const inventedQuote = structuredClone(pendingCaption); inventedQuote.pendingFacts.moq.rawText = "MOQ 15000 unidades";
  await assert.rejects(readCaption({ async post() { return response(inventedQuote); } }, "FOB 50 MOQ 15000"), /literal/);
});
test("named product conditions cannot also be pending caption facts", async () => {
  const result = await readCaption({ async post() { return response({ ...extracted, pendingFacts: null }); } }, caption);
  assert.equal(result.pendingFacts, null);
  const duplicated = { ...extracted, pendingFacts: { notes: null, fob: extracted.products[0].fob, moq: null, leadTime: null } };
  await assert.rejects(readCaption({ async post() { return response(duplicated); } }, caption), /ya asociada/);
});
test("product image captions supply the explicit name without requiring the word producto", async () => {
  const camera = { supplierReference: null, supplierNotes: null, products: [{ name: "Camara con usb", notes: null, fob: null, moq: null, leadTime: null }], pendingFacts: null };
  const result = await readCaption({ async post(_path, body) {
    const request = body as { messages: Array<{ content: string }> };
    assert.deepEqual(JSON.parse(request.messages[1].content), { caption: "Camara con usb", imageKind: "PRODUCT_IMAGE" });
    assert.ok(request.messages[0].content.includes("aunque no diga producto"));
    assert.ok(request.messages[0].content.includes("no son nombres de producto"));
    return response(camera);
  } }, "Camara con usb", "PRODUCT_IMAGE");
  assert.deepEqual(result, camera);
});
test("pending product notes remain literal and cannot replace structured commercial fields", async () => {
  const withNotes = { ...pendingCaption, pendingFacts: { ...pendingCaption.pendingFacts, notes: "viene en rojo" } };
  const result = await readCaption({ async post() { return response(withNotes); } }, "FOB 50 MOQ 15000 viene en rojo");
  assert.equal(result.pendingFacts!.notes, "viene en rojo");
  await assert.rejects(readCaption({ async post() { return response(withNotes); } }, "FOB 50 MOQ 15000"), /Notas sin evidencia/);
  const structuredNotes = { ...pendingCaption, pendingFacts: { ...pendingCaption.pendingFacts, notes: "FOB 50" } };
  await assert.rejects(readCaption({ async post() { return response(structuredNotes); } }, "FOB 50 MOQ 15000"), /campo estructurado/);
});
test("web notes replace or clear while bot notes append without duplicates", () => {
  const existing = { id: "p", captureId: "c", supplierId: null, createdAt: new Date(), updatedAt: new Date(), sourceText: null, sourceEvidence: [], reviewFields: [], sourceConflicts: [], ...parseProduct({ name: "Vaso", notes: "Anterior." }), fobAmount: null, status: "DRAFT" as const, images: [] };
  assert.equal(productUpdateData(existing, { notes: "Nueva." }).notes, "Anterior.\nNueva.");
  assert.equal(productUpdateData(existing, { notes: "Nueva.", notesMode: "replace" }).notes, "Nueva.");
  assert.equal(productUpdateData(existing, { notes: "", notesMode: "replace" }).notes, null);
  assert.equal(assertGroundedNotes("FOB sujeto a negociación.", ["FOB sujeto a negociación."]), "FOB sujeto a negociación.");
});
test("Latin names need no model call and Chinese names preserve the original separately", async () => {
  assert.equal(await romanizeCompanyName({ async post() { assert.fail("No call for English"); } }, "Able Packaging Co., Ltd"), null);
  assert.equal(await romanizeCompanyName({ async post() { return response({ nameLatin: "Ningbo" }); } }, "宁波"), "Ningbo");
  assert.equal(await romanizeCompanyName({ async post() { assert.fail("Printed English name already present"); } }, "Able Packaging / 宁波"), "Able Packaging");
});
test("missing minimum fields trigger superior vision on original image and checkpoint once", async () => {
  const original = new Uint8Array([0xff, 0xd8, 0xff]);
  const card = (companyName: string | null, email?: string): VisualReading => ({ type: "BUSINESS_CARD", side: "FRONT", confidence: 0.98, readability: "readable", visual: "Card", product: null, card: { companyName, personName: null, role: null, emails: email ? [email] : [], phones: [], websites: [], address: null, visibleText: [], branding: null, uncertainFields: [] } });
  const withWebsite=card("Able Packaging", "sales@able.test"); withWebsite.card!.websites=["www.able.test"];
  assert.equal(cardCandidate(withWebsite.card!).candidate.website,"https://www.able.test");
  assert.ok(cardCandidate(withWebsite.card!).text.includes("www.able.test"));
  const models: string[] = [];
  const reader = new BurstReader({ multimodal: true,
    storage: { async get() { return new Response(original).body; }, async put() {}, async delete() {}, async signedUrl() { return "private"; } },
    client: { async getMedia() { assert.fail("Already persisted original"); } },
    analyzer: { async readImage() { return ""; }, async segmentAudio() { return { segments: [], confident: true }; } },
    transcription: { async transcribe() { assert.fail("No audio"); } },
    extraction: { async extractReading(text) { return { extractedFields: {}, evidence: [], reviewFields: [], rawSource: { type: "TEXT", text } }; } },
    mistral: { async post(_path, body) { const request = body as { model: string; messages: Array<{ content: unknown }> }; models.push(request.model); assert.ok(JSON.stringify(request.messages).includes(Buffer.from(original).toString("base64"))); return models.length === 1 ? response(card(null)) : { choices: [{ message: { content: [{ type: "thinking", thinking: "private" }, { type: "text", text: JSON.stringify(card("Able Packaging", "sales@able.test")) }] } }] }; } },
  });
  const message: BurstMessage = { id: "higher", sequence: 1, sentAt: null, envelope: { instance: "test", messageId: "higher", phone: "123", type: "IMAGE", media: null, text: null, sentAt: null }, reading: { storageKey: "original", mimeType: "image/jpeg", segments: [] } };
  const checkpoints: string[] = [];
  const result = await reader.read(message, async r => { checkpoints.push(r.ingestion!.stage); });
  assert.equal(models.at(-1), "mistral-large-4-0"); assert.equal(result.ingestion!.fallback!.reading.card!.companyName, "Able Packaging");
  assert.equal(result.segments[0].candidate!.extractedFields.companyName, "Able Packaging"); assert.ok(checkpoints.includes("superior_vision"));
  await reader.read(message, async () => {}); assert.equal(models.length, 2);
});
