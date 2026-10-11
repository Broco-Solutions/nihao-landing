import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.ts";
import { PrismaBurstStore } from "../../lib/channels/whatsapp/prisma-burst-store.ts";
import { PrismaWhatsAppQuarantineRepository } from "../../lib/channels/whatsapp/quarantine.ts";
import { splitWhatsAppReply } from "../../lib/channels/whatsapp/reply-parts.ts";
import { reconcileDeliveryEvents } from "../../lib/channels/whatsapp/delivery-events.ts";
import { collectMonitorHeartbeatFinding, collectOperationalFindings, reconcileOperationalAlerts } from "../../lib/channels/whatsapp/operational-monitor.ts";
import type { BurstEnvelope, BurstState } from "../../lib/channels/whatsapp/burst-types.ts";

test("una respuesta completa se divide sin perder caracteres ni separar emojis", () => {
  const text = `${"Dato completo.\n".repeat(400)}${"🙂".repeat(5_000)} FIN solicitado después de 4000 caracteres`;
  const parts = splitWhatsAppReply(text);
  assert.ok(parts.length > 3);
  assert.equal(parts.join(""), text);
  for (const part of parts) {
    assert.ok(part.length <= 4_000);
    assert.equal(/[\uD800-\uDBFF]$/u.test(part), false);
    assert.equal(/^[\uDC00-\uDFFF]/u.test(part), false);
  }
});

const connectionString = process.env.WHATSAPP_BURST_TEST_DATABASE_URL;
if (connectionString) {
  const url = new URL(connectionString);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/nihao_audit", "Solo PostgreSQL local /nihao_audit");
}

test("PostgreSQL: entrega durable, partes completas, alertas y recuperación", { skip: !connectionString }, async t => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionString! }) });
  const userId = randomUUID(); const tripId = randomUUID(); const companyId = randomUUID(); const catalogId = randomUUID();
  const instance = `transport-${randomUUID()}`; const phone = `549${String(Math.floor(Math.random() * 10_000_000_000)).padStart(10, "0")}`;
  const previousAllowed = process.env.WHATSAPP_UAT_ALLOWED_PHONES;
  delete process.env.WHATSAPP_UAT_ALLOWED_PHONES;
  const store = new PrismaBurstStore(prisma, { newVersion: 3, claimVersions: [3] });
  const quarantine = new PrismaWhatsAppQuarantineRepository(prisma);
  const state: BurstState = { tripId: null, groups: [], question: null, controlIds: [], pendingRefs: [] };
  const createBurst = () => prisma.whatsAppBurst.create({ data: { instance, phone, userId, version: 3, revision: 1, status: "DONE", dueAt: new Date(), state } });
  try {
    await prisma.user.create({ data: { id: userId, name: "Transport test", email: `${userId}@example.test`, whatsappPhone: phone } });
    await prisma.trip.create({ data: { id: tripId, name: "China test", status: "ACTIVE", createdById: userId, members: { create: { userId, role: "TRAVELER" } } } });
    await prisma.company.create({ data: { id: catalogId, name: "Transport company", normalizedName: `transport-${catalogId}` } });
    await prisma.tripCompany.create({ data: { id: companyId, tripId, catalogCompanyId: catalogId, members: { create: { userId } } } });

    await t.test("un callback anterior al commit del ID se reconcilia y no se pierde", async () => {
      const burst = await createBurst(); const providerId = randomUUID();
      const reply = await prisma.whatsAppBurstReply.create({ data: { burstId: burst.id, revision: 1, text: "Respuesta" } });
      await store.flushReplies(async (_phone, _text, context) => {
        assert.equal(await store.applyDeliveryStatus(instance, providerId, "READ"), false);
        context!.delivery!.messageId = providerId;
      });
      assert.equal((await prisma.whatsAppBurstReply.findUniqueOrThrow({ where: { id: reply.id } })).status, "READ");
      assert.ok((await prisma.whatsAppDeliveryEvent.findUniqueOrThrow({ where: { instance_providerMessageId_status: { instance, providerMessageId: providerId, status: "READ" } } })).appliedAt);
    });

    await t.test("READ y DELIVERED concurrentes no degradan el estado; fracaso tardío tampoco", async () => {
      const burst = await createBurst(); const providerId = randomUUID();
      const reply = await prisma.whatsAppBurstReply.create({ data: { burstId: burst.id, revision: 1, text: "Respuesta", providerMessageId: providerId, status: "ACCEPTED" } });
      await Promise.all([store.applyDeliveryStatus(instance, providerId, "READ"), store.applyDeliveryStatus(instance, providerId, "DELIVERED")]);
      await store.applyDeliveryStatus(instance, providerId, "DELIVERY_FAILED");
      assert.equal((await prisma.whatsAppBurstReply.findUniqueOrThrow({ where: { id: reply.id } })).status, "READ");
    });

    await t.test("el inbox directo también resuelve callbacks antes de guardar el ID", async () => {
      const id = randomUUID(); const providerId = randomUUID();
      const row = await prisma.whatsAppQuarantinedMessage.create({ data: { instance, messageId: id, phone, type: "TEXT", payload: {}, status: "PRESERVED", replyText: "Ayuda", replyStatus: "PENDING" } });
      await quarantine.flushReplies(async (_phone, _text, onId) => {
        await quarantine.applyDeliveryStatus(instance, providerId, "DELIVERED"); onId(providerId);
      });
      assert.equal((await prisma.whatsAppQuarantinedMessage.findUniqueOrThrow({ where: { id: row.id } })).replyStatus, "DELIVERED");
    });

    await t.test("recuperar después del commit conserva callbacks aunque el worker haya muerto", async () => {
      const burst = await createBurst(); const providerId = randomUUID();
      await store.applyDeliveryStatus(instance, providerId, "DELIVERED");
      const reply = await prisma.whatsAppBurstReply.create({ data: { burstId: burst.id, revision: 1, text: "Respuesta", providerMessageId: providerId, status: "ACCEPTED" } });
      await reconcileDeliveryEvents(prisma, instance, providerId);
      assert.equal((await prisma.whatsAppBurstReply.findUniqueOrThrow({ where: { id: reply.id } })).status, "DELIVERED");
    });

    await t.test("partes extensas se conservan y envían una sola vez en orden", async () => {
      const burst = await createBurst(); const text = "Proveedor, detalle solicitado y condiciones.\n".repeat(350);
      await prisma.whatsAppBurstReply.create({ data: { burstId: burst.id, revision: 1, text } });
      const sent: string[] = [];
      const send = async (_phone: string, part: string, context?: import("../../lib/channels/whatsapp/supplier-picker.ts").ReplyContext) => { sent.push(part); context!.delivery!.messageId = randomUUID(); };
      for (let i = 0; i < 5; i++) await store.flushReplies(send);
      assert.equal(sent.join(""), text);
      const replies = await prisma.whatsAppBurstReply.findMany({ where: { burstId: burst.id }, orderBy: { partIndex: "asc" } });
      assert.equal(replies.length, sent.length); assert.equal(replies[0].kind, "FINAL");
      assert.ok(replies.every(row => row.status === "ACCEPTED" && row.text.length <= 4_000));
    });

    await t.test("una primera parte de transporte incierto mantiene las posteriores pendientes", async () => {
      const burst = await createBurst();
      await prisma.whatsAppBurstReply.createMany({ data: [{ burstId: burst.id, revision: 1, kind: "FINAL", partIndex: 0, text: "Primera" }, { burstId: burst.id, revision: 1, kind: "FINAL_PART_1", partIndex: 1, text: "Segunda" }] });
      let attempts = 0; await store.flushReplies(async () => { attempts++; throw new Error("Timeout"); });
      await store.flushReplies(async () => { attempts++; });
      const rows = await prisma.whatsAppBurstReply.findMany({ where: { burstId: burst.id }, orderBy: { partIndex: "asc" } });
      assert.equal(attempts, 1); assert.deepEqual(rows.map(row => row.status), ["DELIVERY_UNKNOWN", "PENDING"]);
      await prisma.whatsAppBurstReply.updateMany({ where: { burstId: burst.id }, data: { status: "SUPERSEDED" } });
    });

    await t.test("la aceptación sin confirmación dispara una alerta diferenciada", async () => {
      const now = new Date(); const old = new Date(now.getTime() - 200_000); const burst = await createBurst();
      const reply = await prisma.whatsAppBurstReply.create({ data: { burstId: burst.id, revision: 1, text: "Respuesta", status: "SERVER_ACK", acceptedAt: old } });
      const findings = await collectOperationalFindings(prisma, { state: "open", webhookOk: true }, now);
      assert.ok(findings.some(finding => finding.category === "DELIVERY_UNCONFIRMED" && finding.severity === "CRITICAL"));
      await prisma.whatsAppBurstReply.delete({ where: { id: reply.id } });
    });

    await t.test("el watchdog distingue un monitor vivo de uno detenido", async () => {
      const now = new Date();
      await prisma.whatsAppServiceHeartbeat.upsert({ where: { id: "monitor" }, create: { id: "monitor", checkedAt: now }, update: { checkedAt: now } });
      assert.deepEqual(await collectMonitorHeartbeatFinding(prisma, now), []);
      assert.equal((await collectMonitorHeartbeatFinding(prisma, new Date(now.getTime() + 181_000)))[0].severity, "CRITICAL");
    });

    await t.test("una alerta escala y reintenta recuperación usando recibos durables", async () => {
      const fingerprint = `test-${instance}`; const now = new Date(); const sent: string[] = []; let fail = false;
      const finding = (severity: "WARNING" | "CRITICAL") => ({ fingerprint, category: "TRANSPORT_TEST", severity, summary: "Test", details: {} });
      const send = async (mail: import("../../lib/channels/whatsapp/operational-alert-email.ts").OperationalEmail) => { if (fail) throw new Error("Unavailable"); sent.push(mail.idempotencyKey); };
      await reconcileOperationalAlerts(prisma, [finding("WARNING")], now, send, ["TRANSPORT_TEST"]);
      await reconcileOperationalAlerts(prisma, [finding("CRITICAL")], new Date(now.getTime() + 15_000), send, ["TRANSPORT_TEST"]);
      fail = true; await reconcileOperationalAlerts(prisma, [], new Date(now.getTime() + 30_000), send, ["TRANSPORT_TEST"]);
      fail = false; await reconcileOperationalAlerts(prisma, [], new Date(now.getTime() + 46_000), send, ["TRANSPORT_TEST"]);
      assert.equal(new Set(sent).size, 3);
      const alert = await prisma.whatsAppOperationalAlert.findUniqueOrThrow({ where: { fingerprint }, include: { notifications: true } });
      assert.equal(alert.status, "RESOLVED"); assert.ok(alert.recoveryNotifiedAt);
      assert.deepEqual(alert.notifications.map(row => row.status), ["SENT", "SENT", "SENT"]);
      await prisma.whatsAppOperationalAlert.delete({ where: { id: alert.id } });
    });

    await t.test("cuarentena aplaza fallos y deja de reintentar formatos rechazados", async () => {
      const row = await prisma.whatsAppQuarantinedMessage.create({ data: { instance, messageId: randomUUID(), phone, type: "IMAGE", payload: {} } });
      await quarantine.failed(row.id, "TemporaryFailure");
      let stored = await prisma.whatsAppQuarantinedMessage.findUniqueOrThrow({ where: { id: row.id } });
      assert.equal(stored.status, "RECEIVED"); assert.ok(stored.nextRecoveryAt.getTime() > Date.now());
      await quarantine.failed(row.id, "MEDIA_INVALID", true);
      stored = await prisma.whatsAppQuarantinedMessage.findUniqueOrThrow({ where: { id: row.id } });
      assert.equal(stored.status, "REJECTED"); assert.equal(stored.recoveryLeaseUntil, null);
    });

    await t.test("cincuenta mensajes y sesenta segundos cierran unidades sin perder recepción", async () => {
      const envelope = (index: number): BurstEnvelope => ({ instance: `${instance}-bounds`, messageId: String(index), phone, type: "TEXT", text: `Información de proveedores ${index}`, sentAt: null, media: null });
      for (let index = 0; index < 51; index++) await store.receive(envelope(index));
      const bursts = await prisma.whatsAppBurst.findMany({ where: { instance: `${instance}-bounds` }, include: { messages: true }, orderBy: { createdAt: "asc" } });
      assert.deepEqual(bursts.map(row => row.messages.length), [50, 1]);
      const active = bursts[1]; await prisma.whatsAppBurst.update({ where: { id: active.id }, data: { createdAt: new Date(Date.now() - 61_000) } });
      await store.receive(envelope(51));
      assert.equal(await prisma.whatsAppBurst.count({ where: { instance: `${instance}-bounds` } }), 3);
      assert.equal(await prisma.whatsAppBurstMessage.count({ where: { instance: `${instance}-bounds` } }), 52);
    });
  } finally {
    await prisma.whatsAppDeliveryEvent.deleteMany({ where: { instance } });
    await prisma.whatsAppQuarantinedMessage.deleteMany({ where: { instance } });
    await prisma.whatsAppOperationalAlert.deleteMany({ where: { category: "TRANSPORT_TEST" } });
    await prisma.trip.deleteMany({ where: { id: tripId } });
    await prisma.company.deleteMany({ where: { id: catalogId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
    if (previousAllowed === undefined) delete process.env.WHATSAPP_UAT_ALLOWED_PHONES; else process.env.WHATSAPP_UAT_ALLOWED_PHONES = previousAllowed;
  }
});
