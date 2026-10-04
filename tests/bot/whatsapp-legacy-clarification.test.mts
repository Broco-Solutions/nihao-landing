import test from "node:test";
import assert from "node:assert/strict";
import { WhatsAppCaptureService } from "../../lib/channels/whatsapp/whatsapp-capture-service.ts";
import { PrismaWhatsAppConversationRepository } from "../../lib/channels/whatsapp/prisma-conversation-repository.ts";
const product = "Tengo un vaso de vidrio con precio fob de 30 usd y leedtime de 60 dias";
function fixture() {
  let state: { userId: string; tripId?: string | null; companyId?: string | null; stage: string } | null = null;
  const companies = [{ id: "broco", catalogCompany: { name: "Broco Solutions" } }, { id: "kendal", catalogCompany: { name: "Kendal Salud" } }];
  const prisma = {
    user: { async findUnique() { return { id: "user" }; } },
    tripMember: { async findMany() { return [{ tripId: "trip", trip: { name: "China", status: "ACTIVE" } }]; }, async findUnique() { return { role: "TRAVELER" }; } },
    tripCompany: { async findMany() { return companies; } },
    tripCompanyMember: { async findUnique() { return { company: { active: true, tripId: "trip" } }; } },
    whatsAppConversation: { async findUnique() { return state; }, async upsert({ create, update }: { create: NonNullable<typeof state>; update: Partial<NonNullable<typeof state>> }) { state = state ? { ...state, ...update } : create; return state; }, async deleteMany() { state = null; } },
  };
  const conversation = new PrismaWhatsAppConversationRepository(prisma as never);
  const messages: string[] = []; let assigned = false; let classifications = 0;
  const service = new WhatsAppCaptureService({ identities: {} as never, captures: {} as never, cards: {} as never, extraction: {} as never, conversations: conversation,
    textIntent: { async classify(text) { classifications++; return text === product ? "CAPTURE" : "GUIDANCE"; } },
    batches: { async assignFromConversation() { assigned = state?.stage === "READY"; return assigned; }, async receiveUnresolved(input: { text?: string }) { messages.push(input.text!); return { kind: "captured", text: "" }; } } as never,
  });
  return { conversation, service, messages, get state() { return state; }, get assigned() { return assigned; }, get classifications() { return classifications; } };
}
test("repro: vaso, pregunta de empresa y para broco continúa el lote sin enviar ayuda", async () => {
  const f = fixture(); const input = { instance: "nihao", phone: "5491112345678" };
  const first = await f.service.capture({ ...input, messageId: "product", text: product });
  assert.match(first.text, /Para qué empresa/); assert.deepEqual(f.messages, [product]);
  const reply = await f.service.capture({ ...input, messageId: "answer", text: "para broco" });
  assert.equal(f.assigned, true); assert.equal(f.state?.companyId, "broco");
  assert.doesNotMatch(reply.text, /Hola, soy Nihao|Enviá ahora la información/);
  assert.equal(f.messages.length, 1, "la aclaración no se almacena como otra carga");
  assert.equal(f.classifications, 1, "la respuesta pendiente no pasa por el clasificador de mensajes aislados");
});
test("selector legacy acepta empresa por nombre en una aclaración pendiente", async () => {
  const f = fixture(); await f.conversation.select("5491112345678", product);
  await f.conversation.select("5491112345678", "para broco");
  assert.equal(f.state?.companyId, "broco"); assert.equal(f.state?.stage, "READY");
});

import { createAgentEnvironment, localAgentDatabase } from "../../evals/whatsapp-agent/environment.ts";
import { PRODUCT_CATALOG } from "../../evals/whatsapp-products/cases.ts";
import { PrismaBurstStore } from "../../lib/channels/whatsapp/prisma-burst-store.ts";
import { randomUUID } from "node:crypto";
test("entrada v3 recupera lote legacy sin contexto ni escrituras y conserva todos sus originales", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async () => {
  const prisma = localAgentDatabase(); const env = await createAgentEnvironment(prisma, PRODUCT_CATALOG);
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: env.userId } });
    const instance = `${env.prefix}-legacy`; const batchId = `${env.prefix}-batch`; const originalId = randomUUID();
    await prisma.whatsAppBatch.create({ data: { id: batchId, instance, phone: user.whatsappPhone!, userId: env.userId, dueAt: new Date(0), messages: { create: [
      { instance, messageId: originalId, type: "TEXT", text: product },
      { instance, messageId: `${originalId}-audio`, type: "AUDIO", storageKey: "staged-audio", mimeType: "audio/ogg" },
    ] } } });
    await prisma.whatsAppConversation.create({ data: { userId: env.userId, tripId: env.id("trip-china"), stage: "COMPANY" } });
    const store = new PrismaBurstStore(prisma, { newVersion: 3 });
    const input = { instance, phone: user.whatsappPhone!, messageId: "answer", type: "TEXT" as const, text: "para broco", media: null, sentAt: null };
    const replies = await Promise.all([store.receive(input), store.receive(input)]);
    assert.deepEqual(replies, [true, true]);
    const burst = await prisma.whatsAppBurst.findFirstOrThrow({ where: { userId: env.userId }, include: { messages: { orderBy: { sequence: "asc" } } } });
    const state = burst.state as { order: string[]; agent: { pending: { options: Array<{ id: string }>; revision: number } } };
    assert.deepEqual(state.order, burst.messages.slice(0, 2).map((m) => m.id));
    assert.equal(state.agent.pending.revision, 2);
    assert.equal(state.agent.pending.options[0].id, env.id("broco"));
    assert.equal(burst.version, 3); assert.equal(burst.revision, 3); assert.equal(burst.messages.length, 3);
    assert.equal((burst.messages[0].envelope as { text: string }).text, product);
    assert.equal((burst.messages[1].reading as { storageKey: string }).storageKey, "staged-audio");
    assert.equal((burst.messages[2].envelope as { text: string }).text, "para broco");
    assert.equal((await prisma.whatsAppBatch.findUniqueOrThrow({ where: { id: batchId } })).status, "TRANSFERRED");
    assert.equal(await prisma.whatsAppBatchMessage.count({ where: { batchId } }), 2, "el historial original no se borra");
    assert.equal(await prisma.supplierProduct.count({ where: { capture: { tripId: env.id("trip-china") } } }), 0);
  } finally { await prisma.whatsAppBatch.deleteMany({ where: { userId: env.userId } }); await env.cleanup(); await prisma.$disconnect(); }
});

import { BurstReader } from "../../lib/channels/whatsapp/burst-reader.ts";
test("original de audio recuperado se lee del storage sin volver a descargarlo de Evolution", async () => {
  const reading = { storageKey: "staged", mimeType: "audio/ogg", transcript: "FOB USD 30, entrega 60 días", segments: [] };
  const reader = new BurstReader({ storage: { async get(key: string) { assert.equal(key, "staged"); return new Response(new Uint8Array([1, 2, 3])).body; } } as never, client: { async getMedia() { throw new Error("no volver a descargar"); } }, transcription: { async transcribe() { throw new Error("no volver a transcribir"); } }, analyzer: { async segmentAudio(text) { return { confident: true, segments: [text] }; }, async readImage() { throw new Error("unused"); } }, extraction: { async extractReading(text) { return { extractedFields: {}, reviewFields: [], evidence: [], rawSource: { type: "TEXT", text } }; } }, mistral: {} as never });
  const result = await reader.read({ id: "audio", sequence: 1, sentAt: null, reading, envelope: { instance: "nihao", messageId: "original-audio", phone: "phone", type: "AUDIO", text: null, media: null, sentAt: null } }, async () => {});
  assert.equal(result.complete, true); assert.equal(result.segments[0].text, reading.transcript);
});
test("handoff rechaza lotes con contexto, procesamiento o materialización previa", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async () => {
  const prisma = localAgentDatabase(); const env = await createAgentEnvironment(prisma, PRODUCT_CATALOG);
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: env.userId } });
    for (const [index, overrides] of [{ status: "READY" }, { status: "PROCESSING" }, { status: "NEEDS_CLARIFICATION" }, { tripId: env.id("trip-china"), companyId: env.id("broco") }, { attempts: 1 }, { analysis: { groups: [] } }].entries()) {
      const instance = `${env.prefix}-blocked-${index}`;
      const batch = await prisma.whatsAppBatch.create({ data: { instance, phone: user.whatsappPhone!, userId: env.userId, dueAt: new Date(0), ...overrides, messages: { create: { instance, messageId: randomUUID(), type: "TEXT", text: product } } } });
      const store = new PrismaBurstStore(prisma, { newVersion: 3 });
      assert.equal(await store.receive({ instance, phone: user.whatsappPhone!, messageId: randomUUID(), type: "TEXT", text: "para broco", media: null, sentAt: null }), false);
      assert.equal(await prisma.whatsAppBurst.count({ where: { instance } }), 0);
      assert.equal((await prisma.whatsAppBatch.findUniqueOrThrow({ where: { id: batch.id } })).status, batch.status);
    }
    for (const [index, message] of [{ type: "IMAGE", storageKey: null, mimeType: null }, { type: "TEXT", text: product, assignedCaptureId: env.id("capture-alfa") }].entries()) {
      const instance = `${env.prefix}-missing-${index}`;
      await prisma.whatsAppBatch.create({ data: { instance, phone: user.whatsappPhone!, userId: env.userId, dueAt: new Date(0), messages: { create: { instance, messageId: randomUUID(), ...message } } } });
      assert.equal(await new PrismaBurstStore(prisma, { newVersion: 3 }).receive({ instance, phone: user.whatsappPhone!, messageId: randomUUID(), type: "TEXT", text: "para broco", media: null, sentAt: null }), false);
    }
    const instance = `${env.prefix}-trip`;
    await prisma.whatsAppConversation.create({ data: { userId: env.userId, stage: "TRIP" } });
    await prisma.whatsAppBatch.create({ data: { instance, phone: user.whatsappPhone!, userId: env.userId, dueAt: new Date(0), messages: { create: { instance, messageId: randomUUID(), type: "TEXT", text: product } } } });
    assert.equal(await new PrismaBurstStore(prisma, { newVersion: 3 }).receive({ instance, phone: user.whatsappPhone!, messageId: randomUUID(), type: "TEXT", text: "1", media: null, sentAt: null }), false, "la selección de viaje continúa en su procesador original");
  } finally { await prisma.whatsAppBatch.deleteMany({ where: { userId: env.userId } }); await env.cleanup(); await prisma.$disconnect(); }
});

test("foto recuperada reutiliza original y OCR almacenados sin descriptor Evolution", async () => {
  const reading = { storageKey: "image", mimeType: "image/png", ocr: "Vaso USD 30", visual: "vaso de vidrio", imageKind: "PRODUCT_IMAGE" as const, segments: [] };
  const reader = new BurstReader({ storage: { async get() { return new Response(new Uint8Array([1])).body; } } as never, client: { async getMedia() { throw new Error("no descargar"); } }, transcription: {} as never, analyzer: { async readImage() { throw new Error("OCR ya guardado"); }, async segmentAudio() { throw new Error("unused"); } }, extraction: { async extractReading(text) { return { extractedFields: {}, reviewFields: [], evidence: [], rawSource: { type: "TEXT", text } }; } }, mistral: { async post() { throw new Error("visión ya guardada"); } } });
  const result = await reader.read({ id: "image", sequence: 1, sentAt: null, reading, envelope: { instance: "nihao", messageId: "image", phone: "phone", type: "IMAGE", text: null, media: null, sentAt: null } }, async () => {});
  assert.equal(result.complete, true); assert.equal(result.segments[0].text, reading.ocr);
});
