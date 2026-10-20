import type { Prisma, PrismaClient } from "../../../generated/prisma/client.ts";
import { envPositive } from "./operational-runtime.ts";
import { sendOperationalEmail, type OperationalEmail } from "./operational-alert-email.ts";
import { whatsappUatAllowedPhones } from "./uat-access.ts";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const ACTIVE_BURST_STATUSES = ["OPEN", "PROCESSING", "COMMITTING"];
const PENDING_REPLY_STATUSES = ["PENDING", "SENDING", "DELIVERY_FAILED", "DELIVERY_UNKNOWN"];
const CONFIRMED_DELIVERY_STATUSES = ["DELIVERED", "READ", "PLAYED"];

export type OperationalThresholds = { noticeMs: number; warningMs: number; criticalMs: number };
export type OperationalFinding = {
  fingerprint: string;
  category: string;
  severity: "WARNING" | "CRITICAL";
  summary: string;
  details: Record<string, string | number | boolean | null>;
};

export type EvolutionOperationalState = {
  state: string;
  webhookOk: boolean | null;
  probeComplete: boolean;
  probeError?: string;
};

export function operationalThresholds(environment: Record<string, string | undefined> = process.env): OperationalThresholds {
  const noticeMs = Number(environment.WHATSAPP_PROCESSING_NOTICE_MS ?? 45_000);
  const warningMs = Number(environment.WHATSAPP_OPERATIONAL_WARNING_MS ?? 90_000);
  const criticalMs = Number(environment.WHATSAPP_OPERATIONAL_CRITICAL_MS ?? 180_000);
  if (![noticeMs, warningMs, criticalMs].every((value) => Number.isFinite(value) && value > 0) || !(noticeMs < warningMs && warningMs < criticalMs)) throw new Error("InvalidWhatsAppOperationalThresholds");
  return { noticeMs, warningMs, criticalMs };
}

function ageMs(date: Date | null | undefined, now: Date) {
  return date ? Math.max(0, now.getTime() - date.getTime()) : 0;
}

function finding(fingerprint: string, category: string, severity: "WARNING" | "CRITICAL", summary: string, count: number, oldest: Date | null, now: Date): OperationalFinding {
  return { fingerprint, category, severity, summary, details: { count, oldestAgeSeconds: Math.round(ageMs(oldest, now) / 1000) } };
}

export async function readEvolutionOperationalState(request: typeof fetch = fetch) {
  const apiUrl = process.env.EVOLUTION_API_URL?.trim();
  const apiKey = process.env.EVOLUTION_API_KEY?.trim();
  const instance = process.env.EVOLUTION_INSTANCE?.trim();
  if (!apiUrl || !apiKey || !instance) return { state: "unknown", webhookOk: null, probeComplete: false, probeError: "configuration_missing" };
  const headers = { apikey: apiKey };
  const base = apiUrl.replace(/\/+$/u, "");
  const [connectionResult, webhookResult] = await Promise.allSettled([
    request(`${base}/instance/connectionState/${encodeURIComponent(instance)}`, { headers, signal: AbortSignal.timeout(8_000) }),
    request(`${base}/webhook/find/${encodeURIComponent(instance)}`, { headers, signal: AbortSignal.timeout(8_000) }),
  ]);
  const connection = connectionResult.status === "fulfilled" ? connectionResult.value : null;
  const webhook = webhookResult.status === "fulfilled" ? webhookResult.value : null;
  const errors = [connection, webhook].flatMap((response, index) => {
    if (response?.ok) return [];
    if (response) return [`http_${response.status}`];
    const result = index === 0 ? connectionResult : webhookResult;
    return [result.status === "rejected" ? (result.reason instanceof Error ? result.reason.name : "request_failed") : "request_failed"];
  });
  let state = "unknown";
  if (connection?.ok) {
    const connectionBody = await connection.json() as { instance?: { state?: unknown }; state?: unknown };
    state = String(connectionBody.instance?.state ?? connectionBody.state ?? "unknown").toLowerCase();
  }
  let webhookOk: boolean | null = null;
  if (webhook?.ok) {
    const webhookBody = await webhook.json() as { enabled?: unknown; url?: unknown; headers?: Record<string, unknown>; events?: unknown };
    const expectedHost = process.env.NIHAO_PUBLIC_API_HOST?.trim() || "api.nihaonegocios.com";
    let webhookHost = "";
    try { webhookHost = new URL(String(webhookBody.url ?? "")).host; } catch {}
    const events = Array.isArray(webhookBody.events) ? webhookBody.events.map(String) : [];
    webhookOk = webhookBody.enabled === true && webhookHost === expectedHost && typeof webhookBody.headers?.["x-nihao-webhook-secret"] === "string" && events.includes("MESSAGES_UPSERT") && events.includes("MESSAGES_UPDATE");
  }
  const probeError = errors.length ? [...new Set(errors)].join(",") : undefined;
  return { state, webhookOk, probeComplete: !probeError, ...(probeError ? { probeError } : {}) };
}

export async function collectOperationalFindings(prisma: PrismaClient, evolution: EvolutionOperationalState, now = new Date(), thresholds = operationalThresholds()) {
  const warningCutoff = new Date(now.getTime() - thresholds.warningMs);
  const criticalCutoff = new Date(now.getTime() - thresholds.criticalMs);
  const allowed = whatsappUatAllowedPhones();
  const phones = allowed ? [...allowed] : null;
  const activeScope = phones ? { phone: { in: phones } } : {};
  const messageScope = phones ? { burst: { is: { phone: { in: phones } } } } : {};
  const replyScope = phones ? { burst: { is: { phone: { in: phones } } } } : {};
  const [storageWarning, storageCritical, quarantineStorageWarning, quarantineStorageCritical, stalledWarning, stalledCritical, failedBursts, toolErrorBursts, replyWarning, replyCritical, directWarning, directCritical] = await Promise.all([
    prisma.whatsAppBurstMessage.aggregate({ where: { ...messageScope, storageStatus: "PENDING_STORAGE", receivedAt: { lte: warningCutoff } }, _count: true, _min: { receivedAt: true } }),
    prisma.whatsAppBurstMessage.aggregate({ where: { ...messageScope, storageStatus: "PENDING_STORAGE", receivedAt: { lte: criticalCutoff } }, _count: true, _min: { receivedAt: true } }),
    prisma.whatsAppQuarantinedMessage.aggregate({ where: { status: "RECEIVED", receivedAt: { lte: warningCutoff } }, _count: true, _min: { receivedAt: true } }),
    prisma.whatsAppQuarantinedMessage.aggregate({ where: { status: "RECEIVED", receivedAt: { lte: criticalCutoff } }, _count: true, _min: { receivedAt: true } }),
    prisma.whatsAppBurst.aggregate({ where: { ...activeScope, status: { in: ACTIVE_BURST_STATUSES }, lastProgressAt: { lte: warningCutoff } }, _count: true, _min: { lastProgressAt: true } }),
    prisma.whatsAppBurst.aggregate({ where: { ...activeScope, status: { in: ACTIVE_BURST_STATUSES }, lastProgressAt: { lte: criticalCutoff } }, _count: true, _min: { lastProgressAt: true } }),
    prisma.whatsAppBurst.aggregate({ where: { ...activeScope, status: "FAILED" }, _count: true, _min: { lastErrorAt: true } }),
    prisma.whatsAppBurst.aggregate({ where: { ...activeScope, status: { in: ["FAILED", "WAITING"] }, state: { path: ["agent", "termination", "reason"], equals: "tool_error" } }, _count: true, _min: { lastErrorAt: true } }),
    prisma.whatsAppBurstReply.aggregate({ where: { ...replyScope, status: { in: PENDING_REPLY_STATUSES }, createdAt: { lte: warningCutoff } }, _count: true, _min: { createdAt: true } }),
    prisma.whatsAppBurstReply.aggregate({ where: { ...replyScope, status: { in: PENDING_REPLY_STATUSES }, createdAt: { lte: criticalCutoff } }, _count: true, _min: { createdAt: true } }),
    prisma.whatsAppQuarantinedMessage.aggregate({ where: { replyStatus: { in: PENDING_REPLY_STATUSES }, receivedAt: { lte: warningCutoff } }, _count: true, _min: { receivedAt: true } }),
    prisma.whatsAppQuarantinedMessage.aggregate({ where: { replyStatus: { in: PENDING_REPLY_STATUSES }, receivedAt: { lte: criticalCutoff } }, _count: true, _min: { receivedAt: true } }),
  ]);
  const findings: OperationalFinding[] = [];
  if (evolution.probeError) findings.push({ fingerprint: "evolution:api-unreachable", category: "EVOLUTION_API_UNREACHABLE", severity: "CRITICAL", summary: "No se pudo consultar Evolution", details: { error: evolution.probeError } });
  if (evolution.state !== "unknown" && evolution.state !== "open") findings.push({ fingerprint: "evolution:not-open", category: "EVOLUTION_CONNECTION", severity: "CRITICAL", summary: "Evolution no está conectado", details: { state: evolution.state } });
  if (evolution.webhookOk === false) findings.push({ fingerprint: "evolution:webhook-invalid", category: "EVOLUTION_WEBHOOK", severity: "CRITICAL", summary: "El webhook de Evolution no coincide con la configuración operativa esperada", details: {} });
  const storageCriticalCount = storageCritical._count + quarantineStorageCritical._count;
  const storageWarningCount = storageWarning._count + quarantineStorageWarning._count;
  const storageOldest = [storageCritical._min.receivedAt, quarantineStorageCritical._min.receivedAt, storageWarning._min.receivedAt, quarantineStorageWarning._min.receivedAt].filter((value): value is Date => Boolean(value)).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  if (storageCriticalCount || storageWarningCount) findings.push(finding("storage:pending", "PENDING_STORAGE", storageCriticalCount ? "CRITICAL" : "WARNING", "Hay originales multimedia pendientes de almacenamiento durable", storageCriticalCount || storageWarningCount, storageOldest, now));
  const stalled = stalledCritical._count ? { severity: "CRITICAL" as const, result: stalledCritical } : stalledWarning._count ? { severity: "WARNING" as const, result: stalledWarning } : null;
  if (stalled) findings.push(finding("worker:stalled", "WORKER_STALLED", stalled.severity, "Hay ráfagas sin progreso", stalled.result._count, stalled.result._min.lastProgressAt, now));
  if (failedBursts._count) findings.push(finding("processing:failed", "PROCESSING_FAILURE", "CRITICAL", "Hay ráfagas aisladas por un fallo no recuperable", failedBursts._count, failedBursts._min.lastErrorAt, now));
  if (toolErrorBursts._count) findings.push(finding("processing:tool-error", "FUNCTIONAL_TOOL_ERROR", "CRITICAL", "El agente terminó con errores de herramientas y hay evidencia pendiente", toolErrorBursts._count, toolErrorBursts._min.lastErrorAt, now));
  const replies = replyCritical._count ? { severity: "CRITICAL" as const, count: replyCritical._count, oldest: replyCritical._min.createdAt } : replyWarning._count ? { severity: "WARNING" as const, count: replyWarning._count, oldest: replyWarning._min.createdAt } : null;
  const direct = directCritical._count ? { severity: "CRITICAL" as const, count: directCritical._count, oldest: directCritical._min.receivedAt } : directWarning._count ? { severity: "WARNING" as const, count: directWarning._count, oldest: directWarning._min.receivedAt } : null;
  if (replies || direct) findings.push(finding("delivery:pending", "RESPONSE_DELIVERY", replies?.severity === "CRITICAL" || direct?.severity === "CRITICAL" ? "CRITICAL" : "WARNING", "Hay respuestas sin resolución de transporte", (replies?.count ?? 0) + (direct?.count ?? 0), [replies?.oldest, direct?.oldest].filter((value): value is Date => Boolean(value)).sort((a, b) => a.getTime() - b.getTime())[0] ?? null, now));
  return findings;
}

const OPERATIONAL_ALERT_COOLDOWN_MS = 30 * 60_000;
const EVOLUTION_STABLE_FAILURE_CHECKS = 3;
const STABLE_RECOVERY_CHECKS = 2;
type AlertStability = { failureChecks: number; recoveryChecks: number; lastObservation: "failure" | "recovery"; notifiedIncidentAt: number | null };
function alertStability(details: unknown): AlertStability {
  const stored = (details as { _monitorStability?: Partial<AlertStability> } | null)?._monitorStability;
  return {
    failureChecks: typeof stored?.failureChecks === "number" ? stored.failureChecks : 0,
    recoveryChecks: typeof stored?.recoveryChecks === "number" ? stored.recoveryChecks : 0,
    lastObservation: stored?.lastObservation === "recovery" ? "recovery" : "failure",
    notifiedIncidentAt: typeof stored?.notifiedIncidentAt === "number" ? stored.notifiedIncidentAt : null,
  };
}
function withAlertStability(details: Record<string, unknown>, stability: AlertStability) {
  return json({ ...details, _monitorStability: stability });
}
function isEvolutionFinding(item: { category: string }) { return item.category.startsWith("EVOLUTION_"); }

export async function reconcileOperationalAlerts(prisma: PrismaClient, findings: OperationalFinding[], now = new Date(), send: (input: OperationalEmail) => Promise<void> = sendOperationalEmail, evolutionObservationComplete = true) {
  const fingerprints = findings.map((item) => item.fingerprint);
  const known = await prisma.whatsAppOperationalAlert.findMany();
  const existing = known.filter((item) => item.status === "ACTIVE");
  const notify: typeof existing = [];
  for (const item of findings) {
    const previous = known.find((alert) => alert.fingerprint === item.fingerprint);
    const reopened = previous?.status === "RESOLVED";
    const priorStability = alertStability(previous?.details);
    const failureChecks = previous?.status === "ACTIVE" && priorStability.lastObservation === "failure" ? priorStability.failureChecks + 1 : 1;
    const stability: AlertStability = { failureChecks, recoveryChecks: 0, lastObservation: "failure", notifiedIncidentAt: reopened ? null : priorStability.notifiedIncidentAt };
    const alert = await prisma.whatsAppOperationalAlert.upsert({
      where: { fingerprint: item.fingerprint },
      create: { fingerprint: item.fingerprint, category: item.category, severity: item.severity, details: withAlertStability(item.details, stability), firstSeenAt: now, lastSeenAt: now },
      update: { category: item.category, severity: item.severity, status: "ACTIVE", details: withAlertStability(item.details, stability), lastSeenAt: now, resolvedAt: null, recoveryNotifiedAt: null, ...(reopened ? { firstSeenAt: now, notificationError: null } : {}) },
    });
    const requiredChecks = isEvolutionFinding(item) ? EVOLUTION_STABLE_FAILURE_CHECKS : 1;
    const cooldownElapsed = !alert.notifiedAt || now.getTime() - alert.notifiedAt.getTime() >= OPERATIONAL_ALERT_COOLDOWN_MS;
    if (failureChecks >= requiredChecks && cooldownElapsed) notify.push(alert);
  }
  const recovered: typeof existing = [];
  for (const item of existing.filter((alert) => !fingerprints.includes(alert.fingerprint))) {
    if (isEvolutionFinding(item) && !evolutionObservationComplete) continue;
    const previousStability = alertStability(item.details);
    const recoveryChecks = previousStability.lastObservation === "recovery" ? previousStability.recoveryChecks + 1 : 1;
    const stability: AlertStability = { ...previousStability, failureChecks: 0, recoveryChecks, lastObservation: "recovery" };
    if (recoveryChecks >= STABLE_RECOVERY_CHECKS) recovered.push({ ...item, details: { ...(item.details as Record<string, unknown>), _monitorStability: stability }, resolvedAt: now } as typeof item);
    else await prisma.whatsAppOperationalAlert.updateMany({ where: { id: { in: [item.id] } }, data: { details: withAlertStability((item.details as Record<string, unknown>) ?? {}, stability) } });
  }
  if (notify.length) {
    const email = { subject: `[NIHAO-OPS] ${notify.some((item) => item.severity === "CRITICAL") ? "[CRITICO] Problema en WhatsApp" : "[ADVERTENCIA] Problema en WhatsApp"}`, title: "Nihao detectó un problema operativo", lines: notify.map((item) => `${item.severity}: ${item.category}.`), idempotencyKey: `whatsapp-alert-${notify.map((item) => `${item.id}-${item.firstSeenAt.getTime()}-${item.notifiedAt?.getTime() ?? "first"}`).sort().join("-")}` };
    try {
      await send(email);
      for (const item of notify) {
        const stability = { ...alertStability(item.details), notifiedIncidentAt: item.firstSeenAt.getTime() };
        await prisma.whatsAppOperationalAlert.updateMany({ where: { id: { in: [item.id] } }, data: { notifiedAt: now, notificationError: null, details: withAlertStability((item.details as Record<string, unknown>) ?? {}, stability) } });
      }
    } catch (error) {
      await prisma.whatsAppOperationalAlert.updateMany({ where: { id: { in: notify.map((item) => item.id) } }, data: { notificationError: error instanceof Error ? error.name : "UnknownError" } });
    }
  }
  if (recovered.length) {
    for (const item of recovered) {
      await prisma.whatsAppOperationalAlert.updateMany({ where: { id: { in: [item.id] } }, data: { status: "RESOLVED", resolvedAt: now, details: item.details as Prisma.InputJsonValue } });
    }
  }
  const wasNotifiedForThisIncident = (item: (typeof existing)[number]) => {
    if (!item.notifiedAt) return false;
    const stored = (item.details as { _monitorStability?: { notifiedIncidentAt?: unknown } } | null)?._monitorStability;
    return stored?.notifiedIncidentAt === undefined || stored.notifiedIncidentAt === item.firstSeenAt.getTime();
  };
  const pendingRecoveryIds = new Set(recovered.filter((item) => wasNotifiedForThisIncident(item) && !item.recoveryNotifiedAt).map((item) => item.id));
  const pendingRecovery = [...recovered.filter((item) => wasNotifiedForThisIncident(item) && !item.recoveryNotifiedAt), ...known.filter((item) => item.status === "RESOLVED" && wasNotifiedForThisIncident(item) && !item.recoveryNotifiedAt && !pendingRecoveryIds.has(item.id))];
  if (pendingRecovery.length) {
    const recoveryTime = pendingRecovery.map((item) => item.resolvedAt).filter((value): value is Date => Boolean(value)).sort((a, b) => a.getTime() - b.getTime())[0] ?? now;
    try {
      await send({ subject: "[NIHAO-OPS] [RECUPERADO] Componente de WhatsApp", title: "Se recuperó un componente operativo de WhatsApp", lines: pendingRecovery.map((item) => `Recuperado: ${item.category}.`), idempotencyKey: `whatsapp-recovery-${pendingRecovery.map((item) => `${item.id}-${item.resolvedAt?.getTime() ?? recoveryTime.getTime()}`).sort().join("-")}` });
      await prisma.whatsAppOperationalAlert.updateMany({ where: { id: { in: pendingRecovery.map((item) => item.id) } }, data: { recoveryNotifiedAt: now, notificationError: null } });
    } catch (error) {
      await prisma.whatsAppOperationalAlert.updateMany({ where: { id: { in: pendingRecovery.map((item) => item.id) } }, data: { notificationError: error instanceof Error ? error.name : "UnknownError" } });
    }
  }
  return { active: findings.length, notified: notify.length, recovered: recovered.length };
}

export async function runOperationalMonitor(prisma: PrismaClient, request: typeof fetch = fetch, now = new Date(), send: (input: OperationalEmail) => Promise<void> = sendOperationalEmail) {
  const thresholds = operationalThresholds();
  const evolution = await readEvolutionOperationalState(request).catch((error) => ({ state: "unknown", webhookOk: null, probeComplete: false, probeError: error instanceof Error ? error.name : "request_failed" }));
  const findings = await collectOperationalFindings(prisma, evolution, now, thresholds);
  const alertResult = await reconcileOperationalAlerts(prisma, findings, now, send, Boolean(evolution.probeComplete));
  const allowed = whatsappUatAllowedPhones();
  const phones = allowed ? [...allowed] : null;
  const activeScope = phones ? { phone: { in: phones } } : {};
  const messageScope = phones ? { burst: { is: { phone: { in: phones } } } } : {};
  const replyScope = phones ? { burst: { is: { phone: { in: phones } } } } : {};
  const [lastMessage, lastQuarantinedMessage, lastAccepted, lastDirectAccepted, lastDelivered, lastDirectDelivered, oldestBurst, oldestQuarantinedStorage, oldestReply, oldestDirectReply, pendingBursts, pendingBurstStorage, pendingQuarantineStorage, pendingReplies, pendingDirectReplies, existingState] = await Promise.all([
    prisma.whatsAppBurstMessage.aggregate({ _max: { receivedAt: true } }),
    prisma.whatsAppQuarantinedMessage.aggregate({ _max: { receivedAt: true } }),
    prisma.whatsAppBurstReply.aggregate({ where: { ...replyScope, acceptedAt: { not: null } }, _max: { acceptedAt: true } }),
    prisma.whatsAppQuarantinedMessage.aggregate({ where: { replyAcceptedAt: { not: null } }, _max: { replyAcceptedAt: true } }),
    prisma.whatsAppBurstReply.aggregate({ where: { ...replyScope, status: { in: CONFIRMED_DELIVERY_STATUSES } }, _max: { deliveryUpdatedAt: true } }),
    prisma.whatsAppQuarantinedMessage.aggregate({ where: { replyStatus: { in: CONFIRMED_DELIVERY_STATUSES } }, _max: { replyDeliveryUpdatedAt: true } }),
    prisma.whatsAppBurst.aggregate({ where: { ...activeScope, status: { in: ACTIVE_BURST_STATUSES } }, _min: { createdAt: true } }),
    prisma.whatsAppQuarantinedMessage.aggregate({ where: { status: "RECEIVED" }, _min: { receivedAt: true } }),
    prisma.whatsAppBurstReply.aggregate({ where: { ...replyScope, status: { in: PENDING_REPLY_STATUSES } }, _min: { createdAt: true } }),
    prisma.whatsAppQuarantinedMessage.aggregate({ where: { replyStatus: { in: PENDING_REPLY_STATUSES } }, _min: { receivedAt: true } }),
    prisma.whatsAppBurst.count({ where: { ...activeScope, status: { in: ACTIVE_BURST_STATUSES } } }),
    prisma.whatsAppBurstMessage.count({ where: { ...messageScope, storageStatus: "PENDING_STORAGE" } }),
    prisma.whatsAppQuarantinedMessage.count({ where: { status: "RECEIVED" } }),
    prisma.whatsAppBurstReply.count({ where: { ...replyScope, status: { in: PENDING_REPLY_STATUSES } } }),
    prisma.whatsAppQuarantinedMessage.count({ where: { replyStatus: { in: PENDING_REPLY_STATUSES } } }),
    prisma.whatsAppOperationalState.findUnique({ where: { id: "whatsapp" }, select: { lastWebhookAt: true, details: true } }),
  ]);
  const pendingStorage = pendingBurstStorage + pendingQuarantineStorage;
  const pendingDelivery = pendingReplies + pendingDirectReplies;
  const mostRecent = (...values: Array<Date | null | undefined>) => values.filter((value): value is Date => Boolean(value)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const oldest = (...values: Array<Date | null | undefined>) => values.filter((value): value is Date => Boolean(value)).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const oldestPendingAt = oldest(oldestBurst._min.createdAt, oldestQuarantinedStorage._min.receivedAt, oldestReply._min.createdAt, oldestDirectReply._min.receivedAt);
  const details = { ...((existingState?.details as Record<string, unknown> | null) ?? {}), pendingBursts, pendingStorage, pendingBurstStorage, pendingQuarantineStorage, pendingReplies: pendingDelivery, pendingBurstReplies: pendingReplies, pendingDirectReplies, thresholds, evolutionProbeError: evolution.probeError ?? null };
  await prisma.whatsAppOperationalState.upsert({
    where: { id: "whatsapp" },
    create: { id: "whatsapp", checkedAt: now, evolutionState: evolution.state, lastMessageReceivedAt: mostRecent(lastMessage._max.receivedAt, lastQuarantinedMessage._max.receivedAt), lastReplyAcceptedAt: mostRecent(lastAccepted._max.acceptedAt, lastDirectAccepted._max.replyAcceptedAt), lastDeliveryConfirmedAt: mostRecent(lastDelivered._max.deliveryUpdatedAt, lastDirectDelivered._max.replyDeliveryUpdatedAt), pendingCount: pendingBursts + pendingStorage + pendingDelivery, oldestPendingAt, activeAlertCount: findings.length, details: json(details) },
    update: { checkedAt: now, evolutionState: evolution.state, lastMessageReceivedAt: mostRecent(lastMessage._max.receivedAt, lastQuarantinedMessage._max.receivedAt), lastReplyAcceptedAt: mostRecent(lastAccepted._max.acceptedAt, lastDirectAccepted._max.replyAcceptedAt), lastDeliveryConfirmedAt: mostRecent(lastDelivered._max.deliveryUpdatedAt, lastDirectDelivered._max.replyDeliveryUpdatedAt), pendingCount: pendingBursts + pendingStorage + pendingDelivery, oldestPendingAt, activeAlertCount: findings.length, details: json(details) },
  });
  return { evolution, findings, alerts: alertResult };
}

export const monitorIntervalMs = () => envPositive("WHATSAPP_MONITOR_INTERVAL_MS", 15_000);
