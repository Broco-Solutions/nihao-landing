import assert from "node:assert/strict";
import test from "node:test";
import { operationalAlertRecipients, type OperationalEmail } from "../../lib/channels/whatsapp/operational-alert-email.ts";
import { collectOperationalFindings, operationalThresholds, readEvolutionOperationalState, reconcileOperationalAlerts, type OperationalFinding } from "../../lib/channels/whatsapp/operational-monitor.ts";
import type { PrismaClient } from "../../generated/prisma/client.ts";

test("los umbrales operativos exigen notice < warning < critical", () => {
  assert.deepEqual(operationalThresholds({ WHATSAPP_PROCESSING_NOTICE_MS: "45000", WHATSAPP_OPERATIONAL_WARNING_MS: "90000", WHATSAPP_OPERATIONAL_CRITICAL_MS: "180000" }), { noticeMs: 45_000, warningMs: 90_000, criticalMs: 180_000 });
  assert.throws(() => operationalThresholds({ WHATSAPP_PROCESSING_NOTICE_MS: "90000", WHATSAPP_OPERATIONAL_WARNING_MS: "45000", WHATSAPP_OPERATIONAL_CRITICAL_MS: "180000" }), /Invalid/);
});

test("los destinatarios de alertas se validan y deduplican", () => {
  assert.deepEqual(operationalAlertRecipients("ops@example.test;OPS@example.test\ninvalid"), ["ops@example.test"]);
});

test("la comprobación de Evolution requiere conexión, secreto y ambos eventos", async () => {
  const previous = { url: process.env.EVOLUTION_API_URL, key: process.env.EVOLUTION_API_KEY, instance: process.env.EVOLUTION_INSTANCE, host: process.env.NIHAO_PUBLIC_API_HOST };
  Object.assign(process.env, { EVOLUTION_API_URL: "https://evolution.example.test", EVOLUTION_API_KEY: "secret", EVOLUTION_INSTANCE: "nihao", NIHAO_PUBLIC_API_HOST: "api.example.test" });
  try {
    const request = async (url: string | URL | Request) => new Response(String(url).includes("connectionState")
      ? JSON.stringify({ instance: { state: "open" } })
      : JSON.stringify({ enabled: true, url: "https://api.example.test/api/channels/whatsapp/webhook", headers: { "x-nihao-webhook-secret": "configured" }, events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE"] }), { status: 200 });
    assert.deepEqual(await readEvolutionOperationalState(request as typeof fetch), { state: "open", webhookOk: true });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      const name = key === "url" ? "EVOLUTION_API_URL" : key === "key" ? "EVOLUTION_API_KEY" : key === "instance" ? "EVOLUTION_INSTANCE" : "NIHAO_PUBLIC_API_HOST";
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("el monitor detecta falta de progreso, originales pendientes y respuestas sin resolución", async () => {
  const oldest = new Date("2026-10-11T02:55:00Z");
  const none = { _count: 0, _min: { receivedAt: null, lastProgressAt: null, lastErrorAt: null, createdAt: null } };
  const prisma = {
    whatsAppBurstMessage: { async aggregate() { return { _count: 1, _min: { receivedAt: oldest } }; } },
    whatsAppQuarantinedMessage: { async aggregate(input: { where: { replyStatus?: unknown } }) { return input.where.replyStatus ? none : none; } },
    whatsAppBurst: { async aggregate(input: { where: { status?: string | { in: string[] }; state?: unknown } }) { return input.where.status === "FAILED" || input.where.state ? none : { _count: 1, _min: { lastProgressAt: oldest, lastErrorAt: null } }; } },
    whatsAppBurstReply: { async aggregate() { return { _count: 1, _min: { createdAt: oldest } }; } },
  } as unknown as PrismaClient;
  const findings = await collectOperationalFindings(prisma, { state: "open", webhookOk: true }, new Date("2026-10-11T03:00:00Z"), { noticeMs: 45_000, warningMs: 90_000, criticalMs: 180_000 });
  assert.deepEqual(findings.map((finding) => [finding.fingerprint, finding.severity]), [["storage:pending", "CRITICAL"], ["worker:stalled", "CRITICAL"], ["delivery:pending", "CRITICAL"]]);
});

test("el monitor mantiene visible una ráfaga aislada por un fallo determinístico", async () => {
  const failedAt = new Date("2026-10-11T02:55:00Z");
  const none = { _count: 0, _min: { receivedAt: null, lastProgressAt: null, lastErrorAt: null, createdAt: null } };
  const prisma = {
    whatsAppBurstMessage: { async aggregate() { return none; } },
    whatsAppQuarantinedMessage: { async aggregate() { return none; } },
    whatsAppBurst: { async aggregate(input: { where: { status?: string | { in: string[] }; state?: unknown } }) { return input.where.status === "FAILED" ? { _count: 1, _min: { lastErrorAt: failedAt } } : none; } },
    whatsAppBurstReply: { async aggregate() { return none; } },
  } as unknown as PrismaClient;
  const findings = await collectOperationalFindings(prisma, { state: "open", webhookOk: true }, new Date("2026-10-11T03:00:00Z"), { noticeMs: 45_000, warningMs: 90_000, criticalMs: 180_000 });
  assert.deepEqual(findings, [{ fingerprint: "processing:failed", category: "PROCESSING_FAILURE", severity: "CRITICAL", summary: "Hay ráfagas aisladas por un fallo no recuperable", details: { count: 1, oldestAgeSeconds: 300 } }]);
});

test("el monitor alerta errores de herramienta persistentes sin incluir mensajes privados", async () => {
  const failedAt = new Date("2026-10-11T02:55:00Z");
  const none = { _count: 0, _min: { receivedAt: null, lastProgressAt: null, lastErrorAt: null, createdAt: null } };
  const prisma = {
    whatsAppBurstMessage: { async aggregate() { return none; } },
    whatsAppQuarantinedMessage: { async aggregate() { return none; } },
    whatsAppBurst: { async aggregate(input: { where: { status?: unknown; state?: unknown } }) {
      return input.where.state ? { _count: 1, _min: { lastErrorAt: failedAt } } : none;
    } },
    whatsAppBurstReply: { async aggregate() { return none; } },
  } as unknown as PrismaClient;
  const findings = await collectOperationalFindings(prisma, { state: "open", webhookOk: true }, new Date("2026-10-11T03:00:00Z"), { noticeMs: 45_000, warningMs: 90_000, criticalMs: 180_000 });
  assert.deepEqual(findings, [{ fingerprint: "processing:tool-error", category: "FUNCTIONAL_TOOL_ERROR", severity: "CRITICAL", summary: "El agente terminó con errores de herramientas y hay evidencia pendiente", details: { count: 1, oldestAgeSeconds: 300 } }]);
  assert.equal(JSON.stringify(findings).includes("private"), false);
});

test("las alertas se deduplican, informan recuperación y vuelven a avisar si el fallo reaparece", async () => {
  type Row = { id: string; fingerprint: string; category: string; severity: string; status: string; details: unknown; firstSeenAt: Date; lastSeenAt: Date; notifiedAt: Date | null; resolvedAt: Date | null; recoveryNotifiedAt: Date | null; notificationError: string | null };
  const rows = new Map<string, Row>();
  let sequence = 0;
  const model = {
    async findMany() { return [...rows.values()]; },
    async upsert(input: { where: { fingerprint: string }; create: Omit<Row, "id" | "status" | "notifiedAt" | "resolvedAt" | "recoveryNotifiedAt" | "notificationError">; update: Partial<Row> }) {
      const current = rows.get(input.where.fingerprint);
      if (current) { Object.assign(current, input.update); return { ...current }; }
      const created: Row = { id: `alert-${++sequence}`, status: "ACTIVE", notifiedAt: null, resolvedAt: null, recoveryNotifiedAt: null, notificationError: null, ...input.create };
      rows.set(created.fingerprint, created); return { ...created };
    },
    async updateMany(input: { where: { id: { in: string[] } }; data: Partial<Row> }) { for (const row of rows.values()) if (input.where.id.in.includes(row.id)) Object.assign(row, input.data); return { count: input.where.id.in.length }; },
  };
  const prisma = { whatsAppOperationalAlert: model } as unknown as PrismaClient;
  const sent: OperationalEmail[] = [];
  const send = async (email: OperationalEmail) => { sent.push(email); };
  const now = new Date("2026-10-11T03:00:00Z");
  const finding: OperationalFinding = { fingerprint: "worker:stalled", category: "WORKER_STALLED", severity: "CRITICAL", summary: "stalled", details: { count: 1 } };
  await reconcileOperationalAlerts(prisma, [finding], now, send);
  await reconcileOperationalAlerts(prisma, [finding], new Date(now.getTime() + 15_000), send);
  await reconcileOperationalAlerts(prisma, [], new Date(now.getTime() + 30_000), send);
  await reconcileOperationalAlerts(prisma, [], new Date(now.getTime() + 45_000), send);
  await reconcileOperationalAlerts(prisma, [finding], new Date(now.getTime() + 60_000), send);
  await reconcileOperationalAlerts(prisma, [finding], new Date(now.getTime() + 75_000), send);
  await reconcileOperationalAlerts(prisma, [], new Date(now.getTime() + 90_000), send);
  assert.deepEqual(sent.map((email) => email.subject), ["[Nihao] Alerta crítica del canal WhatsApp", "[Nihao] Servicio de WhatsApp recuperado", "[Nihao] Alerta crítica del canal WhatsApp", "[Nihao] Servicio de WhatsApp recuperado"]);
  assert.equal(rows.get("worker:stalled")?.status, "RESOLVED");
});
