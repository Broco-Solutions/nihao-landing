import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.ts";
import { createEvolutionClient } from "../../lib/channels/evolution/client.ts";
import { PrismaWhatsAppQuarantineRepository } from "../../lib/channels/whatsapp/quarantine.ts";
import {
  isWhatsAppBlocked,
  shouldQueueWhatsAppPublicWelcome,
  WHATSAPP_PUBLIC_WELCOME,
  whatsappBlockedPhones,
  whatsappPublicWelcomeEnabled,
  WhatsAppPublicWelcomeConfigurationError,
} from "../../lib/channels/whatsapp/public-welcome.ts";
import { WhatsAppUatConfigurationError } from "../../lib/channels/whatsapp/uat-access.ts";

test("la bienvenida pública mantiene el texto aprobado y no depende de IA", () => {
  assert.match(WHATSAPP_PUBLIC_WELCOME, /^¡Hola! 👋 Gracias por escribir a \*Nihao Negocios\*\./u);
  assert.match(WHATSAPP_PUBLIC_WELCOME, /exclusivo para viajeros que tienen acceso habilitado/u);
  assert.match(WHATSAPP_PUBLIC_WELCOME, /https:\/\/www\.nihaonegocios\.com\/$/u);
  assert.equal(WHATSAPP_PUBLIC_WELCOME.includes("OpenAI"), false);
});

test("la elegibilidad separa desconocidos de viajeros activos, ambiguos y restringidos", () => {
  assert.equal(shouldQueueWhatsAppPublicWelcome({ enabled: true, blocked: false, identityKind: "unlinked" }), true);
  assert.equal(shouldQueueWhatsAppPublicWelcome({ enabled: true, blocked: false, identityKind: "resolved" }), false);
  assert.equal(shouldQueueWhatsAppPublicWelcome({ enabled: true, blocked: false, identityKind: "ambiguous" }), false);
  assert.equal(shouldQueueWhatsAppPublicWelcome({ enabled: true, blocked: true, identityKind: "unlinked" }), false);
  assert.equal(shouldQueueWhatsAppPublicWelcome({ enabled: false, blocked: false, identityKind: "unlinked" }), false);
});

test("flags y bloqueos usan normalización internacional exacta", () => {
  assert.equal(whatsappPublicWelcomeEnabled("true"), true);
  assert.equal(whatsappPublicWelcomeEnabled("OFF"), false);
  assert.deepEqual([...whatsappBlockedPhones("+54 9 341 234-5678; +598 99 123 456")], ["5493412345678", "59899123456"]);
  assert.equal(isWhatsAppBlocked("5493412345678", "+54 9 341 234-5678"), true);
  assert.equal(isWhatsAppBlocked("3412345678", "+54 9 341 234-5678"), false);
  assert.throws(() => whatsappBlockedPhones("invalid"), WhatsAppPublicWelcomeConfigurationError);
});

test("Evolution permite sólo la salida pública explícita y habilitada fuera de la allowlist", async () => {
  const previousAllowed = process.env.WHATSAPP_UAT_ALLOWED_PHONES;
  const previousEnabled = process.env.WHATSAPP_PUBLIC_WELCOME_ENABLED;
  const previousBlocked = process.env.WHATSAPP_BLOCKED_PHONES;
  const sent: string[] = [];
  process.env.WHATSAPP_UAT_ALLOWED_PHONES = "+54 9 341 234-5678";
  process.env.WHATSAPP_PUBLIC_WELCOME_ENABLED = "true";
  delete process.env.WHATSAPP_BLOCKED_PHONES;
  const client = createEvolutionClient({
    apiUrl: "https://evolution.example.test",
    apiKey: "secret",
    instance: "nihao",
    fetch: async (_url, init) => { sent.push(String(init?.body)); return new Response(JSON.stringify({ key: { id: "sent" } }), { status: 200 }); },
  });
  try {
    await assert.rejects(client.sendText({ number: "59899123456", text: "privado" }), WhatsAppUatConfigurationError);
    await client.sendText({ number: "59899123456", text: WHATSAPP_PUBLIC_WELCOME, audience: "PUBLIC_WELCOME" });
    assert.equal(sent.length, 1);
    process.env.WHATSAPP_BLOCKED_PHONES = "+598 99 123 456";
    await assert.rejects(client.sendText({ number: "59899123456", text: WHATSAPP_PUBLIC_WELCOME, audience: "PUBLIC_WELCOME" }), WhatsAppPublicWelcomeConfigurationError);
    await assert.rejects(client.sendList!({ number: "59899123456", title: "Opciones", description: "Elegí", buttonText: "Ver", footerText: "Nihao", sections: [] }), WhatsAppPublicWelcomeConfigurationError);
    process.env.WHATSAPP_BLOCKED_PHONES = "";
    process.env.WHATSAPP_PUBLIC_WELCOME_ENABLED = "false";
    await assert.rejects(client.sendText({ number: "59899123456", text: WHATSAPP_PUBLIC_WELCOME, audience: "PUBLIC_WELCOME" }), WhatsAppPublicWelcomeConfigurationError);
  } finally {
    if (previousAllowed === undefined) delete process.env.WHATSAPP_UAT_ALLOWED_PHONES; else process.env.WHATSAPP_UAT_ALLOWED_PHONES = previousAllowed;
    if (previousEnabled === undefined) delete process.env.WHATSAPP_PUBLIC_WELCOME_ENABLED; else process.env.WHATSAPP_PUBLIC_WELCOME_ENABLED = previousEnabled;
    if (previousBlocked === undefined) delete process.env.WHATSAPP_BLOCKED_PHONES; else process.env.WHATSAPP_BLOCKED_PHONES = previousBlocked;
  }
});

type FakeRow = { id: string; instance: string; phone: string; reason: string; replyText: string | null; replyStatus: string | null; receivedAt: Date };

function throttleRepository(rows: FakeRow[]) {
  const model = {
    async findFirst(input: { where: { instance: string; phone: string; reason: string; OR: Array<Record<string, unknown>> } }) {
      const cutoff = ((input.where.OR[0].receivedAt as { gt: Date }).gt);
      const unresolved = new Set((input.where.OR[1].replyStatus as { in: string[] }).in);
      return rows.find((row) => row.instance === input.where.instance && row.phone === input.where.phone && row.reason === input.where.reason && row.replyText !== null && (row.receivedAt > cutoff || unresolved.has(row.replyStatus ?? ""))) ?? null;
    },
    async updateMany(input: { where: { id: string; replyText: null }; data: { reason: string; replyText: string; replyStatus: string } }) {
      const row = rows.find((candidate) => candidate.id === input.where.id && candidate.replyText === null);
      if (!row) return { count: 0 };
      Object.assign(row, input.data);
      return { count: 1 };
    },
  };
  const prisma = {
    async $transaction<T>(work: (tx: unknown) => Promise<T>) { return work(prisma); },
    async $queryRaw() { return [{ pg_advisory_xact_lock: null }]; },
    whatsAppQuarantinedMessage: model,
  };
  return new PrismaWhatsAppQuarantineRepository(prisma as never);
}

test("una bienvenida por número cada 24 horas y ningún duplicado ante redelivery", async () => {
  const start = new Date("2026-10-11T00:00:00.000Z");
  const rows: FakeRow[] = [
    { id: "first", instance: "nihao", phone: "59899123456", reason: "QUARANTINE", replyText: null, replyStatus: null, receivedAt: start },
    { id: "second", instance: "nihao", phone: "59899123456", reason: "QUARANTINE", replyText: null, replyStatus: null, receivedAt: new Date(start.getTime() + 60_000) },
    { id: "third", instance: "nihao", phone: "59899123456", reason: "QUARANTINE", replyText: null, replyStatus: null, receivedAt: new Date(start.getTime() + 24 * 60 * 60 * 1_000 + 1) },
  ];
  const repository = throttleRepository(rows);
  assert.equal(await repository.enqueuePublicWelcome("first", { instance: "nihao", phone: "59899123456", text: WHATSAPP_PUBLIC_WELCOME, now: start }), true);
  assert.equal(await repository.enqueuePublicWelcome("first", { instance: "nihao", phone: "59899123456", text: WHATSAPP_PUBLIC_WELCOME, now: start }), false, "el mismo webhook no vuelve a encolar");
  assert.equal(await repository.enqueuePublicWelcome("second", { instance: "nihao", phone: "59899123456", text: WHATSAPP_PUBLIC_WELCOME, now: new Date(start.getTime() + 60_000) }), false);
  rows[0].replyStatus = "DELIVERED";
  assert.equal(await repository.enqueuePublicWelcome("third", { instance: "nihao", phone: "59899123456", text: WHATSAPP_PUBLIC_WELCOME, now: new Date(start.getTime() + 24 * 60 * 60 * 1_000 + 1) }), true);
  assert.equal(rows.filter((row) => row.reason === "PUBLIC_WELCOME").length, 2);
});

test("una entrega incierta antigua no genera otra bienvenida automática", async () => {
  const now = new Date("2026-10-12T12:00:00.000Z");
  const rows: FakeRow[] = [
    { id: "uncertain", instance: "nihao", phone: "59899123456", reason: "PUBLIC_WELCOME", replyText: WHATSAPP_PUBLIC_WELCOME, replyStatus: "DELIVERY_UNKNOWN", receivedAt: new Date("2026-10-10T00:00:00.000Z") },
    { id: "new", instance: "nihao", phone: "59899123456", reason: "QUARANTINE", replyText: null, replyStatus: null, receivedAt: now },
  ];
  assert.equal(await throttleRepository(rows).enqueuePublicWelcome("new", { instance: "nihao", phone: "59899123456", text: WHATSAPP_PUBLIC_WELCOME, now }), false);
});

test("PostgreSQL serializa mensajes simultáneos y encola una sola bienvenida", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async () => {
  const url = new URL(process.env.EVAL_AGENT_DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Usá exclusivamente PostgreSQL local para esta regresión");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });
  const repository = new PrismaWhatsAppQuarantineRepository(prisma);
  const instance = `public-welcome-${randomUUID()}`;
  const phone = `598${String(Math.floor(Math.random() * 100_000_000)).padStart(8, "0")}`;
  const now = new Date();
  try {
    const rows = await Promise.all(["one", "two"].map((messageId) => prisma.whatsAppQuarantinedMessage.create({ data: { instance, messageId, phone, type: "TEXT", payload: {}, status: "PRESERVED", receivedAt: now } })));
    const results = await Promise.all(rows.map((row) => repository.enqueuePublicWelcome(row.id, { instance, phone, text: WHATSAPP_PUBLIC_WELCOME, now })));
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(await prisma.whatsAppQuarantinedMessage.count({ where: { instance, reason: "PUBLIC_WELCOME", replyStatus: "PENDING" } }), 1);
  } finally {
    await prisma.whatsAppQuarantinedMessage.deleteMany({ where: { instance } });
    await prisma.$disconnect();
  }
});
