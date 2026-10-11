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
  const previous = { secret: process.env.EVOLUTION_WEBHOOK_SECRET, expectedUrl: process.env.EVOLUTION_WEBHOOK_EXPECTED_URL, url: process.env.EVOLUTION_API_URL, key: process.env.EVOLUTION_API_KEY, instance: process.env.EVOLUTION_INSTANCE, host: process.env.NIHAO_PUBLIC_API_HOST };
  Object.assign(process.env, { EVOLUTION_WEBHOOK_SECRET: "configured-secret-abcdefghijklmnopqrstuvwxyz", EVOLUTION_WEBHOOK_EXPECTED_URL: "https://api.example.test/api/channels/whatsapp/webhook", EVOLUTION_API_URL: "https://evolution.example.test", EVOLUTION_API_KEY: "secret", EVOLUTION_INSTANCE: "nihao", NIHAO_PUBLIC_API_HOST: "api.example.test" });
  try {
    const request = async (url: string | URL | Request) => new Response(String(url).includes("connectionState")
      ? JSON.stringify({ instance: { state: "open" } })
      : JSON.stringify({ enabled: true, url: "https://api.example.test/api/channels/whatsapp/webhook", headers: { "x-nihao-webhook-secret": "configured-secret-abcdefghijklmnopqrstuvwxyz" }, events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE"] }), { status: 200 });
    assert.deepEqual(await readEvolutionOperationalState(request as typeof fetch), { state: "open", webhookOk: true });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      const name = key === "secret" ? "EVOLUTION_WEBHOOK_SECRET" : key === "expectedUrl" ? "EVOLUTION_WEBHOOK_EXPECTED_URL" : key === "url" ? "EVOLUTION_API_URL" : key === "key" ? "EVOLUTION_API_KEY" : key === "instance" ? "EVOLUTION_INSTANCE" : "NIHAO_PUBLIC_API_HOST";
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("el monitor detecta falta de progreso, originales pendientes y respuestas sin resolución", async () => {
  const oldest = new Date("2026-10-11T02:55:00Z");
  const none = { _count: 0, _min: { receivedAt: null, lastProgressAt: null, createdAt: null } };
  const prisma = {
    whatsAppBurstMessage: { async aggregate() { return { _count: 1, _min: { receivedAt: oldest } }; } },
    whatsAppQuarantinedMessage: { async aggregate(input: { where: { replyStatus?: unknown } }) { return input.where.replyStatus ? none : none; } },
    whatsAppBurst: { async aggregate() { return { _count: 1, _min: { lastProgressAt: oldest } }; } },
    whatsAppBurstReply: { async aggregate(input: { where: { acceptedAt?: unknown } }) { return input.where.acceptedAt ? none : { _count: 1, _min: { createdAt: oldest } }; } },
  } as unknown as PrismaClient;
  const findings = await collectOperationalFindings(prisma, { state: "open", webhookOk: true }, new Date("2026-10-11T03:00:00Z"), { noticeMs: 45_000, warningMs: 90_000, criticalMs: 180_000 });
  assert.deepEqual(findings.map((finding) => [finding.fingerprint, finding.severity]), [["storage:pending", "CRITICAL"], ["worker:stalled", "CRITICAL"], ["delivery:pending", "CRITICAL"]]);
});

function fakeAlerts() {
  type Row = Record<string, unknown>;
  const alerts = new Map<string, Row>(); const notifications = new Map<string, Row>();
  let sequence = 0;
  const matches = (row: Row, where: Row): boolean => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && !(value instanceof Date)) {
      const condition = value as Row;
      if ("in" in condition) return (condition.in as unknown[]).includes(row[key]);
      if ("not" in condition) return row[key] !== condition.not;
      if ("lte" in condition) return row[key] != null && (row[key] as Date) <= (condition.lte as Date);
      if ("lt" in condition) return row[key] != null && (row[key] as Date) < (condition.lt as Date);
    }
    return value instanceof Date ? row[key] instanceof Date && (row[key] as Date).getTime() === value.getTime() : row[key] === value;
  });
  const apply = (row: Row, data: Row) => { for (const [key, value] of Object.entries(data)) row[key] = value && typeof value === "object" && "increment" in value ? Number(row[key] ?? 0) + Number(value.increment) : value; };
  const model = (rows: Map<string, Row>, notification: boolean) => ({
    async findMany(input?: { where?: Row; include?: Row }) {
      return [...rows.values()].filter(row => !input?.where || matches(row, input.where)).map(row => ({ ...row, ...(input?.include ? { alert: alerts.get(String(row.alertId)) } : {}) }));
    },
    async upsert(input: { where: Row; create: Row; update: Row }) {
      const where = notification ? input.where.alertId_episode_transition as Row : input.where;
      const current = [...rows.values()].find(row => matches(row, where));
      if (current) { apply(current, input.update); return { ...current }; }
      const created: Row = { id: `row-${++sequence}`, status: notification ? "PENDING" : "ACTIVE", attempts: 0, notifiedAt: null, resolvedAt: null, recoveryNotifiedAt: null, notificationError: null, ...input.create };
      rows.set(String(created.id), created); return { ...created };
    },
    async update(input: { where: Row; data: Row }) { const row = [...rows.values()].find(row => matches(row, input.where))!; apply(row, input.data); return { ...row }; },
    async updateMany(input: { where: Row; data: Row }) { const selected = [...rows.values()].filter(row => matches(row, input.where)); for (const row of selected) apply(row, input.data); return { count: selected.length }; },
  });
  const fake = { whatsAppOperationalAlert: model(alerts, false), whatsAppOperationalNotification: model(notifications, true), async $executeRaw() {}, async $transaction<T>(work: (prisma: unknown) => Promise<T>) { return work(fake); } };
  return { prisma: fake as unknown as PrismaClient, alerts, notifications };
}

const testFinding = (severity: "WARNING" | "CRITICAL" = "CRITICAL"): OperationalFinding => ({ fingerprint: "worker:stalled", category: "WORKER_STALLED", severity, summary: "stalled", details: { count: 1 } });

test("las alertas se deduplican por episodio e informan recuperación", async () => {
  const { prisma } = fakeAlerts(); const sent: OperationalEmail[] = [];
  const send = async (email: OperationalEmail) => { sent.push(email); };
  const now = new Date("2026-10-11T03:00:00Z");
  await reconcileOperationalAlerts(prisma, [testFinding()], now, send);
  await reconcileOperationalAlerts(prisma, [testFinding()], new Date(now.getTime() + 15_000), send);
  await reconcileOperationalAlerts(prisma, [], new Date(now.getTime() + 30_000), send);
  await reconcileOperationalAlerts(prisma, [], new Date(now.getTime() + 45_000), send);
  await reconcileOperationalAlerts(prisma, [testFinding()], new Date(now.getTime() + 60_000), send);
  await reconcileOperationalAlerts(prisma, [], new Date(now.getTime() + 90_000), send);
  assert.deepEqual(sent.map(email => email.subject), ["[Nihao] Alerta crítica del canal WhatsApp", "[Nihao] Servicio de WhatsApp recuperado", "[Nihao] Alerta crítica del canal WhatsApp", "[Nihao] Servicio de WhatsApp recuperado"]);
});

test("una advertencia que escala a crítica tiene una nueva notificación", async () => {
  const { prisma } = fakeAlerts(); const sent: OperationalEmail[] = [];
  const now = new Date("2026-10-11T03:00:00Z");
  const send = async (email: OperationalEmail) => { sent.push(email); };
  await reconcileOperationalAlerts(prisma, [testFinding("WARNING")], now, send);
  await reconcileOperationalAlerts(prisma, [testFinding("CRITICAL")], new Date(now.getTime() + 15_000), send);
  await reconcileOperationalAlerts(prisma, [testFinding("CRITICAL")], new Date(now.getTime() + 30_000), send);
  assert.deepEqual(sent.map(email => email.subject), ["[Nihao] Advertencia del canal WhatsApp", "[Nihao] Alerta crítica del canal WhatsApp"]);
});

test("una notificación de recuperación fallida se reintenta aun con alerta resuelta", async () => {
  const { prisma, notifications } = fakeAlerts(); const sent: OperationalEmail[] = []; let fail = false;
  const now = new Date("2026-10-11T03:00:00Z");
  const send = async (email: OperationalEmail) => { if (fail) throw new Error("MailUnavailable"); sent.push(email); };
  await reconcileOperationalAlerts(prisma, [testFinding()], now, send);
  fail = true; await reconcileOperationalAlerts(prisma, [], new Date(now.getTime() + 15_000), send);
  const recovery = [...notifications.values()].find(row => row.transition === "RECOVERY")!;
  assert.equal(recovery.status, "PENDING"); fail = false;
  await reconcileOperationalAlerts(prisma, [], new Date(now.getTime() + 31_000), send);
  assert.equal(sent.length, 2); assert.equal(recovery.status, "SENT");
  assert.equal(sent[1].idempotencyKey, `whatsapp-notification-${recovery.id}`);
});

test("URL equivocada o secreto diferente no son configuración saludable", async () => {
  const keys = ["EVOLUTION_API_URL", "EVOLUTION_API_KEY", "EVOLUTION_INSTANCE", "EVOLUTION_WEBHOOK_SECRET", "EVOLUTION_WEBHOOK_EXPECTED_URL"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, { EVOLUTION_API_URL: "https://evolution.example.test", EVOLUTION_API_KEY: "key", EVOLUTION_INSTANCE: "nihao", EVOLUTION_WEBHOOK_SECRET: "secret-abcdefghijklmnopqrstuvwxyz-12345", EVOLUTION_WEBHOOK_EXPECTED_URL: "https://api.example.test/api/channels/whatsapp/webhook" });
  try {
    for (const [url, secret] of [["https://api.example.test/wrong-path", process.env.EVOLUTION_WEBHOOK_SECRET], [process.env.EVOLUTION_WEBHOOK_EXPECTED_URL, "different-secret-abcdefghijklmnopqrstuvwxyz"]]) {
      const request = async (target: string | URL | Request) => new Response(JSON.stringify(String(target).includes("connectionState") ? { state: "open" } : { enabled: true, url, headers: { "x-nihao-webhook-secret": secret }, events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE"] }));
      assert.equal((await readEvolutionOperationalState(request as typeof fetch)).webhookOk, false);
    }
  } finally { for (const key of keys) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
});
