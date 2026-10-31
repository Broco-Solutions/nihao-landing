import type { Prisma, PrismaClient } from "../../../generated/prisma/client.ts";
import { envPositive } from "./operational-runtime.ts";
import { sendOperationalEmail, type OperationalEmail } from "./operational-alert-email.ts";
import { whatsappUatAllowedPhones } from "./uat-access.ts";
import { commercialFactsFromMessage, decisionStatus, type CommercialFacts } from "./commercial-review.ts";

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

type FunctionalToolErrorCandidate = {
  id: string;
  status: string;
  createdAt: Date;
  processingFinishedAt: Date | null;
  lastErrorAt: Date | null;
  state: unknown;
  operations: Array<{ status: string; tool?: string; arguments?: unknown; result?: unknown }>;
  replies: Array<{ status: string }>;
  messages?: Array<{ id: string; envelope: unknown; reading: unknown; storageStatus?: string; commercialDecisions: Array<{ action: string; appliedFields: unknown }> }>;
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

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function sameCommercialValue(expected: unknown, actual: unknown): boolean {
  if (expected && typeof expected === "object" && !Array.isArray(expected)) {
    const stored = object(actual);
    return Object.entries(expected as Record<string, unknown>).filter(([, value]) => value !== null && value !== "").every(([key, value]) => sameCommercialValue(value, stored[key]));
  }
  if (typeof expected === "number") return Number(actual) === expected;
  if (typeof expected === "string") return typeof actual === "string" && expected.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase() === actual.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();
  return expected === actual;
}

function requiredProductFacts(facts: CommercialFacts) {
  return (["fob", "quotedPrice", "moq", "leadTime"] as const).flatMap((key) => facts[key] ? [[key, facts[key]] as const] : []);
}

/** A technical incident cannot recover while literal commercial facts remain unapplied. */
export function hasUnresolvedCommercialEvidence(candidate: FunctionalToolErrorCandidate): boolean {
  return (candidate.messages ?? []).some((message) => {
    const envelope = object(message.envelope);
    const type = typeof envelope.type === "string" ? envelope.type : "UNKNOWN";
    const text = typeof envelope.text === "string" ? envelope.text : null;
    const facts = commercialFactsFromMessage(type, text, message.reading);
    const required = requiredProductFacts(facts);
    if (!required.length || ["resolved", "discarded"].includes(decisionStatus(facts, message.commercialDecisions))) return false;
    const appliedAutomatically = candidate.operations.some((operation) => {
      if (operation.status !== "COMPLETED" || !operation.tool?.includes("product")) return false;
      const args = object(operation.arguments);
      const evidence = Array.isArray(args.evidence) ? args.evidence : [];
      if (args.messageId !== message.id && !evidence.some((entry) => object(entry).messageId === message.id)) return false;
      const result = object(operation.result);
      const fields = object(object(result.data).fields);
      return required.every(([key, value]) => sameCommercialValue(value, fields[key]));
    });
    return !appliedAutomatically;
  });
}

export function functionalToolErrorFinding(candidate: FunctionalToolErrorCandidate, now: Date): OperationalFinding | null {
  const state = candidate.state as {
    agent?: {
      termination?: { reason?: unknown; revision?: unknown; failedTool?: unknown; errorCode?: unknown };
      functionalRemediation?: { status?: unknown; resolution?: unknown; resolvedAt?: unknown; release?: unknown; actor?: unknown; termination?: { revision?: unknown; failedTool?: unknown; errorCode?: unknown } };
    };
    ingestion?: { loads?: Array<{ status?: unknown; resolution?: unknown }> };
  } | null;
  const termination = state?.agent?.termination;
  // The same classifier can be used by audit/Web callers. A successfully
  // suspended business decision is not a technical incident.
  if (termination?.reason !== "tool_error") return null;
  const loads = Array.isArray(state?.ingestion?.loads) ? state.ingestion.loads : [];
  const deterministicFinishFailure = candidate.status === "WAITING"
    && termination?.reason === "tool_error"
    && termination.failedTool === "finish_turn"
    && ["UNFINISHED_OPERATION", "UNVERIFIED_RESPONSE"].includes(String(termination.errorCode ?? ""));
  const completedCommercialOperation = candidate.operations.some((operation) => operation.status === "COMPLETED");
  const operationsSettled = candidate.operations.every((operation) => ["COMPLETED", "CANCELLED", "EXPIRED", "STALE"].includes(operation.status));
  const loadsSettled = loads.length > 0 && loads.every((load) => load.status === "PROCESSED" || Boolean(load.resolution));
  const replyConfirmed = candidate.replies.some((reply) => CONFIRMED_DELIVERY_STATUSES.includes(reply.status));
  const replyUnresolved = candidate.replies.some((reply) => PENDING_REPLY_STATUSES.includes(reply.status));
  const unresolvedCommercialEvidence = hasUnresolvedCommercialEvidence(candidate);
  const remediation = state?.agent?.functionalRemediation;
  const remediationTermination = remediation?.termination;
  const remediationMatchesFailure = remediation?.status === "RESOLVED"
    && ["TEST_TRAFFIC", "MANUAL_REVIEW", "QUERY_RETRY_AVAILABLE"].includes(String(remediation.resolution ?? ""))
    && typeof remediation.release === "string" && remediation.release.length >= 7
    && typeof remediation.actor === "string" && remediation.actor.length > 0
    && typeof remediation.resolvedAt === "string" && Number.isFinite(Date.parse(remediation.resolvedAt))
    && remediationTermination?.revision === termination?.revision
    && remediationTermination?.failedTool === termination?.failedTool
    && remediationTermination?.errorCode === termination?.errorCode;
  const sourcesDurable = Boolean(candidate.messages?.length) && candidate.messages!.every((message) => {
    const type = String(object(message.envelope).type ?? "UNKNOWN");
    return type === "TEXT" ? message.storageStatus === undefined || message.storageStatus === "NOT_REQUIRED" : message.storageStatus === "STORED";
  });
  const loadsQuiescent = loads.every((load) => ["PROCESSED", "NEEDS_REVIEW", "FAILED"].includes(String(load.status ?? "")) || Boolean(load.resolution));
  if (remediationMatchesFailure && candidate.status === "WAITING" && operationsSettled && loadsQuiescent && sourcesDurable && replyConfirmed && !replyUnresolved) return null;
  if (deterministicFinishFailure && completedCommercialOperation && operationsSettled && loadsSettled && replyConfirmed && !replyUnresolved && !unresolvedCommercialEvidence) return null;
  const observedAt = candidate.lastErrorAt ?? candidate.processingFinishedAt ?? candidate.createdAt;
  return {
    fingerprint: `processing:tool-error:${candidate.id}`,
    category: "FUNCTIONAL_TOOL_ERROR",
    severity: "CRITICAL",
    summary: "El agente terminó con un error de herramienta y conserva trabajo técnico pendiente",
    details: {
      count: 1,
      oldestAgeSeconds: Math.round(ageMs(observedAt, now) / 1000),
      incidentId: candidate.id,
      failedTool: typeof termination?.failedTool === "string" ? termination.failedTool : "unknown",
      errorCode: typeof termination?.errorCode === "string" ? termination.errorCode : "unknown",
      unresolvedCommercialEvidence,
    },
  };
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
  const [storageWarning, storageCritical, quarantineStorageWarning, quarantineStorageCritical, stalledWarning, stalledCritical, failedBursts, toolErrorCandidates, replyWarning, replyCritical, directWarning, directCritical] = await Promise.all([
    prisma.whatsAppBurstMessage.aggregate({ where: { ...messageScope, storageStatus: "PENDING_STORAGE", receivedAt: { lte: warningCutoff } }, _count: true, _min: { receivedAt: true } }),
    prisma.whatsAppBurstMessage.aggregate({ where: { ...messageScope, storageStatus: "PENDING_STORAGE", receivedAt: { lte: criticalCutoff } }, _count: true, _min: { receivedAt: true } }),
    prisma.whatsAppQuarantinedMessage.aggregate({ where: { status: "RECEIVED", receivedAt: { lte: warningCutoff } }, _count: true, _min: { receivedAt: true } }),
    prisma.whatsAppQuarantinedMessage.aggregate({ where: { status: "RECEIVED", receivedAt: { lte: criticalCutoff } }, _count: true, _min: { receivedAt: true } }),
    prisma.whatsAppBurst.aggregate({ where: { ...activeScope, status: { in: ACTIVE_BURST_STATUSES }, lastProgressAt: { lte: warningCutoff } }, _count: true, _min: { lastProgressAt: true } }),
    prisma.whatsAppBurst.aggregate({ where: { ...activeScope, status: { in: ACTIVE_BURST_STATUSES }, lastProgressAt: { lte: criticalCutoff } }, _count: true, _min: { lastProgressAt: true } }),
    prisma.whatsAppBurst.findMany({ where: { ...activeScope, status: "FAILED" }, select: { id: true, lastErrorAt: true } }),
    prisma.whatsAppBurst.findMany({
      where: { ...activeScope, status: { in: ["FAILED", "WAITING"] }, state: { path: ["agent", "termination", "reason"], equals: "tool_error" } },
      select: {
        id: true, status: true, createdAt: true, processingFinishedAt: true, lastErrorAt: true, state: true,
        operations: { select: { status: true, tool: true, arguments: true, result: true } },
        replies: { select: { status: true } },
        messages: { select: { id: true, envelope: true, reading: true, storageStatus: true, commercialDecisions: { select: { action: true, appliedFields: true } } } },
      },
    }),
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
  // A FAILED burst whose termination is already represented by a per-burst
  // FUNCTIONAL_TOOL_ERROR must not generate a second generic incident.
  const functionalErrors = toolErrorCandidates.flatMap((candidate) => {
    const error = functionalToolErrorFinding(candidate, now);
    return error ? [[candidate.id, error] as const] : [];
  });
  const specificFailedIds = new Set(functionalErrors.map(([id]) => id));
  const genericFailed = failedBursts.filter((burst) => !specificFailedIds.has(burst.id));
  const genericFailedOldest = genericFailed.map((burst) => burst.lastErrorAt).filter((value): value is Date => Boolean(value)).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  if (genericFailed.length) {
    const failedFinding = finding("processing:failed", "PROCESSING_FAILURE", "CRITICAL", "Hay ráfagas aisladas por un fallo no recuperable", genericFailed.length, genericFailedOldest, now);
    failedFinding.details.incidentIds = genericFailed.map((burst) => burst.id).slice(0, 20).join(",");
    findings.push(failedFinding);
  }
  for (const [, functionalError] of functionalErrors) findings.push(functionalError);
  const replies = replyCritical._count ? { severity: "CRITICAL" as const, count: replyCritical._count, oldest: replyCritical._min.createdAt } : replyWarning._count ? { severity: "WARNING" as const, count: replyWarning._count, oldest: replyWarning._min.createdAt } : null;
  const direct = directCritical._count ? { severity: "CRITICAL" as const, count: directCritical._count, oldest: directCritical._min.receivedAt } : directWarning._count ? { severity: "WARNING" as const, count: directWarning._count, oldest: directWarning._min.receivedAt } : null;
  if (replies || direct) findings.push(finding("delivery:pending", "RESPONSE_DELIVERY", replies?.severity === "CRITICAL" || direct?.severity === "CRITICAL" ? "CRITICAL" : "WARNING", "Hay respuestas sin resolución de transporte", (replies?.count ?? 0) + (direct?.count ?? 0), [replies?.oldest, direct?.oldest].filter((value): value is Date => Boolean(value)).sort((a, b) => a.getTime() - b.getTime())[0] ?? null, now));
  return findings;
}

const OPERATIONAL_ALERT_COOLDOWN_MS = 30 * 60_000;
// Keep active historical failures visible, but avoid paging every 30 minutes
// for an unchanged incident that has already been reported repeatedly.
const HISTORICAL_PROCESSING_AGE_MS = 2 * 60 * 60_000;
const HISTORICAL_PROCESSING_REMINDER_MS = 24 * 60 * 60_000;
const EVOLUTION_STABLE_FAILURE_CHECKS = 3;
const STABLE_RECOVERY_CHECKS = 2;
type AlertStability = { failureChecks: number; recoveryChecks: number; lastObservation: "failure" | "recovery"; notifiedIncidentAt: number | null };
type AlertTrend = "nuevo" | "empeoró" | "mejoró" | "sin cambios";
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
function alertTrend(previous: unknown, current: OperationalFinding["details"], reopened: boolean): AlertTrend {
  if (!previous || reopened) return "nuevo";
  const priorCount = Number((previous as Record<string, unknown>).count);
  const currentCount = Number(current.count);
  if (Number.isFinite(priorCount) && Number.isFinite(currentCount)) {
    if (currentCount > priorCount) return "empeoró";
    if (currentCount < priorCount) return "mejoró";
  }
  // A generic processing alert can replace one failed burst with another
  // without changing its count. Treat that as new impact, not a stable backlog.
  const oldIds = (previous as Record<string, unknown>).incidentIds;
  const newIds = current.incidentIds;
  if (typeof oldIds === "string" && typeof newIds === "string"
      && oldIds.split(",").sort().join(",") !== newIds.split(",").sort().join(",")) return "empeoró";
  const oldError = (previous as Record<string, unknown>).errorCode;
  if (typeof oldError === "string" && typeof current.errorCode === "string" && oldError !== current.errorCode) return "empeoró";
  return "sin cambios";
}
function humanAge(milliseconds: number) {
  const minutes = Math.max(0, Math.floor(milliseconds / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${minutes % 60} min`;
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}
function incidentIdentifier(item: { id: string; details: unknown }) {
  const value = (item.details as Record<string, unknown> | null)?.incidentId;
  return typeof value === "string" && value ? value : item.id;
}
function activeAlertLine(item: { id: string; category: string; severity: string; details: unknown; firstSeenAt: Date; notifiedAt: Date | null }, now: Date) {
  const trend = (item.details as { trend?: unknown } | null)?.trend;
  const state = trend === "empeoró" || trend === "mejoró" || trend === "nuevo" ? trend : "sin cambios";
  const notification = item.notifiedAt ? "Recordatorio" : "Nuevo";
  return `${notification}: ${item.severity} · ${item.category} · activo desde ${item.firstSeenAt.toISOString()} · antigüedad ${humanAge(now.getTime() - item.firstSeenAt.getTime())} · ${state} · incidente ${incidentIdentifier(item)}.`;
}
function recoveryAlertLine(item: { id: string; category: string; details: unknown; firstSeenAt: Date; resolvedAt: Date | null }) {
  const resolvedAt = item.resolvedAt ?? new Date();
  return `Recuperado: ${item.category} · activo desde ${item.firstSeenAt.toISOString()} · duración ${humanAge(resolvedAt.getTime() - item.firstSeenAt.getTime())} · incidente ${incidentIdentifier(item)}.`;
}

export async function reconcileOperationalAlerts(prisma: PrismaClient, findings: OperationalFinding[], now = new Date(), send: (input: OperationalEmail) => Promise<void> = sendOperationalEmail, evolutionObservationComplete = true) {
  const known = await prisma.whatsAppOperationalAlert.findMany();
  const legacyToolAlert = known.find((item) => item.status === "ACTIVE" && item.fingerprint === "processing:tool-error");
  const currentToolFindings = findings.filter((item) => item.category === "FUNCTIONAL_TOOL_ERROR");
  if (legacyToolAlert && currentToolFindings.length === 1 && !known.some((item) => item.fingerprint === currentToolFindings[0].fingerprint)) {
    await prisma.whatsAppOperationalAlert.updateMany({ where: { id: { in: [legacyToolAlert.id] } }, data: { fingerprint: currentToolFindings[0].fingerprint } });
    legacyToolAlert.fingerprint = currentToolFindings[0].fingerprint;
  }
  const fingerprints = findings.map((item) => item.fingerprint);
  const existing = known.filter((item) => item.status === "ACTIVE");
  const notify: typeof existing = [];
  for (const item of findings) {
    const previous = known.find((alert) => alert.fingerprint === item.fingerprint);
    const reopened = previous?.status === "RESOLVED";
    const priorStability = alertStability(previous?.details);
    const failureChecks = previous?.status === "ACTIVE" && priorStability.lastObservation === "failure" ? priorStability.failureChecks + 1 : 1;
    const stability: AlertStability = { failureChecks, recoveryChecks: 0, lastObservation: "failure", notifiedIncidentAt: reopened ? null : priorStability.notifiedIncidentAt };
    const trend = previous?.status === "ACTIVE" && previous.severity === "WARNING" && item.severity === "CRITICAL"
      ? "empeoró" : alertTrend(previous?.details, item.details, reopened);
    const details = { ...item.details, trend };
    const alert = await prisma.whatsAppOperationalAlert.upsert({
      where: { fingerprint: item.fingerprint },
      create: { fingerprint: item.fingerprint, category: item.category, severity: item.severity, details: withAlertStability(details, stability), firstSeenAt: now, lastSeenAt: now },
      update: { category: item.category, severity: item.severity, status: "ACTIVE", details: withAlertStability(details, stability), lastSeenAt: now, resolvedAt: null, recoveryNotifiedAt: null, ...(reopened ? { firstSeenAt: now, notificationError: null } : {}) },
    });
    const requiredChecks = isEvolutionFinding(item) ? EVOLUTION_STABLE_FAILURE_CHECKS : 1;
    const oldUnchangedProcessing = previous?.status === "ACTIVE"
      && ["FUNCTIONAL_TOOL_ERROR", "PROCESSING_FAILURE"].includes(item.category)
      && trend === "sin cambios"
      && now.getTime() - alert.firstSeenAt.getTime() >= HISTORICAL_PROCESSING_AGE_MS;
    const reminderMs = oldUnchangedProcessing ? HISTORICAL_PROCESSING_REMINDER_MS : OPERATIONAL_ALERT_COOLDOWN_MS;
    // New impact is urgent even when an older, unrelated burst was just mailed.
    // Recovery detection and the ACTIVE state are never affected by this cadence.
    const cooldownElapsed = trend === "empeoró" || !alert.notifiedAt || now.getTime() - alert.notifiedAt.getTime() >= reminderMs;
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
    const email = { subject: `[NIHAO-OPS] ${notify.some((item) => item.severity === "CRITICAL") ? "[CRITICO] Problema en WhatsApp" : "[ADVERTENCIA] Problema en WhatsApp"}`, title: "Nihao detectó un problema operativo", lines: notify.map((item) => activeAlertLine(item, now)), idempotencyKey: `whatsapp-alert-${notify.map((item) => `${item.id}-${item.firstSeenAt.getTime()}-${item.notifiedAt?.getTime() ?? "first"}`).sort().join("-")}` };
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
      await send({ subject: "[NIHAO-OPS] [RECUPERADO] Componente de WhatsApp", title: "Se recuperó un componente operativo de WhatsApp", lines: pendingRecovery.map(recoveryAlertLine), idempotencyKey: `whatsapp-recovery-${pendingRecovery.map((item) => `${item.id}-${item.resolvedAt?.getTime() ?? recoveryTime.getTime()}`).sort().join("-")}` });
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
