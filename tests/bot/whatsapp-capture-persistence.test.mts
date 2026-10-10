import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client.ts";
import { PrismaSupplierCaptureRepository } from "../../lib/bot/persistence/prisma-repository.ts";
import { SupplierExtractionService } from "../../lib/bot/extraction/service.ts";
import { reconcileSupplierConfirmation } from "../../lib/bot/persistence/supplier-confirmation.ts";
import { renderBatchSummary } from "../../lib/channels/whatsapp/clarification-rendering.ts";
import { captureEvidence } from "../../lib/channels/whatsapp/capture-evidence.ts";
import { buildEvidenceGraph } from "../../lib/channels/whatsapp/evidence-grouping.ts";
import { agentState, type AgentState } from "../../lib/channels/whatsapp/agent-contract.ts";
import { WhatsAppAgentService } from "../../lib/channels/whatsapp/agent-service.ts";
import { createAgentEnvironment, localAgentDatabase } from "../../evals/whatsapp-agent/environment.ts";
import type { BurstMessage, BurstSnapshot, BurstStore } from "../../lib/channels/whatsapp/burst-types.ts";
import type { VisualReading } from "../../lib/channels/whatsapp/ingestion-types.ts";

function image(name: string | null, email: string | null, ambiguous = false): BurstMessage {
  const id = randomUUID();
  const visual: VisualReading = { type: "BUSINESS_CARD", side: "FRONT", confidence: ambiguous ? 0.5 : 0.97, readability: ambiguous ? "ambiguous" : "readable", visual: "Tarjeta", product: null, card: { companyName: name, emails: email ? [email] : [], phones: [], websites: [], personName: null, role: null, address: null, visibleText: [], uncertainFields: [], branding: null } };
  return { id, sequence: 1, sentAt: null, envelope: { instance: "capture-test", phone: "123", messageId: id, type: "IMAGE", text: null, media: null, sentAt: null }, reading: { complete: true, storageKey: `original/${id}`, mimeType: "image/jpeg", imageKind: "BUSINESS_CARD", ocr: [name, email].filter(Boolean).join("\n"), segments: [], ingestion: { status: ambiguous ? "NEEDS_REVIEW" : "PARSED", stage: "parsed", attempts: [], loadIds: [], classification: visual, ...(ambiguous ? { error: { type: "AMBIGUOUS_CARD_READING", retryable: false, stage: "reconciliation" } } : {}) } } };
}
function snapshot(messages: BurstMessage[]): BurstSnapshot {
  const s: BurstSnapshot = { id: randomUUID(), userId: "user", instance: "capture-test", phone: "123", revision: messages.length, leaseId: "lease", status: "PROCESSING", state: { tripId: null, groups: [], pendingRefs: [], controlIds: [], question: null }, messages: messages.map((m, i) => ({ ...m, sequence: i + 1 })) };
  s.state = agentState(s.state); s.state.ingestion = buildEvidenceGraph(s); return s;
}
test("OCR y visión en conflicto conservan campos leídos y todas las alternativas en la lectura", () => {
  const m = image("Alfa", "sales@alfa.test", true);
  m.reading!.ingestion!.classification!.card!.phones = ["+8612345678"];
  m.reading!.ingestion!.reconciliation = { version: 1, ocr: { company: "Otra empresa", emails: ["sales@alfa.test"], phones: ["8612349999"], domains: [], rawEmails: ["sales@alfa.test"], rawPhones: ["+8612349999"], rawDomains: [] }, first: { disagreements: ["companyName", "phones"], signals: [] } };
  const e = captureEvidence(m);
  assert.equal(e.candidate.extractedFields.companyName, "Alfa");
  assert.deepEqual(e.candidate.contactMethods, [{ type: "EMAIL", rawText: "sales@alfa.test" }, { type: "PHONE", rawText: "+8612345678" }]);
  assert.equal(m.reading!.ingestion!.classification!.card!.companyName, "Alfa");
  assert.equal(m.reading!.ingestion!.reconciliation.ocr.company, "Otra empresa");
});
test("teléfono dudoso queda guardado junto al email válido", () => {
  const m = image("Alfa", "sales@alfa.test");
  m.reading!.ingestion!.classification!.card!.phones = ["+8612345678"];
  m.reading!.ingestion!.classification!.card!.uncertainFields = ["phones"];
  assert.deepEqual(captureEvidence(m).candidate.contactMethods, [{ type: "EMAIL", rawText: "sales@alfa.test" }, { type: "PHONE", rawText: "+8612345678" }]);
});

test("dos lecturas incompatibles conservan nombre y alternativas", () => {
  const m = image("Primera", "sales@shared.test", true);
  const second = structuredClone(m.reading!.ingestion!.classification!);
  second.card!.companyName = "Segunda";
  m.reading!.ingestion!.independentReadings = [m.reading!.ingestion!.classification!, second];
  assert.equal(captureEvidence(m).candidate.extractedFields.companyName, "Primera");
  assert.equal(captureEvidence(m).candidate.extractedFields.contact, "sales@shared.test");
});
test("resumen usa la confirmación posterior del draft y sólo recibos completos", () => {
  const summary = renderBatchSummary({ totalAssets: 1, totalLogicalLoads: 1, processed: 1, pending: 0, needsReview: 0, failed: 0 }, [
    { operationId: "create", tool: "create_supplier_draft", id: "capture", captureId: "capture", status: "COMPLETED", resourceStatus: "DRAFT", name: "Alfa" },
    { operationId: "update", tool: "update_supplier", id: "supplier", captureId: "capture", status: "COMPLETED", resourceStatus: "CONFIRMED", name: "Alfa" },
    { operationId: "unfinished", tool: "create_supplier_draft", id: "other", status: "WRITTEN", resourceStatus: "DRAFT" },
  ]);
  assert.match(summary, /1 proveedor cargado/); assert.match(summary, /Todo listo/); assert.doesNotMatch(summary, /borrador/);
});

test("persistencia automática de todas las tarjetas con PostgreSQL local", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async t => {
  const prisma = localAgentDatabase();
  const env = await createAgentEnvironment(prisma, { trips: [{ id: "trip", name: "China", companies: [{ id: "company", name: "Broco" }], suppliers: [{ id: "existing", captureId: "existing-capture", companyId: "company", name: "Existing", city: null }] }] });
  async function setup(messages: BurstMessage[]) {
    const s = snapshot(messages); s.userId = env.userId; s.state.tripId = env.id("trip"); s.state.operationalContext = { tripId: env.id("trip"), companyId: env.id("company") };
    for (const m of messages) await env.storage.put({ key: m.reading!.storageKey!, body: new Uint8Array([0xff, 0xd8, 0xff, 1]), contentType: "image/jpeg" });
    await prisma.whatsAppBurst.updateMany({ where: { userId: env.userId }, data: { status: "DONE" } });
    await env.persist(s); return s;
  }
  try {
    for (const [label, name, email, ambiguous, expected] of [
      ["lectura ambigua con nombre/email confirma", "Alfa", "sales@alfa.test", true, "CONFIRMED"],
      ["lectura ambigua sólo nombre guarda draft", "Beta", null, true, "DRAFT"],
      ["nombre y contacto válido confirman", "Gamma", "sales@gamma.test", false, "CONFIRMED"],
      ["imagen ilegible guarda captura sin inventar nombre", null, null, true, "DRAFT"],
    ] as const) await t.test(label, async () => {
      const s = await setup([image(name, email, ambiguous)]);
      const load = s.state.ingestion!.loads[0];
      const result = await env.domain.persistImageLoad(s, load.id);
      const capture = await prisma.supplierCapture.findUniqueOrThrow({ where: { id: result.captureId }, include: { attachments: true } });
      assert.equal(capture.companyName, name); assert.equal(capture.status, expected);
      assert.equal(capture.attachments.length, 1); assert.equal(capture.sourceAttachmentId, capture.attachments[0].id);
      assert.ok(JSON.stringify(capture.evidence).includes(s.messages[0].reading!.storageKey!));
      assert.deepEqual(await env.domain.persistImageLoad(s, load.id), result);
      assert.equal(await prisma.whatsAppAgentOperation.count({ where: { burstId: s.id } }), 1);
      assert.equal(await prisma.supplierAttachment.count({ where: { supplierCaptureId: capture.id } }), 1);
    });
    await t.test("teléfono dudoso y email válido persisten todos los contactos leídos", async () => {
      const m = image("PhoneUncertain", "sales@phone.test", true);
      m.reading!.ingestion!.classification!.card!.phones = ["+8612345678"];
      m.reading!.ingestion!.classification!.card!.uncertainFields = ["phones"];
      const s = await setup([m]);
      const r = await env.domain.persistImageLoad(s, s.state.ingestion!.loads[0].id);
      const capture = await prisma.supplierCapture.findUniqueOrThrow({ where: { id: r.captureId } });
      assert.equal(capture.status, "CONFIRMED");
      assert.deepEqual(capture.contactMethods, [{ type: "EMAIL", rawText: "sales@phone.test" }, { type: "PHONE", rawText: "+8612345678" }]);
      assert.equal(capture.contact, "sales@phone.test; +8612345678");
      assert.match(JSON.stringify(capture.evidence), /8612345678/);
    });
    await t.test("discrepancias OCR/visión se guardan sin identidad inventada", async () => {
      const m = image("Vision Company", "sales@conflict.test", true);
      m.reading!.ingestion!.reconciliation = { version: 1, ocr: { company: "OCR Company", emails: ["sales@conflict.test"], phones: [], domains: [], rawEmails: ["sales@conflict.test"], rawPhones: [], rawDomains: [] }, first: { disagreements: ["companyName"], signals: [] } };
      const s = await setup([m]); const r = await env.domain.persistImageLoad(s, s.state.ingestion!.loads[0].id);
      const capture = await prisma.supplierCapture.findUniqueOrThrow({ where: { id: r.captureId }, include: { attachments: true } });
      assert.equal(capture.companyName, "Vision Company"); assert.equal(capture.contact, "sales@conflict.test");
      assert.equal(capture.status, "CONFIRMED"); assert.equal(capture.attachments.length, 1);
      for (const alternative of ["OCR Company", "Vision Company"]) assert.ok(JSON.stringify(capture.evidence).includes(alternative));
    });
    await t.test("reanálisis conserva provenance y la referencia al original", async () => {
      const s = await setup([image("Reanalysis", null, true)]);
      const r = await env.domain.persistImageLoad(s, s.state.ingestion!.loads[0].id);
      const before = await prisma.supplierCapture.findUniqueOrThrow({ where: { id: r.captureId } });
      const extraction = new SupplierExtractionService([]).mergeCandidates([{ extractedFields: { companyName: "Reanalysis" }, rawSource: { type: "TEXT", text: "Reanalysis" }, evidence: [], reviewFields: [] }]);
      await new PrismaSupplierCaptureRepository(prisma).replaceExtraction({ userId: env.userId, tripId: env.id("trip") }, r.captureId!, extraction);
      const after = await prisma.supplierCapture.findUniqueOrThrow({ where: { id: r.captureId } });
      assert.deepEqual(after.evidence, before.evidence); assert.equal(after.sourceAttachmentId, before.sourceAttachmentId);
    });
    await t.test("corrección del editor web usa la misma regla y conserva la evidencia al confirmar", async () => {
      const s = await setup([image("WebCompletion", null, true)]);
      const r = await env.domain.persistImageLoad(s, s.state.ingestion!.loads[0].id);
      const before = await prisma.supplierCapture.findUniqueOrThrow({ where: { id: r.captureId } });
      await prisma.$transaction(async tx => {
        const repo = new PrismaSupplierCaptureRepository(tx as PrismaClient);
        await repo.correctField({ userId: env.userId, tripId: env.id("trip"), captureId: r.captureId!, field: "contact", value: "sales@web.test", acknowledgedUnknown: false });
        const promoted = await reconcileSupplierConfirmation(tx, r.captureId!);
        assert.equal(promoted.resourceStatus, "CONFIRMED");
        assert.equal((await repo.getCapture({ userId: env.userId, tripId: env.id("trip") }, r.captureId!))?.status, "CONFIRMED");
      });
      const after = await prisma.supplierCapture.findUniqueOrThrow({ where: { id: r.captureId } });
      assert.deepEqual(after.evidence, before.evidence); assert.equal(after.sourceAttachmentId, before.sourceAttachmentId);
    });
    await t.test("existente ambiguo queda intacto y captura separada tiene vínculo candidato", async () => {
      const before = await prisma.supplier.findUniqueOrThrow({ where: { id: env.id("existing") } });
      const s = await setup([image("Existing", "new@existing.test", true)]);
      assert.equal(await env.domain.resolveExistingSupplier(s, s.state.ingestion!.loads[0].id), null);
      const r = await env.domain.persistImageLoad(s, s.state.ingestion!.loads[0].id);
      assert.notEqual(r.captureId, before.captureId); assert.equal(r.resourceStatus, "CONFIRMED");
      assert.deepEqual(await prisma.supplier.findUniqueOrThrow({ where: { id: before.id } }), before);
      assert.ok(JSON.stringify((await prisma.supplierCapture.findUniqueOrThrow({ where: { id: r.captureId } })).evidence).includes(before.id));
    });
    await t.test("completar draft posteriormente lo auto-confirma sin duplicación", async () => {
      const s = await setup([image("CompleteLater", null, true)]);
      const r = await env.domain.persistImageLoad(s, s.state.ingestion!.loads[0].id);
      s.state.ingestion = undefined;
      const id = randomUUID(), text = "Agregá email sales@complete.test";
      s.messages.push({ id, sequence: 2, sentAt: null, envelope: { instance: s.instance, phone: s.phone, messageId: id, type: "TEXT", text, media: null, sentAt: null }, reading: { complete: true, segments: [] } });
      const update = await env.domain.write(s, { tool: "update_supplier", tripId: env.id("trip"), companyId: env.id("company"), targetId: r.captureId, patch: { contact: "sales@complete.test" }, evidence: [{ id: `${id}:1`, messageId: id, start: 0, end: text.length, text, role: "FACTS", candidate: { extractedFields: { contact: "sales@complete.test" }, rawSource: { type: "TEXT", text }, evidence: [], reviewFields: [] } }] });
      assert.equal(update.resourceStatus, "CONFIRMED");
      assert.equal(await prisma.supplier.count({ where: { captureId: r.captureId } }), 1);
    });
    await t.test("captions preserve notes and create draft products once without attaching cards as photos", async () => {
      const first = image("Vasos Supplier", "sales@vasos.test", true);
      first.envelope.text = "Tienen vasos de color rojo y verde con un precio FOB de 30usd";
      first.reading!.ingestion!.caption = { supplierReference: null, supplierNotes: null, products: [{ name: "vasos", notes: "de color rojo y verde", fob: { amount: 30, currency: "USD", unit: null, rawText: "FOB de 30usd" }, moq: null, leadTime: null }] };
      const second = image("Factory Supplier", "sales@factory.test");
      second.envelope.text = "Tienen fábrica propia, nos pueden hacer descuento por cantidad";
      second.reading!.ingestion!.caption = { supplierReference: null, supplierNotes: second.envelope.text, products: [] };
      const s = await setup([first, second]);
      for (const load of s.state.ingestion!.loads) { const r = await env.domain.persistImageLoad(s, load.id); load.resourceId = r.id; }
      await env.domain.persistCaptions(s); await env.domain.persistCaptions(s);
      const products = await prisma.supplierProduct.findMany({ where: { capture: { createdById: env.userId }, name: "vasos" }, include: { images: true, supplier: true } });
      assert.equal(products.length, 1); assert.equal(products[0].status, "DRAFT"); assert.equal(Number(products[0].fobAmount), 30); assert.equal(products[0].notes, "de color rojo y verde"); assert.equal(products[0].images.length, 0); assert.equal(products[0].supplier!.companyName, "Vasos Supplier");
      const factory = await prisma.supplier.findFirstOrThrow({ where: { createdById: env.userId, companyName: "Factory Supplier" } }); assert.equal(factory.notes, second.envelope.text);
      const receipts = await env.domain.receipts(s); assert.equal(receipts.filter(r => r.tool.includes("product")).length, 1);
    });
    await t.test("worker guarda la ráfaga completa sin preguntar ni invocar modelo para crear proveedores", async () => {
      const unreadable = image(null, null, true); unreadable.reading!.ingestion!.classification = { type: "OTHER", side: "UNKNOWN_SIDE", confidence: 0.2, readability: "unreadable", visual: "Ilegible", card: null, product: null };
      const s = await setup([image("WATERSY", "sales@watersy.test"), image("Scarpatiños S.A.", "sales@scarp.test", true), image("YKO blocks manufactory", null, true), unreadable]);
      let claimed = false; let final: AgentState | undefined; let response = "";
      const store = { async claim() { if (claimed) return []; claimed = true; return [s]; }, async catalog() { return env.catalog; }, async saveReading() {}, async finish(_s: BurstSnapshot, state: AgentState, text: string) { final = state; response = text; }, async retry() { assert.fail("No debe abortar una lectura ambigua"); }, async flushReplies() {} } as unknown as BurstStore;
      await new WhatsAppAgentService({ ingestion: true, domain: env.domain, store, reader: { async read(m) { return m.reading!; } }, orchestrator: { async run() { assert.fail("No preguntar por creación de proveedor nuevo"); } } as never, async save(_id, _rev, _lease, state) { await env.save(s, state); return true; }, async send() {} }).processDue(1);
      assert.equal(final?.ingestion?.summary.processed, 4); assert.equal(final?.question, null);
      assert.match(response, /4 proveedores cargados/); assert.doesNotMatch(response, /lo cargué como borrador|los datos extraídos/);
      assert.doesNotMatch(response, /Scarpatiños S.A./); assert.doesNotMatch(response, /pendientes de resolución|¿Querés/);
      for (const load of final!.ingestion!.loads) assert.ok(load.resourceId);
      assert.equal(await prisma.whatsAppAgentOperation.count({ where: { burstId: s.id, status: "COMPLETED" } }), 4);
    });
  } finally { await env.cleanup(); await prisma.$disconnect(); }
});
