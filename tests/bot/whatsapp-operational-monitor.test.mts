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
  assert.deepEqual(operationalAlertRecipients("soporte@brocosolutions.com;SOPORTE@BROCOSOLUTIONS.COM\notro@example.test"), ["soporte@brocosolutions.com"]);
  assert.deepEqual(operationalAlertRecipients("cliente@example.test"), []);
});

test("la comprobación de Evolution requiere conexión, secreto y ambos eventos", async () => {
  const previous = { url: process.env.EVOLUTION_API_URL, key: process.env.EVOLUTION_API_KEY, instance: process.env.EVOLUTION_INSTANCE, host: process.env.NIHAO_PUBLIC_API_HOST };
  Object.assign(process.env, { EVOLUTION_API_URL: "https://evolution.example.test", EVOLUTION_API_KEY: "secret", EVOLUTION_INSTANCE: "nihao", NIHAO_PUBLIC_API_HOST: "api.example.test" });
  try {
    const request = async (url: string | URL | Request) => new Response(String(url).includes("connectionState")
      ? JSON.stringify({ instance: { state: "open" } })
      : JSON.stringify({ enabled: true, url: "https://api.example.test/api/channels/whatsapp/webhook", headers: { "x-nihao-webhook-secret": "configured" }, events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE"] }), { status: 200 });
    assert.deepEqual(await readEvolutionOperationalState(request as typeof fetch), { state: "open", webhookOk: true, probeComplete: true });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      const name = key === "url" ? "EVOLUTION_API_URL" : key === "key" ? "EVOLUTION_API_KEY" : key === "instance" ? "EVOLUTION_INSTANCE" : "NIHAO_PUBLIC_API_HOST";
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("un HTTP 526 de Evolution deja el webhook como desconocido, no inválido", async () => {
  const previous = { url: process.env.EVOLUTION_API_URL, key: process.env.EVOLUTION_API_KEY, instance: process.env.EVOLUTION_INSTANCE };
  Object.assign(process.env, { EVOLUTION_API_URL: "https://evolution.example.test", EVOLUTION_API_KEY: "secret", EVOLUTION_INSTANCE: "nihao" });
  try {
    const request = async () => new Response("origin TLS error", { status: 526 });
    assert.deepEqual(await readEvolutionOperationalState(request as typeof fetch), { state: "unknown", webhookOk: null, probeComplete: false, probeError: "http_526" });
  } finally {
    for (const [name, value] of Object.entries({ EVOLUTION_API_URL: previous.url, EVOLUTION_API_KEY: previous.key, EVOLUTION_INSTANCE: previous.instance })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("si el endpoint de webhook falla, el estado de conexión se conserva y el webhook queda desconocido", async () => {
  const previous = { url: process.env.EVOLUTION_API_URL, key: process.env.EVOLUTION_API_KEY, instance: process.env.EVOLUTION_INSTANCE };
  Object.assign(process.env, { EVOLUTION_API_URL: "https://evolution.example.test", EVOLUTION_API_KEY: "secret", EVOLUTION_INSTANCE: "nihao" });
  try {
    const request = async (url: string | URL | Request) => String(url).includes("connectionState")
      ? new Response(JSON.stringify({ instance: { state: "open" } }), { status: 200 })
      : new Response("origin TLS error", { status: 526 });
    assert.deepEqual(await readEvolutionOperationalState(request as typeof fetch), { state: "open", webhookOk: null, probeComplete: false, probeError: "http_526" });
  } finally {
    for (const [name, value] of Object.entries({ EVOLUTION_API_URL: previous.url, EVOLUTION_API_KEY: previous.key, EVOLUTION_INSTANCE: previous.instance })) {
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
  const findings = await collectOperationalFindings(prisma, { state: "open", webhookOk: true, probeComplete: true }, new Date("2026-10-11T03:00:00Z"), { noticeMs: 45_000, warningMs: 90_000, criticalMs: 180_000 });
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
  const findings = await collectOperationalFindings(prisma, { state: "open", webhookOk: true, probeComplete: true }, new Date("2026-10-11T03:00:00Z"), { noticeMs: 45_000, warningMs: 90_000, criticalMs: 180_000 });
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
  const findings = await collectOperationalFindings(prisma, { state: "open", webhookOk: true, probeComplete: true }, new Date("2026-10-11T03:00:00Z"), { noticeMs: 45_000, warningMs: 90_000, criticalMs: 180_000 });
  assert.deepEqual(findings, [{ fingerprint: "processing:tool-error", category: "FUNCTIONAL_TOOL_ERROR", severity: "CRITICAL", summary: "El agente terminó con errores de herramientas y hay evidencia pendiente", details: { count: 1, oldestAgeSeconds: 300 } }]);
  assert.equal(JSON.stringify(findings).includes("private"), false);
});

test("las alertas funcionales notifican al detectar y recuperan solo tras dos comprobaciones", async () => {
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
  assert.deepEqual(sent.map((email) => email.subject), ["[NIHAO-OPS] [CRITICO] Problema en WhatsApp", "[NIHAO-OPS] [RECUPERADO] Componente de WhatsApp"]);
  assert.equal(sent.every((email) => email.idempotencyKey.length > 0), true);
  assert.equal(rows.get("worker:stalled")?.status, "RESOLVED");
});

type AlertRow = { id: string; fingerprint: string; category: string; severity: string; status: string; details: unknown; firstSeenAt: Date; lastSeenAt: Date; notifiedAt: Date | null; resolvedAt: Date | null; recoveryNotifiedAt: Date | null; notificationError: string | null };
function alertHarness() {
  const rows = new Map<string, AlertRow>();
  let sequence = 0;
  const model = {
    async findMany() { return [...rows.values()].map((row) => ({ ...row })); },
    async upsert(input: { where: { fingerprint: string }; create: Omit<AlertRow, "id" | "status" | "notifiedAt" | "resolvedAt" | "recoveryNotifiedAt" | "notificationError">; update: Partial<AlertRow> }) {
      const current = rows.get(input.where.fingerprint);
      if (current) { Object.assign(current, input.update); return { ...current }; }
      const created: AlertRow = { id: `alert-${++sequence}`, status: "ACTIVE", notifiedAt: null, resolvedAt: null, recoveryNotifiedAt: null, notificationError: null, ...input.create };
      rows.set(created.fingerprint, created); return { ...created };
    },
    async updateMany(input: { where: { id: { in: string[] } }; data: Partial<AlertRow> }) { for (const row of rows.values()) if (input.where.id.in.includes(row.id)) Object.assign(row, input.data); return { count: input.where.id.in.length }; },
  };
  return { prisma: { whatsAppOperationalAlert: model } as unknown as PrismaClient, rows };
}
const apiFinding: OperationalFinding = { fingerprint: "evolution:api-unreachable", category: "EVOLUTION_API_UNREACHABLE", severity: "CRITICAL", summary: "No se pudo consultar Evolution", details: { error: "http_526" } };
const at = (start: Date, seconds: number) => new Date(start.getTime() + seconds * 1_000);

test("526 → open → 526 no alerta hasta que la falla sea consecutiva y estable", async () => {
  const { prisma, rows } = alertHarness();
  const sent: OperationalEmail[] = [];
  const send = async (email: OperationalEmail) => { sent.push(email); };
  const start = new Date("2026-10-20T00:00:00Z");
  await reconcileOperationalAlerts(prisma, [apiFinding], start, send, false);
  await reconcileOperationalAlerts(prisma, [], at(start, 15), send, true);
  await reconcileOperationalAlerts(prisma, [apiFinding], at(start, 30), send, false);
  assert.equal(sent.length, 0);
  await reconcileOperationalAlerts(prisma, [apiFinding], at(start, 45), send, false);
  assert.equal(sent.length, 0);
  await reconcileOperationalAlerts(prisma, [apiFinding], at(start, 60), send, false);
  assert.deepEqual(sent.map((email) => email.subject), ["[NIHAO-OPS] [CRITICO] Problema en WhatsApp"]);
  assert.equal(rows.get(apiFinding.fingerprint)?.status, "ACTIVE");
});

test("una falla aislada con recuperación inmediata no manda correo", async () => {
  const { prisma } = alertHarness();
  const sent: OperationalEmail[] = [];
  const send = async (email: OperationalEmail) => { sent.push(email); };
  const start = new Date("2026-10-20T01:00:00Z");
  await reconcileOperationalAlerts(prisma, [apiFinding], start, send, false);
  await reconcileOperationalAlerts(prisma, [], at(start, 15), send, true);
  await reconcileOperationalAlerts(prisma, [], at(start, 30), send, true);
  assert.equal(sent.length, 0);
});

test("la recuperación es parcial si permanece activa otra categoría y los asuntos tienen prefijo fijo", async () => {
  const { prisma } = alertHarness();
  const sent: OperationalEmail[] = [];
  const send = async (email: OperationalEmail) => { sent.push(email); };
  const start = new Date("2026-10-20T02:00:00Z");
  const warning: OperationalFinding = { fingerprint: "evolution:webhook-invalid", category: "EVOLUTION_WEBHOOK", severity: "CRITICAL", summary: "Webhook inválido", details: {} };
  const functional: OperationalFinding = { fingerprint: "delivery:pending", category: "RESPONSE_DELIVERY", severity: "WARNING", summary: "Entrega pendiente", details: { count: 2 } };
  for (const second of [0, 15, 30]) await reconcileOperationalAlerts(prisma, [apiFinding, warning, functional], at(start, second), send, false);
  assert.deepEqual(sent.map((email) => email.subject), ["[NIHAO-OPS] [ADVERTENCIA] Problema en WhatsApp", "[NIHAO-OPS] [CRITICO] Problema en WhatsApp"]);
  await reconcileOperationalAlerts(prisma, [apiFinding, functional], at(start, 45), send, true);
  await reconcileOperationalAlerts(prisma, [apiFinding, functional], at(start, 60), send, true);
  assert.equal(sent[2]?.subject, "[NIHAO-OPS] [RECUPERADO] Componente de WhatsApp");
  assert.match(sent[2]?.lines.join(" ") ?? "", /EVOLUTION_WEBHOOK/);
  assert.doesNotMatch(sent[2]?.title ?? "", /estado normal/i);
  assert.ok(sent.every((email) => email.subject.startsWith("[NIHAO-OPS]")));
});

test("los correos reintentados conservan idempotencia y el cooldown limita reenvíos", async () => {
  const { prisma } = alertHarness();
  const sent: OperationalEmail[] = [];
  let failFirstSend = true;
  const send = async (email: OperationalEmail) => { sent.push(email); if (failFirstSend) { failFirstSend = false; throw new Error("ResendUnavailable"); } };
  const finding: OperationalFinding = { fingerprint: "processing:failed", category: "PROCESSING_FAILURE", severity: "CRITICAL", summary: "Fallo persistido", details: { count: 1 } };
  const start = new Date("2026-10-20T04:00:00Z");
  await reconcileOperationalAlerts(prisma, [finding], start, send);
  await reconcileOperationalAlerts(prisma, [finding], at(start, 15), send);
  assert.equal(sent[0]?.idempotencyKey, sent[1]?.idempotencyKey);
  await reconcileOperationalAlerts(prisma, [], at(start, 30), send);
  await reconcileOperationalAlerts(prisma, [], at(start, 45), send);
  await reconcileOperationalAlerts(prisma, [finding], at(start, 60), send);
  assert.equal(sent.length, 3); // primer intento, retry idempotente y una recuperación
  await reconcileOperationalAlerts(prisma, [finding], at(start, 1_815), send);
  assert.equal(sent.length, 4); // el cooldown permite avisar una vez más tras 30 minutos
  assert.ok(sent.every((email) => email.subject.startsWith("[NIHAO-OPS]")));
});

test("una ocurrencia reabierta y suprimida por cooldown no genera una recuperación duplicada", async () => {
  const { prisma } = alertHarness();
  const sent: OperationalEmail[] = [];
  const send = async (email: OperationalEmail) => { sent.push(email); };
  const finding: OperationalFinding = { fingerprint: "processing:failed", category: "PROCESSING_FAILURE", severity: "CRITICAL", summary: "Fallo persistido", details: { count: 1 } };
  const start = new Date("2026-10-20T05:00:00Z");
  await reconcileOperationalAlerts(prisma, [finding], start, send);
  await reconcileOperationalAlerts(prisma, [], at(start, 15), send);
  await reconcileOperationalAlerts(prisma, [], at(start, 30), send);
  await reconcileOperationalAlerts(prisma, [finding], at(start, 45), send);
  await reconcileOperationalAlerts(prisma, [], at(start, 60), send);
  await reconcileOperationalAlerts(prisma, [], at(start, 75), send);
  assert.deepEqual(sent.map((email) => email.subject), ["[NIHAO-OPS] [CRITICO] Problema en WhatsApp", "[NIHAO-OPS] [RECUPERADO] Componente de WhatsApp"]);
});

test("los fallos funcionales reales conservan alerta crítica inmediata", async () => {
  const { prisma } = alertHarness();
  const sent: OperationalEmail[] = [];
  const finding: OperationalFinding = { fingerprint: "processing:failed", category: "PROCESSING_FAILURE", severity: "CRITICAL", summary: "Fallo persistido", details: { count: 1 } };
  await reconcileOperationalAlerts(prisma, [finding], new Date("2026-10-20T03:00:00Z"), async (email) => { sent.push(email); });
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.subject, "[NIHAO-OPS] [CRITICO] Problema en WhatsApp");
  assert.match(sent[0]?.lines.join(" ") ?? "", /PROCESSING_FAILURE/);
});
