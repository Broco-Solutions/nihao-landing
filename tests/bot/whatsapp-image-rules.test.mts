import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { buildEvidenceGraph, nextIngestionQuestion } from "../../lib/channels/whatsapp/evidence-grouping.ts";
import { AgentTools, sourceText } from "../../lib/channels/whatsapp/agent-tools.ts";
import { agentState, AgentCheckpoint, type AgentState } from "../../lib/channels/whatsapp/agent-contract.ts";
import type { BurstMessage, BurstSnapshot } from "../../lib/channels/whatsapp/burst-types.ts";
import type { VisualReading } from "../../lib/channels/whatsapp/ingestion-types.ts";
import { createAgentEnvironment, localAgentDatabase } from "../../evals/whatsapp-agent/environment.ts";
import { recordReceipt } from "../../lib/channels/whatsapp/agent-tools.ts";
import { parseProduct, supplierCommercialUpdate } from "../../lib/bot/supplier-edit.ts";
import { WhatsAppAgentService } from "../../lib/channels/whatsapp/agent-service.ts";
import type { BurstStore } from "../../lib/channels/whatsapp/burst-types.ts";
import { createWhatsAppAIClient } from "../../lib/channels/whatsapp/agent-provider.ts";
import { FetchMistralHttpClient, MistralExtractionProvider } from "../../lib/bot/extraction/mistral-extraction-provider.ts";
import { WhatsAppAgentOrchestrator } from "../../lib/channels/whatsapp/agent-orchestrator.ts";
import { readCaption } from "../../lib/channels/whatsapp/reading-enrichment.ts";
import { MISTRAL_TEXT_MODEL } from "../../lib/bot/extraction/mistral-extraction-provider.ts";
import { originalsNotice } from "../../lib/channels/whatsapp/clarification-rendering.ts";
import { BurstReader } from "../../lib/channels/whatsapp/burst-reader.ts";
import { ingestBurst } from "../../lib/channels/whatsapp/multimodal-ingestion.ts";

export function card(name: string): VisualReading {
  return { type: "BUSINESS_CARD", side: "FRONT", confidence: .98, readability: "readable", visual: "Tarjeta", product: null,
    card: { companyName: name, personName: null, role: null, emails: [`sales@${name.toLowerCase()}.test`], phones: [], websites: [], address: null, visibleText: [], uncertainFields: [], branding: null } };
}
export function photo(id: string, visual: VisualReading, caption: string | null = null): BurstMessage {
  const text = visual.card?.companyName ?? "";
  return { id, sequence: 1, sentAt: new Date("2026-10-08T19:07:03Z"), envelope: { instance: "test", phone: "123", messageId: id, type: "IMAGE", text: caption, media: null, sentAt: null },
    reading: { complete: true, imageKind: visual.type === "PRODUCT" ? "PRODUCT_IMAGE" : visual.type, productImageVerified: visual.type === "PRODUCT", ocr: text,
      ingestion: { classification: visual, status: "PARSED", stage: "parsed", attempts: [], loadIds: [] }, segments: [{ id: `${id}:1`, text,
        candidate: visual.card ? { extractedFields: { companyName: text }, contactMethods: visual.card.emails.map(rawText => ({ type: "EMAIL", rawText })), evidence: [], reviewFields: [], rawSource: { type: "IMAGE_BUSINESS_CARD", text } } : undefined }] } };
}
export function productPhoto(id: string, name: string, caption: string | null = null) {
  return photo(id, { type: "PRODUCT", side: "UNKNOWN_SIDE", confidence: .98, readability: "readable", visual: name, card: null, product: { description: name, brand: null, model: null, visibleText: [], packaging: false } }, caption);
}
export function text(id: string, value: string): BurstMessage {
  return { id, sequence: 1, sentAt: new Date("2026-10-08T19:07:10Z"), envelope: { instance: "test", phone: "123", messageId: id, type: "TEXT", text: value, media: null, sentAt: null }, reading: { complete: true, segments: [{ id: `${id}:1`, text: value }] } };
}
export function snapshot(messages: BurstMessage[]): BurstSnapshot {
  const s: BurstSnapshot = { id: randomUUID(), instance: "test", phone: "123", userId: "user", leaseId: "lease", status: "PROCESSING", revision: messages.length,
    state: { tripId: null, groups: [], question: null, pendingRefs: [], controlIds: [] }, messages: messages.map((m, i) => ({ ...m, sequence: i + 1 })) };
  s.state.ingestion = buildEvidenceGraph(s); return s;
}

test("two cards followed by commercial and general comments use the second supplier", () => {
  const s = snapshot([photo("first", card("Pulverzar")), photo("second", card("Janicey")), text("terms", "FOB 3200 MOQ 3"), text("exports", "ya exportan a Argentina"), text("logo", "chequear si le podemos poner nuestro logo")]);
  const supplier = s.state.ingestion!.loads.find(l => l.name === "Janicey")!;
  for (const id of ["terms", "exports", "logo"]) assert.equal(s.state.ingestion!.links.find(l => l.sourceAssetId === id && l.relationship === "FACTS_FOR")?.targetLoadId, supplier.id);
  assert.equal(nextIngestionQuestion(s), null);
});

test("disputed OCR fields on a card do not orphan its following supplier comments", () => {
  const c = photo("second", card("Janicey"));
  c.reading!.ingestion!.status = "NEEDS_REVIEW";
  c.reading!.ingestion!.error = { type: "AMBIGUOUS_CARD_READING", stage: "reconciliation", retryable: false };
  const s = snapshot([photo("first", card("Pulverzar")), c, text("exports", "ya exportan a Argentina"), text("logo", "chequear si le podemos poner nuestro logo")]);
  const supplier = s.state.ingestion!.loads.find(l => l.name === "Janicey")!;
  assert.equal(supplier.status, "NEEDS_REVIEW");
  for (const id of ["exports", "logo"]) assert.equal(s.state.ingestion!.links.find(l => l.sourceAssetId === id && l.relationship === "FACTS_FOR")?.targetLoadId, supplier.id);
});

test("real AI: supplier comments and creation of a named product use the production tools", { skip: process.env.EVAL_IMAGE_RULES_REAL_AI !== "true" || !process.env.EVAL_AGENT_DATABASE_URL }, async () => {
  const db = localAgentDatabase();
  const env = await createAgentEnvironment(db, { trips: [{ id: "trip", name: "China", companies: [{ id: "company", name: "Broco" }] }] });
  const useMistral = process.env.EVAL_IMAGE_RULES_MISTRAL === "true";
  const client = useMistral ? new FetchMistralHttpClient(process.env.MISTRAL_API_KEY!) : createWhatsAppAIClient();
  const extractor = new MistralExtractionProvider({ client: new FetchMistralHttpClient(process.env.MISTRAL_API_KEY!), businessCards: { async resolve() { throw new Error("No external storage in this eval"); } } });
  async function run(messages: BurstMessage[]) {
    await db.whatsAppBurst.updateMany({ where: { userId: env.userId }, data: { status: "DONE" } });
    const s = snapshot(messages); s.userId = env.userId; s.phone = "5491112345678";
    s.state.tripId = env.id("trip"); s.state.operationalContext = { tripId: env.id("trip"), companyId: env.id("company") };
    for (const m of s.messages) {
      if (m.envelope.type === "IMAGE") {
        m.reading!.storageKey = `real-image-rules/${m.id}`; m.reading!.mimeType = "image/jpeg";
        await env.storage.put({ key: m.reading!.storageKey, body: new Uint8Array([0xff, 0xd8, 0xff, 1]), contentType: "image/jpeg" });
        if (m.envelope.text) m.reading!.ingestion!.caption = await readCaption(client, m.envelope.text, m.reading!.imageKind);
      } else {
        m.reading!.segments[0].candidate = await extractor.extractReading(m.envelope.text!, { type: "TEXT", text: m.envelope.text! });
      }
    }
    s.state.ingestion = buildEvidenceGraph(s); s.state = agentState(s.state); await env.persist(s);
    let claimed = false; let reply = "";
    const store = { async claim() { if (claimed) return []; claimed = true; return [s]; }, async catalog() { return env.catalog; }, async saveReading() {}, async finish(_s: BurstSnapshot, state: AgentState, value: string) { s.state = state; reply = value; await env.save(s, state); }, async retry() { assert.fail("Real AI worker did not finish"); }, async flushReplies() {} } as unknown as BurstStore;
    await new WhatsAppAgentService({ ingestion: true, store, domain: env.domain, reader: { async read(m) { return m.reading!; } }, orchestrator: new WhatsAppAgentOrchestrator({ domain: env.domain, client, extraction: extractor, ...(useMistral ? { model: MISTRAL_TEXT_MODEL } : {}) }), async save(_id, _revision, _lease, state) { await env.save(s, state); return true; }, async send() { assert.fail("No WhatsApp messages in evals"); } }).processDue(1);
    return { s, reply };
  }
  try {
    const first = await run([photo(randomUUID(), card("Pulverzar")), photo(randomUUID(), card("Janicey"), "FOB 3200 MOQ 3"), text(randomUUID(), "ya exportan a Argentina"), text(randomUUID(), "chequear si le podemos poner nuestro logo")]);
    assert.equal(first.s.state.question, null, first.reply);
    const supplier = await db.supplier.findFirstOrThrow({ where: { createdById: env.userId, companyName: "Janicey" } });
    assert.equal(Number(supplier.fobAmount), 3200); assert.equal(supplier.moqQuantity, 3);
    assert.match(supplier.notes!, /ya exportan a Argentina/); assert.match(supplier.notes!, /chequear si le podemos poner nuestro logo/);
    assert.equal(await db.supplier.count({ where: { createdById: env.userId } }), 2);
    const next = text(randomUUID(), "guardar producto botella"); next.sentAt = new Date("2026-10-08T19:15:00Z");
    const second = await run([next]); assert.equal(second.s.state.question, null, second.reply);
    const product = await db.supplierProduct.findFirstOrThrow({ where: { capture: { createdById: env.userId } } });
    assert.match(product.name.toLowerCase(), /botella/); assert.equal(product.supplierId, supplier.id);
    assert.equal(product.fobAmount, null); assert.equal(product.moqQuantity, null);
  } finally { await env.cleanup(); await db.$disconnect(); }
});
test("a product photo supplies a grounded name without OCR or user text", async () => {
  const s = snapshot([productPhoto("desk", "Escritorio regulable")]);
  assert.match(sourceText(s, "desk"), /Escritorio regulable/);
  const state = agentState(s.state); s.state = state;
  const tools = new AgentTools({ catalog: { trips: [] }, domain: {} as never, extraction: { async extractReading(value) { return { extractedFields: {}, evidence: [], reviewFields: [], rawSource: { type: "TEXT", text: value } }; } }, async checkpoint() {} });
  const prepared = await tools.execute("prepare_evidence", { sources: [{ messageId: "desk", role: "FACTS", quote: null }] }, s, state) as { evidence: Array<{ text: string }> };
  assert.match(prepared.evidence[0].text, /Escritorio regulable/);
});
test("the caption's explicit product name overrides visual identity", () => {
  const m = productPhoto("desk", "Mesa con patas metálicas", "escritorio regulable");
  m.reading!.ingestion!.caption = { supplierReference: null, supplierNotes: null, pendingFacts: null, products: [{ name: "escritorio regulable", notes: null, fob: null, moq: null, leadTime: null }] };
  const s = snapshot([m]);
  assert.equal(s.state.ingestion!.loads[0].name, "escritorio regulable");
  assert.equal(sourceText(s, "desk"), "escritorio regulable", "Do not duplicate caption evidence and make a unique quote ambiguous");
});
test("association clarification identifies the actual text instead of calling it an image", () => {
  const s = snapshot([photo("a", card("Alpha")), photo("b", card("Beta")), text("terms", "El tercer proveedor tiene MOQ 500")]);
  const q = nextIngestionQuestion(s)!;
  assert.match(q.question, /El tercer proveedor tiene MOQ 500/);
  assert.doesNotMatch(q.question, /esta imagen/);
  assert.equal(q.associationSource?.assetId, "terms");
});

test("a named product cannot be blocked by a generic request for more details", async () => {
  const s = snapshot([text("bottle", "guardar producto botella")]);
  const state = agentState(s.state); s.state = state;
  const tools = new AgentTools({ catalog: { trips: [] }, domain: {} as never, extraction: { async extractReading() { assert.fail("No extra facts needed"); } }, async checkpoint() {} });
  await assert.rejects(tools.execute("ask_clarification", { question: "¿Qué datos tenés de la botella?", options: null, pendingProducts: [{ name: "botella", supplierQuery: null }] }, s, state), /nombre alcanza/);
  await assert.rejects(tools.execute("ask_clarification", { question: "¿Cómo querés identificar el producto: botella o con un nombre más específico?", options: null, pendingProducts: [{ name: "botella", supplierQuery: null }] }, s, state), /nombre alcanza/);
  await assert.rejects(tools.execute("ask_clarification", { question: "No hay un registro existente llamado botella. ¿Querés que lo registre como un producto nuevo?", options: null, pendingProducts: [{ name: "botella", supplierQuery: null }] }, s, state), /nombre alcanza/);
});

test("supplier commercial updates retain omitted components and never clear other terms", () => {
  const existing = parseProduct({ name: "Supplier", fob: { amount: 30, currency: "USD", unit: null, rawText: "FOB 30 usd" }, moq: { quantity: 50, unit: null, notes: null, rawText: "MOQ 50" } });
  assert.deepEqual(supplierCommercialUpdate(existing, { fob: { amount: 40, rawText: "FOB 40" } }), { fobAmount: 40, fobCurrency: "USD", fobUnit: null, fobRawText: "FOB 40" });
});

test("an unsolicited numeric reply does not open a question that blocks the next message", async () => {
  const s = snapshot([text("obsolete-selection", "1")]); let reply = "";
  let claimed = false;
  const store = { async claim() { if (claimed) return []; claimed = true; return [s]; }, async catalog() { return { trips: [{ id: "trip", name: "China", companies: [{ id: "company", name: "Broco" }] }] }; }, async saveReading() {}, async finish(_s: BurstSnapshot, state: AgentState, value: string) { s.state = state; reply = value; }, async retry() { assert.fail("No failure expected"); }, async flushReplies() {} } as unknown as BurstStore;
  await new WhatsAppAgentService({ ingestion: true, store, domain: { async receipts() { return []; } } as never, reader: { async read(m) { return m.reading!; } }, orchestrator: { async run() { assert.fail("An obsolete selection needs no model"); } } as never, async save() { return true; }, async send() { assert.fail("No WhatsApp delivery"); } }).processDue(1);
  assert.match(reply, /No hay una selección pendiente/); assert.equal(s.state.question, null); assert.equal(agentState(s.state).agent.pending, null); assert.equal(s.state.ingestion!.summary.pending, 0);
});

test("a persisted supplier comment finishes without asking what else to do", async () => {
  const s = snapshot([text("supplier-comment", "ese proveedor tiene bajo MOQ y FOB qingdao")]); let reply = ""; let claimed = false;
  const receipt = { operationId: "saved-comment", tool: "update_supplier", id: "supplier", status: "COMPLETED", name: "HIGOLD", completedRevision: s.revision, logicalLoadIds: [s.state.ingestion!.loads[0].id] };
  const store = { async claim() { if (claimed) return []; claimed = true; return [s]; }, async catalog() { return { trips: [{ id: "trip", name: "China", companies: [{ id: "company", name: "Broco" }] }] }; }, async saveReading() {}, async finish(_s: BurstSnapshot, state: AgentState, value: string) { s.state = state; reply = value; }, async retry() { assert.fail("No failure expected"); }, async flushReplies() {} } as unknown as BurstStore;
  await new WhatsAppAgentService({ ingestion: true, store, domain: { async persistPreviousSupplierComments() { return [receipt]; }, async receipts() { return [receipt]; } } as never, reader: { async read(m) { return m.reading!; } }, orchestrator: { async run() { assert.fail("A saved comment needs no further model question"); } } as never, async save() { return true; }, async send() { assert.fail("No WhatsApp delivery"); } }).processDue(1);
  assert.match(reply, /HIGOLD.*actualizado/); assert.equal(s.state.question, null); assert.equal(agentState(s.state).agent.pending, null);
});

test("storage failures retain the inbox message for retry without claiming the image was saved", async () => {
  const m = photo(randomUUID(), card("Alpha")); m.reading = null;
  m.envelope.media = { key: { id: m.id, fromMe: false, remoteJid: "123@s.whatsapp.net" }, message: { imageMessage: {} } };
  const s = snapshot([m]); let savedStatus = "";
  const reader = new BurstReader({ storage: { async put() { throw new Error("temporary storage failure"); }, async get() { return null; }, async delete() {}, async signedUrl() { return "unused"; } }, client: { async getMedia() { return { bytes: new Uint8Array([0xff, 0xd8, 0xff]), mimeType: "image/jpeg" }; } }, analyzer: { async readImage() { assert.fail("Original must be stored first"); }, async segmentAudio() { return { segments: [], confident: true }; } }, extraction: { async extractReading() { assert.fail("Original must be stored first"); } }, transcription: { async transcribe() { assert.fail("No audio"); } }, mistral: { async post() { assert.fail("Original must be stored first"); } } });
  await assert.rejects(ingestBurst(s, reader, async (_id, reading) => { savedStatus = reading.ingestion!.status; }, Date.now() + 120000), AgentCheckpoint);
  assert.equal(savedStatus, "PENDING_RETRY"); assert.equal(s.messages[0].reading?.storageKey, undefined);
  assert.doesNotMatch(originalsNotice(s), /originales están guardadas/);
  assert.equal(s.messages[0].envelope.messageId, m.id);
});

test("PostgreSQL: cards, notes, visual products and pending photos retain originals and destinations", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async t => {
  const db = localAgentDatabase();
  const env = await createAgentEnvironment(db, { trips: [{ id: "trip", name: "China", companies: [{ id: "company", name: "Broco" }] }] });
  async function persist(s: BurstSnapshot) {
    await db.whatsAppBurst.updateMany({ where: { userId: env.userId }, data: { status: "DONE" } });
    s.userId = env.userId; s.phone = "5491112345678";
    s.state.tripId = env.id("trip"); s.state.operationalContext = { tripId: env.id("trip"), companyId: env.id("company") };
    for (const m of s.messages.filter(m => m.envelope.type === "IMAGE")) {
      m.reading!.storageKey = `image-rules/${m.id}`; m.reading!.mimeType = "image/jpeg";
      await env.storage.put({ key: m.reading!.storageKey, body: new Uint8Array([0xff, 0xd8, 0xff, 1]), contentType: "image/jpeg" });
    }
    s.state = agentState(s.state); await env.persist(s);
  }
  try {
    await t.test("the October 8 two-card pattern saves conditions and notes on the second supplier", async () => {
      const first = photo(randomUUID(), card("Pulverzar"));
      const second = photo(randomUUID(), card("Janicey"), "FOB 3200 MOQ 3");
      second.reading!.ingestion!.status = "NEEDS_REVIEW";
      second.reading!.ingestion!.error = { type: "AMBIGUOUS_CARD_READING", stage: "reconciliation", retryable: false };
      second.reading!.ingestion!.caption = { supplierReference: null, supplierNotes: null, products: [], pendingFacts: { notes: null, fob: { amount: 3200, currency: null, unit: null, rawText: "FOB 3200" }, moq: { quantity: 3, unit: null, notes: null, rawText: "MOQ 3" }, leadTime: null } };
      const s = snapshot([first, second, text(randomUUID(), "ya exportan a Argentina"), text(randomUUID(), "chequear si le podemos poner nuestro logo")]);
      await persist(s);
      for (const load of s.state.ingestion!.loads.filter(l => l.type === "SUPPLIER")) recordReceipt(agentState(s.state), await env.domain.persistImageLoad(s, load.id));
      await env.domain.persistCaptions(s); await env.domain.persistCaptions(s);
      const suppliers = await db.supplier.findMany({ where: { createdById: env.userId }, include: { capture: { include: { attachments: true } } } });
      assert.equal(suppliers.length, 2);
      const janicey = suppliers.find(x => x.companyName === "Janicey")!;
      assert.equal(Number(janicey.fobAmount), 3200); assert.equal(janicey.fobCurrency, null); assert.equal(janicey.moqQuantity, 3);
      assert.match(janicey.notes!, /ya exportan a Argentina/); assert.match(janicey.notes!, /chequear si le podemos poner nuestro logo/);
      for (const supplier of suppliers) assert.equal(supplier.capture.attachments.length, 1);
      assert.equal(await db.supplierProduct.count({ where: { capture: { createdById: env.userId } } }), 0);
      assert.equal(await db.whatsAppPendingEvidence.count({ where: { userId: env.userId } }), 0);
      await env.save(s, agentState(s.state)); await db.whatsAppBurst.update({ where: { id: s.id }, data: { status: "DONE" } });
    });
    await t.test("literal guardar producto botella creates once without a model or inherited supplier terms", async () => {
      const m = text(randomUUID(), "guardar producto botella"); m.sentAt = new Date("2026-10-08T19:09:00Z");
      const s = snapshot([m]); await persist(s);
      const receipts = await env.domain.persistProductLoads(s); assert.equal(receipts.length, 1); receipts.forEach(r => recordReceipt(agentState(s.state), r));
      assert.equal((await env.domain.persistProductLoads(s)).length, 0);
      const product = await db.supplierProduct.findUniqueOrThrow({ where: { id: receipts[0].id }, include: { supplier: true } });
      assert.equal(product.name, "botella"); assert.equal(product.supplier!.companyName, "Janicey"); assert.equal(product.fobAmount, null); assert.equal(product.moqQuantity, null);
    });
    await t.test("visual name creates a product under the previous supplier without inheriting its terms", async () => {
      const m = productPhoto(randomUUID(), "Escritorio regulable"); m.sentAt = new Date("2026-10-08T19:10:00Z");
      const s = snapshot([m]); await persist(s);
      const receipts = await env.domain.persistProductLoads(s); assert.equal(receipts.length, 1);
      receipts.forEach(r => recordReceipt(agentState(s.state), r));
      assert.equal((await env.domain.persistProductLoads(s)).length, 0);
      const product = await db.supplierProduct.findUniqueOrThrow({ where: { id: receipts[0].id }, include: { supplier: true, images: true } });
      assert.equal(product.name, "Escritorio regulable"); assert.equal(product.supplier!.companyName, "Janicey");
      assert.equal(product.fobAmount, null); assert.equal(product.moqQuantity, null); assert.equal(product.images.length, 1);
      assert.equal(product.images[0].type, "PRODUCT_IMAGE");
    });
    await t.test("explicit caption name wins and a new card changes the destination", async () => {
      const c = photo(randomUUID(), card("Fenbe")); c.sentAt = new Date("2026-10-08T19:11:00Z");
      const m = productPhoto(randomUUID(), "Mesa metálica", "Escritorio azul MOQ 50"); m.sentAt = new Date("2026-10-08T19:12:00Z");
      m.reading!.ingestion!.caption = { supplierReference: null, supplierNotes: null, products: [{ name: "Escritorio azul", notes: null, fob: null, moq: { quantity: 50, unit: null, notes: null, rawText: "MOQ 50" }, leadTime: null }], pendingFacts: null };
      const s = snapshot([c, m]); await persist(s);
      assert.equal((await env.domain.persistProductLoads(s)).length, 0);
      const cardLoad = s.state.ingestion!.loads.find(l => l.type === "SUPPLIER")!;
      recordReceipt(agentState(s.state), await env.domain.persistImageLoad(s, cardLoad.id));
      const receipts = await env.domain.persistProductLoads(s); assert.equal(receipts.length, 1);
      const product = await db.supplierProduct.findUniqueOrThrow({ where: { id: receipts[0].id }, include: { supplier: true, images: true } });
      assert.equal(product.name, "Escritorio azul"); assert.equal(product.supplier!.companyName, "Fenbe"); assert.equal(product.moqQuantity, 50); assert.equal(product.images.length, 1);
    });
    await t.test("a named product on a card owns the following commercial text", async () => {
      const c = photo(randomUUID(), card("DeskSupplier"), "Escritorio regulable MOQ 50"); c.sentAt = new Date("2026-10-08T19:13:00Z");
      c.reading!.ingestion!.caption = { supplierReference: null, supplierNotes: null, pendingFacts: null, products: [{ name: "Escritorio regulable", notes: null, fob: null, moq: { quantity: 50, unit: null, notes: null, rawText: "MOQ 50" }, leadTime: null }] };
      const price = text(randomUUID(), "FOB 30 usd"); price.sentAt = new Date("2026-10-08T19:13:10Z");
      price.reading!.segments[0].candidate = { extractedFields: { fob: { amount: 30, currency: "USD", unit: null, rawText: "FOB 30 usd" } }, rawSource: { type: "TEXT", text: "FOB 30 usd" }, evidence: [], reviewFields: [] };
      const s = snapshot([c, price]); await persist(s);
      const load = s.state.ingestion!.loads.find(l => l.type === "SUPPLIER")!;
      const receipt = await env.domain.persistImageLoad(s, load.id); recordReceipt(agentState(s.state), receipt);
      await env.domain.persistCaptions(s); await env.domain.persistCaptions(s);
      const product = await db.supplierProduct.findFirstOrThrow({ where: { captureId: receipt.captureId }, include: { images: true } });
      assert.equal(Number(product.fobAmount), 30); assert.equal(product.fobCurrency, "USD"); assert.equal(product.moqQuantity, 50);
      const supplier = await db.supplier.findUniqueOrThrow({ where: { id: receipt.id } });
      assert.equal(supplier.fobAmount, null); assert.equal(supplier.moqQuantity, null);
      assert.equal(product.images.length, 0); assert.equal(await db.supplierAttachment.count({ where: { supplierCaptureId: receipt.captureId } }), 1);
      assert.ok(JSON.stringify(product.sourceEvidence).includes(price.id));
    });
    await t.test("comments before a new card update the active product of the preceding supplier", async () => {
      const price = text(randomUUID(), "MOQ 1 FOB 50"); price.sentAt = new Date("2026-10-08T19:14:00Z");
      price.reading!.segments[0].candidate = { extractedFields: { fob: { amount: 50, currency: null, unit: null, rawText: "FOB 50" }, moq: { quantity: 1, unit: null, notes: null, rawText: "MOQ 1" } }, rawSource: { type: "TEXT", text: "MOQ 1 FOB 50" }, evidence: [], reviewFields: [] };
      const notes = text(randomUUID(), "color blanco, negro y marrón oscuro"); notes.sentAt = new Date("2026-10-08T19:14:01Z");
      const c = photo(randomUUID(), card("NextSupplier")); c.sentAt = new Date("2026-10-08T19:14:02Z");
      const s = snapshot([price, notes, c]); await persist(s);
      const original = await db.supplier.findFirstOrThrow({ where: { createdById: env.userId, companyName: "DeskSupplier" } });
      agentState(s.state).agent.resolvedRecords = [{ id: original.id, kind: "SUPPLIER", version: original.updatedAt.toISOString() }];
      const receipts = await env.domain.persistPreviousSupplierComments(s);
      assert.equal(receipts.length, 2); receipts.forEach(r => recordReceipt(agentState(s.state), r));
      assert.equal((await env.domain.persistPreviousSupplierComments(s)).length, 0);
      const previous = await db.supplier.findFirstOrThrow({ where: { createdById: env.userId, companyName: "DeskSupplier" } });
      assert.equal(previous.fobAmount, null); assert.equal(previous.moqQuantity, null);
      const product = await db.supplierProduct.findFirstOrThrow({ where: { supplierId: previous.id } });
      assert.equal(Number(product.fobAmount), 50); assert.equal(product.moqQuantity, 1); assert.match(product.notes!, /color blanco/);
      const newLoad = s.state.ingestion!.loads.find(l => l.type === "SUPPLIER")!;
      recordReceipt(agentState(s.state), await env.domain.persistImageLoad(s, newLoad.id));
      const next = await db.supplier.findUniqueOrThrow({ where: { id: newLoad.resourceId! } });
      assert.equal(next.fobAmount, null); assert.equal(next.moqQuantity, null);
      assert.equal(nextIngestionQuestion(s), null);
    });
    await t.test("supplier terms without quantity or price preserve literal information across bursts", async () => {
      const m = text(randomUUID(), "ese proveedor tiene bajo MOQ y FOB qingdao"); m.sentAt = new Date("2026-10-08T19:14:30Z");
      m.reading!.segments[0].candidate = { extractedFields: { fob: { amount: null, currency: null, unit: null, rawText: "FOB qingdao" }, moq: { quantity: null, unit: null, notes: "bajo", rawText: "bajo MOQ" } }, rawSource: { type: "TEXT", text: m.envelope.text! }, evidence: [], reviewFields: [] };
      const s = snapshot([m]); await persist(s);
      const receipts = await env.domain.persistPreviousSupplierComments(s); assert.equal(receipts.length, 0);
      // Standalone terms now go through interpretation; explicit supplier intent
      // still applies directly via the normal validated tools.
      const supplierTarget = (await env.domain.resolveConversationReference(s, "SUPPLIER"))[0];
      const tools = new AgentTools({ domain: env.domain, extraction: { async extractReading() { return m.reading!.segments[0].candidate!; } }, catalog: env.catalog, async checkpoint() {} });
      const current = agentState(s.state);
      await tools.execute("get_supplier", { id: supplierTarget.id }, s, current);
      const prepared = await tools.execute("prepare_evidence", { sources: [{ messageId: m.id, role: "FACTS" }] }, s, current) as { evidence: { id: string }[] };
      await tools.execute("update_supplier", { id: supplierTarget.id, patch: { fob: { rawText: "FOB qingdao" }, moq: { notes: "bajo", rawText: "bajo MOQ" } }, evidenceIds: prepared.evidence.map(e => e.id) }, s, current);
      const supplier = await db.supplier.findUniqueOrThrow({ where: { id: supplierTarget.id } });
      assert.equal(supplier.companyName, "NextSupplier"); assert.equal(supplier.fobAmount, null); assert.equal(supplier.fobRawText, "FOB qingdao"); assert.equal(supplier.moqQuantity, null); assert.equal(supplier.moqNotes, "bajo");
    });
    await t.test("factory follow-up introduces desks with their own FOB and delivery", async () => {
      const supplier = await db.supplier.findFirstOrThrow({ where: { createdById: env.userId, companyName: "NextSupplier" } });
      await db.supplier.update({ where: { id: supplier.id }, data: { supplierType: "FACTORY" } });
      const before = await db.supplier.findUniqueOrThrow({ where: { id: supplier.id } });
      const literal = "Tambien Fabrica escritorios, esos tienen un Fob de 45 y un tardan 60 dias";
      const m = text(randomUUID(), literal); m.sentAt = new Date("2026-10-08T19:14:45Z");
      m.reading!.segments[0].candidate = { extractedFields: { fob: { amount: 45, currency: null, unit: null, rawText: "Fob de 45" }, leadTime: { days: 60, rawText: "60 dias" } }, rawSource: { type: "TEXT", text: literal }, evidence: [], reviewFields: [] };
      const s = snapshot([m]); await persist(s);
      assert.deepEqual(await env.domain.persistPreviousSupplierComments(s), []);
      const refs = await env.domain.resolveConversationReference(s, "SUPPLIER");
      assert.equal(refs[0].id, supplier.id);
      const current = agentState(s.state);
      const tools = new AgentTools({ domain: env.domain, extraction: { async extractReading() { return m.reading!.segments[0].candidate!; } }, catalog: env.catalog, async checkpoint() {} });
      await tools.execute("get_supplier", { id: supplier.id }, s, current);
      const prepared = await tools.execute("prepare_evidence", { sources: [{ messageId: m.id, role: "FACTS" }] }, s, current) as { evidence: { id: string }[] };
      const args = { supplierId: supplier.id, name: "escritorios", evidenceIds: prepared.evidence.map(e => e.id) };
      const saved = await tools.execute("create_product_draft", args, s, current) as { id: string };
      await tools.execute("create_product_draft", args, s, current);
      const product = await db.supplierProduct.findUniqueOrThrow({ where: { id: saved.id } });
      assert.equal(product.name, "escritorios"); assert.equal(product.supplierId, supplier.id);
      assert.equal(Number(product.fobAmount), 45); assert.equal(product.fobCurrency, null); assert.equal(product.leadTimeDays, 60);
      assert.equal(await db.supplierProduct.count({ where: { supplierId: supplier.id, name: "escritorios" } }), 1);
      const after = await db.supplier.findUniqueOrThrow({ where: { id: supplier.id } });
      for (const field of ["fobAmount", "fobCurrency", "fobRawText", "leadTimeDays", "leadTimeRawText", "supplierType", "notes"] as const) assert.equal(String(after[field]), String(before[field]));
    });
    await t.test("a product preceding the first supplier card cannot use that later supplier", async () => {
      const m = productPhoto(randomUUID(), "Vaso de vidrio"); m.sentAt = new Date("2026-10-08T19:15:00Z");
      const c = photo(randomUUID(), card("FutureSupplier")); c.sentAt = new Date("2026-10-08T19:15:01Z");
      const s = snapshot([m, c]); await persist(s); s.instance += "-future-only";
      await db.whatsAppBurst.update({ where: { id: s.id }, data: { instance: s.instance } });
      const cardLoad = s.state.ingestion!.loads.find(l => l.type === "SUPPLIER")!;
      recordReceipt(agentState(s.state), await env.domain.persistImageLoad(s, cardLoad.id));
      assert.equal((await env.domain.persistProductLoads(s)).length, 0);
      assert.equal(s.state.ingestion!.loads.find(l => l.type === "PRODUCT")!.resourceId, undefined);
    });
    await t.test("a photo without previous supplier is retained and its question identifies the image", async () => {
      const m = productPhoto(randomUUID(), "Vaso de vidrio");
      const s = snapshot([m]); s.instance = "new-context"; await persist(s);
      s.instance += "-fresh";
      await db.whatsAppBurst.update({ where: { id: s.id }, data: { instance: s.instance } });
      let claimed = false; let reply = "";
      const store = { async claim() { if (claimed) return []; claimed = true; return [s]; }, async catalog() { return env.catalog; }, async saveReading() {}, async finish(_s: BurstSnapshot, state: AgentState, value: string) { s.state = state; reply = value; }, async retry() { assert.fail("No infrastructure failure"); }, async flushReplies() {} } as unknown as BurstStore;
      const service = new WhatsAppAgentService({ ingestion: true, store, domain: env.domain, reader: { async read(message) { return message.reading!; } }, orchestrator: { async run() { assert.fail("Named photo needs no model to ask its missing supplier"); } } as never, async save() { return true; }, async send() { assert.fail("No real sends"); } });
      await service.processDue(1);
      assert.match(reply, /Vaso de vidrio/); assert.match(reply, /16:07/); assert.match(reply, /original está guardado/); assert.match(reply, /proveedor/);
      assert.equal(agentState(s.state).agent.pending?.sourceMessageIds?.[0], m.id);
      assert.ok(await env.storage.get(m.reading!.storageKey!));
      assert.equal(s.state.ingestion!.loads[0].resourceId, undefined);
    });
  } finally { await env.cleanup(); await db.$disconnect(); }
});
