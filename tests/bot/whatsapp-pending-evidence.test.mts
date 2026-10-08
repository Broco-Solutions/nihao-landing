import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createAgentEnvironment, localAgentDatabase } from "../../evals/whatsapp-agent/environment.ts";
import { agentState, type AgentEvidence, type AgentState } from "../../lib/channels/whatsapp/agent-contract.ts";
import { recordReceipt } from "../../lib/channels/whatsapp/agent-tools.ts";
import { buildEvidenceGraph } from "../../lib/channels/whatsapp/evidence-grouping.ts";
import { WhatsAppAgentService } from "../../lib/channels/whatsapp/agent-service.ts";
import type { BurstMessage, BurstSnapshot, BurstStore } from "../../lib/channels/whatsapp/burst-types.ts";
import type { VisualReading } from "../../lib/channels/whatsapp/ingestion-types.ts";
import type { CaptionFacts } from "../../lib/channels/whatsapp/reading-enrichment.ts";

const commercial: CaptionFacts = { fob: { amount: 50, currency: null, unit: null, rawText: "FOB 50" }, moq: { quantity: 15000, unit: null, notes: null, rawText: "MOQ 15000" }, leadTime: null, notes: null };
function card(name = "YKO blocks manufactory", pending = true): BurstMessage {
  const id = randomUUID();
  const classification: VisualReading = { type: "BUSINESS_CARD", side: "FRONT", confidence: 0.99, readability: "readable", visual: "Tarjeta", product: null, card: { companyName: name, emails: [`${id}@supplier.test`], phones: [], websites: [], personName: null, role: null, address: null, visibleText: [], uncertainFields: [], branding: null } };
  return { id, sequence: 1, sentAt: null, envelope: { instance: "pending-test", phone: "5491112345678", messageId: id, type: "IMAGE", text: pending ? "FOB 50 MOQ 15000" : null, media: null, sentAt: null }, reading: { complete: true, storageKey: `original/${id}`, mimeType: "image/jpeg", imageKind: "BUSINESS_CARD", ocr: name, segments: [], ingestion: { status: "PARSED", stage: "parsed", attempts: [], loadIds: [], classification, caption: { supplierReference: null, supplierNotes: null, products: [], pendingFacts: pending ? structuredClone(commercial) : null } } } };
}
function camera(name = "Camara con usb"): BurstMessage {
  const id = randomUUID();
  const classification: VisualReading = { type: "PRODUCT", side: "UNKNOWN_SIDE", confidence: 0.98, readability: "readable", visual: "Cámara con cable", card: null, product: { brand: null, model: null, packaging: false, description: "Cámara con cable", visibleText: [] } };
  return { id, sequence: 1, sentAt: null, envelope: { instance: "pending-test", phone: "5491112345678", messageId: id, type: "IMAGE", text: name, media: null, sentAt: null }, reading: { complete: true, storageKey: `original/${id}`, mimeType: "image/jpeg", imageKind: "PRODUCT_IMAGE", productImageVerified: true, ocr: "chouze", segments: [{ id: `${id}:1`, text: `chouze\n${name}`, candidate: { extractedFields: {}, evidence: [], reviewFields: [], rawSource: { type: "TEXT", text: `chouze\n${name}` } } }], ingestion: { status: "PARSED", stage: "parsed", attempts: [], loadIds: [], classification, caption: { supplierReference: null, supplierNotes: null, products: [{ name, notes: null, fob: null, moq: null, leadTime: null }], pendingFacts: null } } } };
}

test("PostgreSQL: pending commercial evidence survives bursts and applies only to its next product", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async t => {
  const prisma = localAgentDatabase();
  async function fixture(run: (f: Awaited<ReturnType<typeof setup>>) => Promise<void>) {
    const f = await setup();
    try { await run(f); } finally { await f.env.cleanup(); }
  }
  async function setup() {
    const env = await createAgentEnvironment(prisma, { trips: [{ id: "trip", name: "Viaje de pruebas", companies: [{ id: "company", name: "Broco" }] }] });
    let clock = Date.now() - 60000;
    async function turn(input: BurstMessage | BurstMessage[]) {
      const messages = Array.isArray(input) ? input : [input];
      for (const [index, message] of messages.entries()) {
        clock += 2000; message.sequence = index + 1;
        message.sentAt = new Date(clock); message.envelope.sentAt = message.sentAt.toISOString();
      }
      const s: BurstSnapshot = { id: randomUUID(), userId: env.userId, instance: "pending-test", phone: "5491112345678", revision: messages.length, leaseId: randomUUID(), status: "PROCESSING", messages, state: { tripId: env.id("trip"), operationalContext: { tripId: env.id("trip"), companyId: env.id("company") }, groups: [], pendingRefs: [], controlIds: [], question: null } };
      s.state = agentState(s.state); s.state.ingestion = buildEvidenceGraph(s);
      for (const message of messages) if (message.reading?.storageKey) await env.storage.put({ key: message.reading.storageKey, body: new Uint8Array([0xff, 0xd8, 0xff, 1]), contentType: "image/jpeg" });
      await prisma.whatsAppBurst.updateMany({ where: { userId: env.userId }, data: { status: "DONE" } });
      await env.persist(s);
      return s;
    }
    async function supplier(message = card()) {
      const s = await turn(message);
      const receipt = await env.domain.persistImageLoad(s, s.state.ingestion!.loads[0].id);
      recordReceipt(s.state as AgentState, receipt);
      await env.domain.persistCaptions(s); await env.save(s, s.state as AgentState);
      return { s, receipt };
    }
    async function worker(s: BurstSnapshot) {
      let claimed = false;
      const store = { async claim() { if (claimed) return []; claimed = true; return [s]; }, async catalog() { return env.catalog; }, async saveReading() {}, async finish(_s: BurstSnapshot, state: AgentState) { await env.save(s, state); }, async retry() { assert.fail("Worker must complete this valid upload"); }, async flushReplies() {} } as unknown as BurstStore;
      await new WhatsAppAgentService({ ingestion: true, domain: env.domain, store, reader: { async read(m) { return m.reading!; } }, orchestrator: { async run() { assert.fail("A named photo with resolved supplier needs no model call"); } } as never, async save(_id, _rev, _lease, state) { await env.save(s, state); return true; }, async send() {} }).processDue(1);
    }
    function photoEvidence(s: BurstSnapshot): AgentEvidence {
      const message = s.messages[0], segment = message.reading!.segments[0];
      return { id: `${message.id}:product`, messageId: message.id, text: segment.text, start: 0, end: segment.text.length, role: "FACTS", candidate: segment.candidate! };
    }
    async function writePhoto(s: BurstSnapshot, supplierId: string, evidence = [photoEvidence(s)]) {
      return env.domain.write(s, { tool: "create_product_draft", tripId: env.id("trip"), companyId: env.id("company"), targetId: supplierId, targetKind: "SUPPLIER", name: "Camara con usb", notes: null, evidence });
    }
    return { env, turn, supplier, worker, photoEvidence, writePhoto };
  }
  try {
    await t.test("card facts are durable, camera is confirmed with its own image and facts consumed once", async () => fixture(async ({ env, turn, supplier }) => {
      const first = await supplier();
      await env.domain.persistCaptions(first.s);
      const pending = await prisma.whatsAppPendingEvidence.findMany({ where: { userId: env.userId } });
      assert.equal(pending.length, 1); assert.equal(pending[0].status, "PENDING"); assert.deepEqual(pending[0].facts, commercial);
      assert.equal(pending[0].text, "FOB 50 MOQ 15000");
      assert.equal(await prisma.supplierProduct.count({ where: { captureId: first.receipt.captureId } }), 0);
      const second = await turn(camera());
      const prepared = await env.domain.preparePendingEvidence(second, pending[0].id);
      assert.equal(prepared?.pendingId, pending[0].id); assert.equal(prepared?.text, pending[0].text);
      const [result] = await env.domain.persistProductLoads(second);
      assert.ok(result); recordReceipt(second.state as AgentState, result);
      const product = await prisma.supplierProduct.findUniqueOrThrow({ where: { id: result.id }, include: { images: true, capture: true } });
      assert.equal(product.name, "Camara con usb"); assert.equal(product.status, "CONFIRMED");
      assert.equal(product.supplierId, first.receipt.id); assert.equal(product.captureId, first.receipt.captureId);
      assert.equal(Number(product.fobAmount), 50); assert.equal(product.fobCurrency, null); assert.equal(product.moqQuantity, 15000);
      assert.equal(product.images.length, 1);
      const provenance = JSON.stringify(product.sourceEvidence);
      assert.ok(provenance.includes(first.s.messages[0].id)); assert.ok(provenance.includes(second.messages[0].id));
      assert.equal(second.state.ingestion!.loads[0].resourceId, product.id);
      const applied = await prisma.whatsAppPendingEvidence.findUniqueOrThrow({ where: { id: pending[0].id } });
      assert.equal(applied.status, "APPLIED"); assert.equal(applied.targetProductId, product.id); assert.ok(applied.appliedAt);
      assert.deepEqual(await env.domain.persistProductLoads(second), []);
      assert.equal(await prisma.supplierCapture.count({ where: { createdById: env.userId } }), 1);
      assert.equal(await prisma.supplierProduct.count({ where: { captureId: first.receipt.captureId } }), 1);
      assert.equal(await prisma.supplierAttachment.count({ where: { productId: product.id } }), 1);
      const third = await turn(camera("Camara sin usb"));
      const [next] = await env.domain.persistProductLoads(third);
      const nextProduct = await prisma.supplierProduct.findUniqueOrThrow({ where: { id: next.id } });
      assert.equal(nextProduct.fobAmount, null); assert.equal(nextProduct.moqQuantity, null);
    }));
    await t.test("changing supplier does not drag pending facts to that supplier's product", async () => fixture(async ({ env, turn, supplier }) => {
      const previous = await supplier();
      const current = await supplier(card("Otro proveedor", false));
      const s = await turn(camera());
      assert.deepEqual(await env.domain.pendingEvidence(s), []);
      const [result] = await env.domain.persistProductLoads(s);
      const product = await prisma.supplierProduct.findUniqueOrThrow({ where: { id: result.id } });
      assert.equal(product.supplierId, current.receipt.id); assert.equal(product.fobAmount, null); assert.equal(product.moqQuantity, null);
      const oldPending = await prisma.whatsAppPendingEvidence.findFirstOrThrow({ where: { captureId: previous.receipt.captureId } });
      assert.notEqual(oldPending.status, "APPLIED");
    }));
    await t.test("two named product photos in one batch consume pending facts only in original order", async () => fixture(async ({ env, turn, supplier }) => {
      const previous = await supplier();
      const s = await turn([camera("Camara con usb"), camera("Camara sin usb")]);
      const results = await env.domain.persistProductLoads(s);
      assert.equal(results.length, 2);
      const products = await prisma.supplierProduct.findMany({ where: { captureId: previous.receipt.captureId }, orderBy: { name: "asc" } });
      assert.equal(products[0].name, "Camara con usb"); assert.equal(Number(products[0].fobAmount), 50); assert.equal(products[0].moqQuantity, 15000);
      assert.equal(products[1].name, "Camara sin usb"); assert.equal(products[1].fobAmount, null); assert.equal(products[1].moqQuantity, null);
      const pending = await prisma.whatsAppPendingEvidence.findFirstOrThrow({ where: { userId: env.userId } });
      assert.equal(pending.targetProductId, products[0].id);
    }));
    await t.test("reset does not expose pending conditions to an independent product", async () => fixture(async ({ env, turn, supplier }) => {
      const first = await supplier();
      const resetMessage: BurstMessage = { id: randomUUID(), sequence: 1, sentAt: null, envelope: { instance: "pending-test", phone: "5491112345678", messageId: randomUUID(), type: "TEXT", text: "Empezar de nuevo", media: null, sentAt: null }, reading: { complete: true, segments: [] } };
      const reset = await turn(resetMessage);
      await env.domain.resetConversationContext(reset);
      const second = await turn(camera());
      assert.deepEqual(await env.domain.pendingEvidence(second), []);
      assert.deepEqual(await env.domain.persistProductLoads(second), []);
      assert.equal(await prisma.supplierCapture.count({ where: { createdById: env.userId } }), 1);
      assert.equal(await prisma.supplierProduct.count({ where: { captureId: first.receipt.captureId } }), 0);
    }));
    await t.test("pending IDs remain isolated by user, phone and instance", async () => fixture(async ({ env, turn, supplier }) => {
      await supplier();
      const pending = await prisma.whatsAppPendingEvidence.findFirstOrThrow({ where: { userId: env.userId } });
      const s = await turn(camera());
      assert.ok(await env.domain.preparePendingEvidence(s, pending.id));
      for (const isolated of [{ ...s, userId: "other-user" }, { ...s, phone: "5499999999999" }, { ...s, instance: "other-instance" }]) {
        assert.equal(await env.domain.preparePendingEvidence(isolated, pending.id), null);
      }
      assert.equal(await env.domain.preparePendingEvidence(s, randomUUID()), null);
      assert.equal((await prisma.whatsAppPendingEvidence.findUniqueOrThrow({ where: { id: pending.id } })).status, "PENDING");
    }));
    await t.test("worker completes the card then named photo without model calls or phantom suppliers", async () => fixture(async ({ env, turn, worker }) => {
      await worker(await turn(card()));
      const second = await turn(camera()); await worker(second);
      const products = await prisma.supplierProduct.findMany({ where: { capture: { createdById: env.userId } }, include: { images: true } });
      assert.equal(products.length, 1); assert.equal(products[0].status, "CONFIRMED"); assert.equal(products[0].images.length, 1);
      assert.equal(Number(products[0].fobAmount), 50); assert.equal(products[0].moqQuantity, 15000);
      assert.equal(await prisma.supplierCapture.count({ where: { createdById: env.userId } }), 1);
      assert.equal(second.state.question, null);
    }));
    await t.test("worker waits for the new card in a mixed burst before assigning the photo", async () => fixture(async ({ env, turn, supplier, worker }) => {
      const earlier = await supplier(card("Proveedor anterior", false));
      const s = await turn([card("Nuevo proveedor"), camera()]);
      await worker(s);
      const product = await prisma.supplierProduct.findFirstOrThrow({ where: { capture: { createdById: env.userId }, name: "Camara con usb" }, include: { supplier: true, images: true } });
      assert.equal(product.supplier!.companyName, "Nuevo proveedor"); assert.notEqual(product.supplierId, earlier.receipt.id);
      assert.equal(Number(product.fobAmount), 50); assert.equal(product.moqQuantity, 15000); assert.equal(product.images.length, 1);
      assert.equal(await prisma.supplierCapture.count({ where: { createdById: env.userId } }), 2);
    }));
    await t.test("explicit supplier replaces the previous destination without borrowing its pending prices", async () => fixture(async ({ turn, supplier, writePhoto }) => {
      const explicit = await supplier(card("Alfa", false));
      const previous = await supplier(card("Beta"));
      const photo = camera(); photo.envelope.text = "Camara con usb para proveedor Alfa";
      photo.reading!.segments[0].text = photo.envelope.text;
      photo.reading!.segments[0].candidate!.rawSource.text = photo.envelope.text;
      const s = await turn(photo);
      const result = await writePhoto(s, explicit.receipt.id);
      const product = await prisma.supplierProduct.findUniqueOrThrow({ where: { id: result.id } });
      assert.equal(product.supplierId, explicit.receipt.id); assert.equal(product.fobAmount, null); assert.equal(product.moqQuantity, null);
      const pending = await prisma.whatsAppPendingEvidence.findFirstOrThrow({ where: { captureId: previous.receipt.captureId } });
      assert.notEqual(pending.status, "APPLIED");
    }));
    await t.test("supplier completion order does not replace the last supplier in message order", async () => fixture(async ({ env, turn }) => {
      const s = await turn([card("Primero", false), card("Segundo", false), camera()]);
      const suppliers = s.state.ingestion!.loads.filter(load => load.type === "SUPPLIER");
      const newer = await env.domain.persistImageLoad(s, suppliers[1].id); recordReceipt(s.state as AgentState, newer);
      const older = await env.domain.persistImageLoad(s, suppliers[0].id); recordReceipt(s.state as AgentState, older);
      const context = await env.domain.conversationContext(s);
      assert.deepEqual(context.suppliers.map(supplier => supplier.id), [newer.id]);
      const [result] = await env.domain.persistProductLoads(s);
      const product = await prisma.supplierProduct.findUniqueOrThrow({ where: { id: result.id } });
      assert.equal(product.supplierId, newer.id);
    }));
    await t.test("incoming literal price overrides pending price without inventing USD", async () => fixture(async ({ env, turn, supplier }) => {
      await supplier();
      const photo = camera(); photo.envelope.text = "Camara con usb FOB 70";
      photo.reading!.segments[0].text = photo.envelope.text;
      photo.reading!.segments[0].candidate!.rawSource.text = photo.envelope.text;
      photo.reading!.ingestion!.caption!.products[0].fob = { amount: 70, currency: null, unit: null, rawText: "FOB 70" };
      const s = await turn(photo);
      const [result] = await env.domain.persistProductLoads(s);
      const product = await prisma.supplierProduct.findUniqueOrThrow({ where: { id: result.id } });
      assert.equal(Number(product.fobAmount), 70); assert.equal(product.fobCurrency, null); assert.equal(product.moqQuantity, 15000);
      assert.equal(product.fobRawText, "FOB 70");
    }));
    await t.test("pending product notes and lead time remain grounded after association", async () => fixture(async ({ env, turn, supplier }) => {
      const source = card(); source.envelope.text = "FOB 50 MOQ 15000 viene en rojo plazo 7 dias";
      source.reading!.ingestion!.caption!.pendingFacts!.notes = "viene en rojo";
      source.reading!.ingestion!.caption!.pendingFacts!.leadTime = { days: 7, rawText: "plazo 7 dias" };
      await supplier(source);
      const s = await turn(camera());
      const [result] = await env.domain.persistProductLoads(s);
      const product = await prisma.supplierProduct.findUniqueOrThrow({ where: { id: result.id } });
      assert.equal(product.notes, "viene en rojo"); assert.equal(product.leadTimeDays, 7); assert.equal(product.leadTimeRawText, "plazo 7 dias");
      assert.ok(JSON.stringify(product.sourceEvidence).includes(source.envelope.text));
    }));
    await t.test("forged historical pending evidence cannot be written to another supplier", async () => fixture(async ({ env, turn, supplier, photoEvidence, writePhoto }) => {
      await supplier(card("Alfa"));
      const sourcePending = await prisma.whatsAppPendingEvidence.findFirstOrThrow({ where: { userId: env.userId } });
      const other = await supplier(card("Beta", false));
      const s = await turn(camera());
      const forged: AgentEvidence = { id: sourcePending.id, pendingId: sourcePending.id, messageId: sourcePending.sourceMessageId, start: 0, end: sourcePending.text.length, text: sourcePending.text, role: "FACTS", candidate: { extractedFields: { fob: commercial.fob, moq: commercial.moq }, rawSource: { type: "TEXT", text: sourcePending.text }, evidence: [], reviewFields: [] } };
      await assert.rejects(writePhoto(s, other.receipt.id, [forged, photoEvidence(s)]), /evidencia histórica no está pendiente/);
      assert.equal(await prisma.supplierProduct.count({ where: { capture: { createdById: env.userId } } }), 0);
    }));
    await t.test("named product in a card caption consumes prior pending facts for that supplier", async () => fixture(async ({ env, turn, supplier }) => {
      const previous = await supplier();
      const source = card("YKO blocks manufactory", false);
      source.envelope.text = "Producto Camara con usb";
      source.reading!.ingestion!.caption!.products = [{ name: "Camara con usb", notes: null, fob: null, moq: null, leadTime: null }];
      const s = await turn(source);
      s.state.ingestion!.loads[0].resourceId = previous.receipt.id;
      await env.domain.persistCaptions(s); await env.domain.persistCaptions(s);
      const products = await prisma.supplierProduct.findMany({ where: { captureId: previous.receipt.captureId }, include: { images: true } });
      assert.equal(products.length, 1); assert.equal(Number(products[0].fobAmount), 50); assert.equal(products[0].moqQuantity, 15000);
      assert.equal(products[0].images.length, 0);
      const pending = await prisma.whatsAppPendingEvidence.findFirstOrThrow({ where: { userId: env.userId } });
      assert.equal(pending.status, "APPLIED"); assert.equal(pending.targetProductId, products[0].id);
    }));
    await t.test("conditions-only product photo preserves its caption without creating a named product or supplier", async () => fixture(async ({ env, turn, supplier }) => {
      const previous = await supplier(card("Alfa", false));
      const photo = camera(); photo.envelope.text = "FOB 50 MOQ 15000";
      photo.reading!.segments[0].text = photo.envelope.text;
      photo.reading!.ingestion!.caption = { supplierReference: null, supplierNotes: null, products: [], pendingFacts: structuredClone(commercial) };
      const s = await turn(photo);
      await env.domain.persistCaptions(s);
      const pending = await prisma.whatsAppPendingEvidence.findFirstOrThrow({ where: { userId: env.userId } });
      assert.equal(pending.captureId, previous.receipt.captureId); assert.equal(pending.text, photo.envelope.text); assert.equal(pending.status, "PENDING");
      assert.deepEqual(await env.domain.persistProductLoads(s), []);
      assert.equal(await prisma.supplierCapture.count({ where: { createdById: env.userId } }), 1);
      assert.equal(await prisma.supplierProduct.count({ where: { captureId: previous.receipt.captureId } }), 0);
    }));
  } finally { await prisma.$disconnect(); }
});
