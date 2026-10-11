import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createEvolutionClient } from "../../lib/channels/evolution/client.ts";
import { preserveQuarantinedWhatsAppMessage, PrismaWhatsAppQuarantineRepository, type QuarantineRepository, type QuarantineReceipt } from "../../lib/channels/whatsapp/quarantine.ts";
import { isWhatsAppUatSenderAllowed, whatsappUatAllowedPhones, WhatsAppUatConfigurationError } from "../../lib/channels/whatsapp/uat-access.ts";
import { PrismaBurstStore } from "../../lib/channels/whatsapp/prisma-burst-store.ts";
import type { StorageProvider } from "../../lib/bot/storage/provider.ts";

const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new TextEncoder().encode("original-uap-media")]);

function receipt(type: "TEXT" | "IMAGE" = "TEXT"): QuarantineReceipt {
  return {
    instance: "nihao",
    payload: { event: "MESSAGES_UPSERT", private: "preserved verbatim" },
    message: {
      id: "message-1",
      remoteJid: "59899123456@s.whatsapp.net",
      phone: "59899123456",
      pushName: null,
      type,
      text: type === "TEXT" ? "mensaje fuera de UAT" : null,
      media: type === "IMAGE" ? { key: { id: "message-1", remoteJid: "59899123456@s.whatsapp.net", fromMe: false }, message: { imageMessage: { directPath: "/temporary" } } } : null,
    },
  };
}

function repository() {
  const state: { rows: Map<string, { id: string; storageKey: string | null; originalSha256: string | null; status: string; payload: unknown; reason?: string }> } = { rows: new Map() };
  const value: QuarantineRepository = {
    async receive(input, requiresOriginal) {
      const row = state.rows.get(input.message.id) ?? { id: "quarantine-1", storageKey: null, originalSha256: null, status: requiresOriginal ? "RECEIVED" : "PRESERVED", payload: input.payload };
      state.rows.set(input.message.id, row);
      return row;
    },
    async preserved(id, original) {
      const row = [...state.rows.values()].find((candidate) => candidate.id === id)!;
      row.status = "PRESERVED";
      row.reason = undefined;
      if (original) { row.storageKey = original.storageKey; row.originalSha256 = original.sha256; }
    },
    async failed(id, reason) {
      const row = [...state.rows.values()].find((candidate) => candidate.id === id)!;
      row.status = "RECEIVED";
      row.reason = reason;
    },
  };
  return { state, value };
}

function storage() {
  const objects = new Map<string, Uint8Array>();
  const value: StorageProvider = {
    async put(input) { objects.set(input.key, input.body as Uint8Array); },
    async get(key) {
      const object = objects.get(key);
      if (!object) return null;
      return new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(object); controller.close(); } });
    },
    async delete(key) { objects.delete(key); },
    async signedUrl() { return "https://storage.test/object"; },
  };
  return { objects, value };
}

test("la lista UAT exige números internacionales completos y no usa coincidencias parciales", () => {
  assert.deepEqual([...whatsappUatAllowedPhones("+54 9 341 234-5678, +598 99 123 456")!], ["5493412345678", "543412345678", "59899123456"]);
  assert.equal(isWhatsAppUatSenderAllowed("543412345678", "+54 9 341 234-5678"), true);
  assert.equal(isWhatsAppUatSenderAllowed("5493412345678", "543412345678"), true);
  assert.equal(isWhatsAppUatSenderAllowed("5493412345678", "5493412345678"), true);
  assert.equal(isWhatsAppUatSenderAllowed("3412345678", "5493412345678"), false);
  assert.throws(() => whatsappUatAllowedPhones("invalid"), WhatsAppUatConfigurationError);
});

test("un texto fuera de UAT conserva el payload y no necesita medio ni respuesta", async () => {
  const repo = repository();
  await preserveQuarantinedWhatsAppMessage(receipt(), { repository: repo.value, storage: storage().value, client: { async getMedia() { assert.fail("no media call"); } } });
  const row = repo.state.rows.get("message-1")!;
  assert.equal(row.status, "PRESERVED");
  assert.deepEqual(row.payload, receipt().payload);
});

test("un medio fuera de UAT queda recuperable tras fallo y el redelivery conserva bytes una sola vez", async () => {
  const repo = repository();
  const store = storage();
  let calls = 0;
  const input = receipt("IMAGE");
  await assert.rejects(preserveQuarantinedWhatsAppMessage(input, { repository: repo.value, storage: store.value, client: { async getMedia() { calls++; throw new Error("temporary"); } } }), /temporary/);
  assert.equal(repo.state.rows.size, 1);
  assert.equal(repo.state.rows.get("message-1")?.status, "RECEIVED");
  await preserveQuarantinedWhatsAppMessage(input, { repository: repo.value, storage: store.value, client: { async getMedia() { calls++; return { bytes, mimeType: "image/png" }; } } });
  assert.equal(repo.state.rows.size, 1);
  assert.equal(repo.state.rows.get("message-1")?.status, "PRESERVED");
  assert.equal(repo.state.rows.get("message-1")?.originalSha256, createHash("sha256").update(bytes).digest("hex"));
  await preserveQuarantinedWhatsAppMessage(input, { repository: repo.value, storage: store.value, client: { async getMedia() { assert.fail("durable copy must be reused"); } } });
  assert.equal(calls, 2);
});

test("el cliente Evolution bloquea respuestas a destinatarios fuera de la lista UAT", async () => {
  const previous = process.env.WHATSAPP_UAT_ALLOWED_PHONES;
  process.env.WHATSAPP_UAT_ALLOWED_PHONES = "5493412345678";
  try {
    const client = createEvolutionClient({ apiUrl: "https://evolution.test", apiKey: "secret", instance: "nihao", fetch: async () => new Response(JSON.stringify({ key: { id: "sent" } }), { status: 200 }) });
    await assert.rejects(client.sendText({ number: "59899123456", text: "blocked" }), WhatsAppUatConfigurationError);
    await client.sendText({ number: "5493412345678", text: "allowed" });
  } finally {
    if (previous === undefined) delete process.env.WHATSAPP_UAT_ALLOWED_PHONES;
    else process.env.WHATSAPP_UAT_ALLOWED_PHONES = previous;
  }
});

test("el worker y su outbox dejan intactas las ráfagas históricas ajenas al piloto", async () => {
  const previous = process.env.WHATSAPP_UAT_ALLOWED_PHONES;
  process.env.WHATSAPP_UAT_ALLOWED_PHONES = "+598 99 123 456,+54 9 341 234-5678";
  let claimWhere: Record<string, unknown> | undefined;
  let feedbackWhere: Record<string, unknown> | undefined;
  let replyWhere: Record<string, unknown> | undefined;
  const store = new PrismaBurstStore({
    whatsAppBurst: { async findMany(input: { where: Record<string, unknown> }) { if (input.where.dueAt) claimWhere = input.where; else feedbackWhere = input.where; return []; } },
    whatsAppBurstReply: { async updateMany() { return { count: 0 }; }, async findMany(input: { where: Record<string, unknown> }) { replyWhere = input.where; return []; } },
  } as never, { claimVersions: [3] });
  try {
    assert.deepEqual(await store.claim(10), []);
    assert.deepEqual((claimWhere?.phone as { in: string[] }).in, ["59899123456", "5493412345678", "543412345678"]);
    assert.deepEqual(await store.enqueueTimedFeedback(), { processing: 0, critical: 0 });
    assert.deepEqual((feedbackWhere?.phone as { in: string[] }).in, ["59899123456", "5493412345678", "543412345678"]);
    await store.flushReplies(async () => assert.fail("No debe intentar enviar respuestas históricas ajenas al piloto"));
    const burstFilter = replyWhere?.burst as { is: { phone: { in: string[] } } };
    assert.deepEqual(burstFilter.is.phone.in, ["59899123456", "5493412345678", "543412345678"]);
  } finally {
    if (previous === undefined) delete process.env.WHATSAPP_UAT_ALLOWED_PHONES;
    else process.env.WHATSAPP_UAT_ALLOWED_PHONES = previous;
  }
});

test("la cuarentena no envía respuestas pendientes fuera de la allowlist", async () => {
  const previous = process.env.WHATSAPP_UAT_ALLOWED_PHONES;
  process.env.WHATSAPP_UAT_ALLOWED_PHONES = "+54 9 341 234-5678";
  let where: Record<string, unknown> | undefined;
  const repository = new PrismaWhatsAppQuarantineRepository({
    whatsAppQuarantinedMessage: {
      async updateMany() { return { count: 0 }; },
      async findMany(input: { where: Record<string, unknown> }) { where = input.where; return []; },
    },
  } as never);
  try {
    await repository.flushReplies(async () => assert.fail("No debe enviar respuestas fuera de la allowlist"));
    assert.deepEqual((where?.phone as { in: string[] }).in, ["5493412345678", "543412345678"]);
  } finally {
    if (previous === undefined) delete process.env.WHATSAPP_UAT_ALLOWED_PHONES;
    else process.env.WHATSAPP_UAT_ALLOWED_PHONES = previous;
  }
});
