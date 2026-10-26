import assert from "node:assert/strict";
import test from "node:test";
import { operationalAlertRecipients, type OperationalEmail } from "../../lib/channels/whatsapp/operational-alert-email.ts";
import { collectOperationalFindings, functionalToolErrorFinding, operationalThresholds, readEvolutionOperationalState, reconcileOperationalAlerts, type OperationalFinding } from "../../lib/channels/whatsapp/operational-monitor.ts";
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
    whatsAppBurst: {
      async aggregate(input: { where: { status?: string | { in: string[] } } }) { return input.where.status === "FAILED" ? none : { _count: 1, _min: { lastProgressAt: oldest, lastErrorAt: null } }; },
      async findMany() { return []; },
    },
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
    whatsAppBurst: {
      async aggregate(input: { where: { status?: string | { in: string[] } } }) { return input.where.status === "FAILED" ? { _count: 1, _min: { lastErrorAt: failedAt } } : none; },
      async findMany() { return []; },
    },
    whatsAppBurstReply: { async aggregate() { return none; } },
  } as unknown as PrismaClient;
  const findings = await collectOperationalFindings(prisma, { state: "open", webhookOk: true, probeComplete: true }, new Date("2026-10-11T03:00:00Z"), { noticeMs: 45_000, warningMs: 90_000, criticalMs: 180_000 });
  assert.deepEqual(findings, [{ fingerprint: "processing:failed", category: "PROCESSING_FAILURE", severity: "CRITICAL", summary: "Hay ráfagas aisladas por un fallo no recuperable", details: { count: 1, oldestAgeSeconds: 300 } }]);
});

test("el monitor alerta errores de herramienta persistentes con un incidente por ráfaga y sin mensajes privados", async () => {
  const failedAt = new Date("2026-10-11T02:55:00Z");
  const none = { _count: 0, _min: { receivedAt: null, lastProgressAt: null, lastErrorAt: null, createdAt: null } };
  const prisma = {
    whatsAppBurstMessage: { async aggregate() { return none; } },
    whatsAppQuarantinedMessage: { async aggregate() { return none; } },
    whatsAppBurst: {
      async aggregate() { return none; },
      async findMany() {
        return [{ id: "burst-1", status: "WAITING", createdAt: failedAt, processingFinishedAt: failedAt, lastErrorAt: failedAt, state: { agent: { termination: { reason: "tool_error", failedTool: "update_supplier", errorCode: "CONFLICT" } }, ingestion: { loads: [{ status: "GROUPED" }] } }, operations: [], replies: [] }];
      },
    },
    whatsAppBurstReply: { async aggregate() { return none; } },
  } as unknown as PrismaClient;
  const findings = await collectOperationalFindings(prisma, { state: "open", webhookOk: true, probeComplete: true }, new Date("2026-10-11T03:00:00Z"), { noticeMs: 45_000, warningMs: 90_000, criticalMs: 180_000 });
  assert.deepEqual(findings, [{ fingerprint: "processing:tool-error:burst-1", category: "FUNCTIONAL_TOOL_ERROR", severity: "CRITICAL", summary: "El agente terminó con un error de herramienta y conserva trabajo técnico pendiente", details: { count: 1, oldestAgeSeconds: 300, incidentId: "burst-1", failedTool: "update_supplier", errorCode: "CONFLICT", unresolvedCommercialEvidence: false } }]);
  assert.equal(JSON.stringify(findings).includes("private"), false);
});

test("UNVERIFIED_RESPONSE histórico permanece activo hasta aplicar la evidencia comercial importante", () => {
  const at = new Date("2026-10-16T03:17:32Z");
  const historical = {
    id: "672ae114-7043-42a4-b725-949105e01e22",
    status: "WAITING",
    createdAt: new Date("2026-10-16T03:16:51Z"),
    processingFinishedAt: new Date("2026-10-16T03:17:30Z"),
    lastErrorAt: null,
    state: { agent: { termination: { reason: "tool_error", failedTool: "finish_turn", errorCode: "UNVERIFIED_RESPONSE" } }, ingestion: { loads: [{ status: "PROCESSED" }] } },
    operations: [
      { status: "COMPLETED", tool: "create_supplier_draft", arguments: {}, result: {} },
      { status: "COMPLETED", tool: "create_product_draft", arguments: { evidence: [{ messageId: "message-1" }] }, result: { data: { fields: { category: "televisor", quotedPrice: null } } } },
    ],
    replies: [{ status: "DELIVERED" }],
    messages: [{ id: "message-1", envelope: { type: "AUDIO", text: null }, reading: { transcript: "Cargame un televisor. 200 dólares la unidad.", segments: [{ candidate: { extractedFields: { category: "televisor" } } }] }, commercialDecisions: [] }],
  };
  assert.equal(functionalToolErrorFinding(historical, at)?.details.unresolvedCommercialEvidence, true);
  const stored = { ...historical, operations: [historical.operations[0], { ...historical.operations[1], result: { data: { fields: { category: null, quotedPrice: { amount: 200, currency: "USD", unit: "unidad", rawText: "200 dólares la unidad" } } } } }] };
  assert.equal(functionalToolErrorFinding(stored, at), null);
  const reviewed = { ...historical, messages: [{ ...historical.messages[0], commercialDecisions: [{ action: "APPLY_NEGOTIATION", appliedFields: ["quotedPrice"] }] }] };
  assert.equal(functionalToolErrorFinding(reviewed, at), null);
  assert.equal(functionalToolErrorFinding({ ...historical, operations: [{ status: "WRITTEN" }, { status: "COMPLETED" }] }, at)?.category, "FUNCTIONAL_TOOL_ERROR");
  assert.equal(functionalToolErrorFinding({ ...historical, state: { ...historical.state, ingestion: { loads: [{ status: "NEEDS_REVIEW" }] } } }, at)?.category, "FUNCTIONAL_TOOL_ERROR");
  assert.equal(functionalToolErrorFinding({ ...historical, replies: [{ status: "DELIVERY_UNKNOWN" }] }, at)?.category, "FUNCTIONAL_TOOL_ERROR");
});

test("una conciliación funcional auditada cierra el error técnico sólo con fuentes durables y trabajo quieto", () => {
  const at = new Date("2026-10-26T12:00:00Z");
  const candidate = {
    id: "test-burst",
    status: "WAITING",
    createdAt: new Date("2026-10-26T10:00:00Z"),
    processingFinishedAt: new Date("2026-10-26T10:01:00Z"),
    lastErrorAt: null,
    state: {
      agent: {
        termination: { reason: "tool_error", revision: 1, failedTool: "finish_turn", errorCode: "UNFINISHED_OPERATION" },
        functionalRemediation: { status: "RESOLVED", resolution: "TEST_TRAFFIC", resolvedAt: "2026-10-26T11:59:00Z", release: "91e8d9f", actor: "ops:test", termination: { revision: 1, failedTool: "finish_turn", errorCode: "UNFINISHED_OPERATION" } },
      },
      ingestion: { loads: [{ status: "NEEDS_REVIEW" }] },
    },
    operations: [],
    replies: [{ status: "READ" }],
    messages: [{ id: "message-1", envelope: { type: "TEXT", text: "prueba" }, reading: null, storageStatus: "NOT_REQUIRED", commercialDecisions: [] }],
  };
  assert.equal(functionalToolErrorFinding(candidate, at), null);
  assert.equal(functionalToolErrorFinding({ ...candidate, replies: [{ status: "PENDING" }] }, at)?.category, "FUNCTIONAL_TOOL_ERROR");
  assert.equal(functionalToolErrorFinding({ ...candidate, state: { ...candidate.state, ingestion: { loads: [{ status: "GROUPED" }] } } }, at)?.category, "FUNCTIONAL_TOOL_ERROR");
  assert.equal(functionalToolErrorFinding({ ...candidate, messages: [{ ...candidate.messages[0], envelope: { type: "IMAGE" }, storageStatus: "PENDING_STORAGE" }] }, at)?.category, "FUNCTIONAL_TOOL_ERROR");
  const mismatched = structuredClone(candidate);
  mismatched.state.agent.functionalRemediation.termination.errorCode = "OTHER";
  assert.equal(functionalToolErrorFinding(mismatched, at)?.category, "FUNCTIONAL_TOOL_ERROR");
});

test("una categoría nueva, ausente o arbitraria no sostiene un error técnico", () => {
  const at = new Date("2026-10-20T10:00:00Z");
  const candidate = (category: string | null) => ({
    id: `category-${category ?? "missing"}`,
    status: "WAITING",
    createdAt: at,
    processingFinishedAt: at,
    lastErrorAt: null,
    state: { agent: { termination: { reason: "tool_error", failedTool: "finish_turn", errorCode: "UNVERIFIED_RESPONSE" } }, ingestion: { loads: [{ status: "PROCESSED" }] } },
    operations: [{ status: "COMPLETED", tool: "create_product_draft", arguments: { evidence: [{ messageId: "message-1" }] }, result: { data: { fields: { category: null } } } }],
    replies: [{ status: "DELIVERED" }],
    messages: [{ id: "message-1", envelope: { type: "TEXT", text: "Producto del proveedor" }, reading: { segments: category ? [{ candidate: { extractedFields: { category } } }] : [] }, commercialDecisions: [] }],
  });
  for (const category of [null, "hardware cuántico", "categoría libre"]) assert.equal(functionalToolErrorFinding(candidate(category), at), null);
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
    async updateMany(input: { where: { id: { in: string[] } }; data: Partial<AlertRow> }) {
      for (const [key, row] of [...rows]) if (input.where.id.in.includes(row.id)) {
        Object.assign(row, input.data);
        if (row.fingerprint !== key) { rows.delete(key); rows.set(row.fingerprint, row); }
      }
      return { count: input.where.id.in.length };
    },
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
  assert.match(sent[1]?.lines.join(" ") ?? "", /Nuevo: CRITICAL · PROCESSING_FAILURE · activo desde .* · antigüedad 0 min · sin cambios · incidente alert-1/u);
  assert.match(sent[3]?.lines.join(" ") ?? "", /Recordatorio: CRITICAL · PROCESSING_FAILURE · activo desde .* · antigüedad 29 min · sin cambios · incidente alert-1/u);
});

test("dos fallos funcionales de la misma categoría conservan identificadores e inicio propios", async () => {
  const { prisma, rows } = alertHarness();
  const sent: OperationalEmail[] = [];
  const start = new Date("2026-10-20T06:00:00Z");
  const first: OperationalFinding = { fingerprint: "processing:tool-error:burst-a", category: "FUNCTIONAL_TOOL_ERROR", severity: "CRITICAL", summary: "fallo", details: { count: 1, incidentId: "burst-a" } };
  const second: OperationalFinding = { fingerprint: "processing:tool-error:burst-b", category: "FUNCTIONAL_TOOL_ERROR", severity: "CRITICAL", summary: "fallo", details: { count: 1, incidentId: "burst-b" } };
  await reconcileOperationalAlerts(prisma, [first], start, async (email) => { sent.push(email); });
  await reconcileOperationalAlerts(prisma, [first, second], at(start, 60), async (email) => { sent.push(email); });
  assert.equal(rows.size, 2);
  assert.equal(sent.length, 2);
  assert.match(sent[1]?.lines.join(" ") ?? "", /incidente burst-b/u);
});

test("el fingerprint legado migra al incidente único sin reiniciar antigüedad ni anunciar recuperación", async () => {
  const { prisma, rows } = alertHarness();
  const firstSeenAt = new Date("2026-10-16T03:17:43Z");
  rows.set("processing:tool-error", { id: "legacy-alert", fingerprint: "processing:tool-error", category: "FUNCTIONAL_TOOL_ERROR", severity: "CRITICAL", status: "ACTIVE", details: { count: 1 }, firstSeenAt, lastSeenAt: new Date("2026-10-20T06:55:00Z"), notifiedAt: new Date("2026-10-20T06:45:00Z"), resolvedAt: null, recoveryNotifiedAt: null, notificationError: null });
  const finding: OperationalFinding = { fingerprint: "processing:tool-error:burst-a", category: "FUNCTIONAL_TOOL_ERROR", severity: "CRITICAL", summary: "fallo", details: { count: 1, incidentId: "burst-a" } };
  const sent: OperationalEmail[] = [];
  await reconcileOperationalAlerts(prisma, [finding], new Date("2026-10-20T07:00:00Z"), async (email) => { sent.push(email); });
  assert.equal(rows.has("processing:tool-error"), false);
  assert.equal(rows.get(finding.fingerprint)?.firstSeenAt, firstSeenAt);
  assert.equal(rows.get(finding.fingerprint)?.status, "ACTIVE");
  assert.equal(sent.length, 0);
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
