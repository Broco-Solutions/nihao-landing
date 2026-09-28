import test from "node:test";
import assert from "node:assert/strict";
import { accessibleCompanyIds, resolveCompanyId } from "../../lib/bot/persistence/company-access.ts";
import { AuthorizationError } from "../../lib/bot/authorization.ts";
import { ValidationError } from "../../lib/bot/validation.ts";
import { PrismaWhatsAppConversationRepository } from "../../lib/channels/whatsapp/prisma-conversation-repository.ts";
import { PrismaWhatsAppMessageReplyRepository } from "../../lib/channels/whatsapp/prisma-message-reply-repository.ts";

test("un viajero ve dos empresas, elige una para crear y pierde acceso al ser removido", async () => {
  const memberships = new Set(["a", "b"]);
  const prisma = {
    tripMember: { async findUnique() { return { role: "TRAVELER" }; } },
    tripCompanyMember: { async findMany() { return [...memberships].map((companyId) => ({ companyId })); } },
    tripCompany: { async findFirst({ where }: { where: { id: string; tripId: string } }) { return where.tripId === "trip" && ["a", "b"].includes(where.id) ? { id: where.id } : null; } },
  };
  assert.deepEqual(await accessibleCompanyIds(prisma as never, "user", "trip"), ["a", "b"]);
  await assert.rejects(resolveCompanyId(prisma as never, "user", "trip"), ValidationError);
  assert.equal(await resolveCompanyId(prisma as never, "user", "trip", "b"), "b");
  memberships.delete("b");
  await assert.rejects(resolveCompanyId(prisma as never, "user", "trip", "b"), AuthorizationError);
  assert.equal(await resolveCompanyId(prisma as never, "user", "trip"), "a");
});

test("WhatsApp pregunta viaje y empresa para cada proveedor y conserva la elección entre mensajes", async () => {
  const phone = "5493412345678";
  const state = new Map<string, { userId: string; tripId: string | null; companyId: string | null; stage: string }>();
  const trips = [{ tripId: "trip-a", trip: { name: "Cantón", status: "ACTIVE" } }, { tripId: "trip-b", trip: { name: "Shenzhen", status: "ACTIVE" } }];
  const companies = [{ id: "company-a", name: "A" }, { id: "company-b", name: "B" }];
  const prisma = {
    user: { async findUnique({ where }: { where: { whatsappPhone: string } }) { return where.whatsappPhone === phone ? { id: "user" } : null; } },
    tripMember: {
      async findMany() { return trips; },
      async findUnique() { return { role: "TRAVELER" }; },
    },
    tripCompany: { async findMany({ where }: { where: { tripId: string } }) { return where.tripId === "trip-a" ? companies : [{ id: "company-c", name: "C" }]; } },
    tripCompanyMember: { async findUnique({ where }: { where: { companyId_userId: { companyId: string } } }) { return { company: { tripId: where.companyId_userId.companyId === "company-c" ? "trip-b" : "trip-a" } }; } },
    whatsAppConversation: {
      async findUnique() { return state.get("user") ?? null; },
      async upsert({ create, update }: { create: { userId: string; tripId?: string; companyId?: string; stage: string }; update: { tripId?: string | null; companyId?: string | null; stage: string } }) {
        const row = state.get("user") ?? { userId: create.userId, tripId: null, companyId: null, stage: create.stage };
        Object.assign(row, state.has("user") ? update : create); state.set("user", row); return row;
      },
      async updateMany({ data }: { data: { stage: string } }) { Object.assign(state.get("user")!, data); return { count: 1 }; },
      async deleteMany() { state.delete("user"); return { count: 1 }; },
    },
  };
  const conversation = new PrismaWhatsAppConversationRepository(prisma as never);
  assert.match((await conversation.select(phone, "Proveedor de prueba") as { text: string }).text, /1\. Cantón/);
  assert.match((await conversation.select(phone, "1") as { text: string }).text, /1\. A/);
  assert.match((await conversation.select(phone, "2") as { text: string }).text, /Empresa seleccionada: B/);
  assert.deepEqual(await conversation.select(phone, "Proveedor nuevo"), { kind: "ready", userId: "user", tripId: "trip-a", companyId: "company-b" });
  await conversation.complete("user");
  assert.match((await conversation.select(phone, "Otro proveedor") as { text: string }).text, /viaje/);
});

test("un reintento del mismo mensaje de WhatsApp reutiliza la respuesta sin avanzar la selección", async () => {
  const rows = new Map<string, { phone: string; status: string; kind: string | null; text: string | null; updatedAt: Date }>();
  const prisma = { whatsAppMessageReply: {
    async create({ data }: { data: { instance: string; messageId: string; phone: string } }) {
      const key = `${data.instance}:${data.messageId}`;
      if (rows.has(key)) throw { code: "P2002" };
      rows.set(key, { phone: data.phone, status: "PROCESSING", kind: null, text: null, updatedAt: new Date() });
    },
    async findUnique({ where }: { where: { instance_messageId: { instance: string; messageId: string } } }) { return rows.get(`${where.instance_messageId.instance}:${where.instance_messageId.messageId}`); },
    async update({ where, data }: { where: { instance_messageId: { instance: string; messageId: string } }; data: { status: string; kind: string; text: string } }) { Object.assign(rows.get(`${where.instance_messageId.instance}:${where.instance_messageId.messageId}`)!, data); },
    async updateMany() { return { count: 0 }; },
  } };
  const replies = new PrismaWhatsAppMessageReplyRepository(prisma as never);
  assert.deepEqual(await replies.claim("nihao", "choice-1", "5493412345678"), { kind: "owned" });
  assert.deepEqual(await replies.claim("nihao", "choice-1", "5493412345678"), { kind: "processing" });
  const reply = { kind: "ambiguous" as const, text: "Elegí una empresa" };
  await replies.complete("nihao", "choice-1", reply);
  assert.deepEqual(await replies.claim("nihao", "choice-1", "5493412345678"), { kind: "completed", reply });
  assert.deepEqual(await replies.claim("nihao", "choice-1", "5493412345679"), { kind: "processing" }, "no revela la respuesta a otro número");
});
