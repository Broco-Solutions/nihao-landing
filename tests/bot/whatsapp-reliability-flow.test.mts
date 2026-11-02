import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createAgentEnvironment, localAgentDatabase } from "../../evals/whatsapp-agent/environment.ts";
import { agentState } from "../../lib/channels/whatsapp/agent-contract.ts";
import { WhatsAppAgentService } from "../../lib/channels/whatsapp/agent-service.ts";
import { WhatsAppAgentOrchestrator } from "../../lib/channels/whatsapp/agent-orchestrator.ts";
import { BurstReader } from "../../lib/channels/whatsapp/burst-reader.ts";
import { PrismaBurstStore } from "../../lib/channels/whatsapp/prisma-burst-store.ts";
import { listTripWhatsAppEvidence } from "../../lib/channels/whatsapp/web-evidence.ts";
import type { BurstEnvelope, BurstSnapshot } from "../../lib/channels/whatsapp/burst-types.ts";

const extraction = { async extractReading(text: string) { return { extractedFields: {}, evidence: [], reviewFields: [], rawSource: { type: "TEXT" as const, text } }; } };

test("PostgreSQL: foto para revistas llega a Web y outbox tras crash y redelivery sin duplicados", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async () => {
  const db = localAgentDatabase();
  const env = await createAgentEnvironment(db, { trips: [{ id: "trip", name: "China", companies: [{ id: "company", name: "Empresa" }], suppliers: [
    { id: "alpha", captureId: "alpha-capture", companyId: "company", name: "Alfa Tools", city: null },
    { id: "beta", captureId: "beta-capture", companyId: "company", name: "Beta Tools", city: null },
  ] }] });
  try {
    const user = await db.user.findUniqueOrThrow({ where: { id: env.userId } });
    const seed: BurstSnapshot = { id: randomUUID(), instance: "local", phone: user.whatsappPhone!, userId: env.userId, revision: 1, leaseId: "seed", status: "PROCESSING", state: { tripId: env.id("trip"), operationalContext: { tripId: env.id("trip"), companyId: env.id("company") }, groups: [], question: null, pendingRefs: [], controlIds: [] }, messages: [] };
    await env.persist(seed);
    await db.whatsAppBurst.update({ where: { id: seed.id }, data: { phone: user.whatsappPhone! } });
    await env.domain.selectConversationTarget(seed, "SUPPLIER", env.id("alpha"));
    await db.whatsAppBurst.update({ where: { id: seed.id }, data: { status: "DONE", leaseId: null } });
    const bytes = new Uint8Array(await readFile("evals/whatsapp-batches/fixtures/img-alfa-product.png"));
    const externalId = randomUUID();
    const envelope: BurstEnvelope = { instance: seed.instance, phone: user.whatsappPhone!, messageId: externalId, type: "IMAGE", text: null, sentAt: new Date().toISOString(), media: { key: { id: externalId, remoteJid: `${user.whatsappPhone}@s.whatsapp.net`, fromMe: false }, message: { imageMessage: {} } } };
    let downloads = 0, visionCalls = 0;
    const reader = new BurstReader({ multimodal: true, storage: env.storage, extraction,
      client: { async getMedia() { downloads++; return { bytes, mimeType: "image/png" }; } },
      analyzer: { async readImage() { return "Producto para Beta Tools"; }, async segmentAudio(text) { return { segments: [text], confident: true }; } },
      transcription: { async transcribe() { assert.fail("No hay audio"); } },
      mistral: { async post() { visionCalls++; return { choices: [{ message: { content: JSON.stringify({ type: "PRODUCT", side: "UNKNOWN_SIDE", confidence: 0.99, readability: "readable", visual: "estantería para revistas", card: null, product: { description: "estantería para revistas", brand: null, model: null, visibleText: [], packaging: false } }) } }] }; } },
    });
    const store = new PrismaBurstStore(db, { newVersion: 3, claimVersions: [3] });
    const sent: string[] = [];
    const orchestrator = new WhatsAppAgentOrchestrator({ domain: env.domain, extraction, client: { async post() { assert.fail("Una foto con destino autorizado no necesita el modelo conversacional"); } } });
    const service = new WhatsAppAgentService({ ingestion: true, store, reader, domain: env.domain, orchestrator,
      async save(id, revision, leaseId, state) { return (await db.whatsAppBurst.updateMany({ where: { id, revision, leaseId, status: "PROCESSING" }, data: { state: JSON.parse(JSON.stringify(state)) } })).count === 1; },
      async send(_phone, text) { sent.push(text); },
    });
    const finish = store.finish.bind(store); let interrupted = true;
    store.finish = async (...args) => { if (interrupted) { interrupted = false; throw new Error("Simulated crash after durable product write"); } await finish(...args); };
    await service.receive(envelope);
    const row = await db.whatsAppBurst.findFirstOrThrow({ where: { userId: env.userId, id: { not: seed.id } } });
    const due = () => db.whatsAppBurst.update({ where: { id: row.id }, data: { dueAt: new Date(0) } });
    await due(); await service.processDue(1);
    assert.equal(sent.length, 0);
    assert.equal(await db.supplierProduct.count({ where: { supplierId: env.id("alpha") } }), 1);
    await due(); await service.processDue(1);
    assert.equal(sent.length, 1); assert.match(sent[0], /1 producto cargado/u);
    assert.doesNotMatch(sent[0], /error interno|reintentar|99 productos/iu);
    await service.receive(envelope); await store.flushReplies(async (_phone, text) => { sent.push(text); });
    await service.processDue(1);
    assert.equal(sent.length, 1);
    assert.equal(downloads, 1); assert.equal(visionCalls, 1);
    const saved = await db.whatsAppBurst.findUniqueOrThrow({ where: { id: row.id }, include: { messages: true, operations: true, replies: true } });
    assert.equal(saved.status, "DONE"); assert.equal(saved.messages.length, 1);
    assert.equal(saved.operations.length, 1); assert.equal(saved.operations[0].status, "COMPLETED");
    assert.equal(saved.replies.length, 1); assert.equal(saved.replies[0].status, "ACCEPTED");
    const state = agentState(saved.state as unknown as BurstSnapshot["state"]);
    assert.equal(state.ingestion?.summary.pending, 0); assert.equal(state.ingestion?.summary.needsReview, 0);
    const original = saved.messages[0].reading as { storageKey: string; originalSha256: string };
    assert.equal(saved.messages[0].storageStatus, "STORED");
    assert.equal(original.originalSha256, createHash("sha256").update(bytes).digest("hex"));
    assert.deepEqual(new Uint8Array(await new Response((await env.storage.get(original.storageKey))!).arrayBuffer()), bytes);
    const products = await db.supplierProduct.findMany({ where: { capture: { tripId: env.id("trip") } }, include: { images: true } });
    assert.equal(products.length, 1); assert.equal(products[0].supplierId, env.id("alpha"));
    assert.equal(products[0].name, "estantería para revistas"); assert.equal(products[0].images.length, 1);
    const web = (await listTripWhatsAppEvidence(db, env.userId, env.id("trip"))).find(item => item.id === row.id)!;
    assert.equal(web.status.code, "complete"); assert.equal(web.failureCode, null);
    assert.equal(web.targets[0].id, products[0].id); assert.equal(web.messages[0].mediaAvailable, true);
  } finally { await env.cleanup(); await db.$disconnect(); }
});
