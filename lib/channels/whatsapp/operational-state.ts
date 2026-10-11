import type { Prisma, PrismaClient } from "../../../generated/prisma/client.ts";
import type { EvolutionWebhookEvent } from "../evolution/webhook.ts";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

function safeConnectionReason(reason: string | null) {
  if (!reason) return null;
  if (/replaced/iu.test(reason)) return "SESSION_REPLACED";
  if (/logged.?out/iu.test(reason)) return "LOGGED_OUT";
  if (/timeout/iu.test(reason)) return "TIMEOUT";
  return "CONNECTION_UPDATE";
}

/** Records only operational metadata. Message bodies and phone numbers never enter this summary. */
export async function recordWhatsAppWebhookObservation(prisma: PrismaClient, event: EvolutionWebhookEvent, now = new Date()) {
  const connection = event.kind === "connection-update" ? event.state?.toLowerCase() ?? "unknown" : undefined;
  const reason = event.kind === "connection-update" ? safeConnectionReason(event.reason) : null;
  const existing = await prisma.whatsAppOperationalState.findUnique({ where: { id: "whatsapp" }, select: { details: true, evolutionState: true } });
  const details = { ...((existing?.details as Record<string, unknown> | null) ?? {}), ...(reason ? { lastConnectionReason: reason, lastConnectionAt: now.toISOString() } : {}) };
  await prisma.whatsAppOperationalState.upsert({
    where: { id: "whatsapp" },
    create: { id: "whatsapp", checkedAt: now, lastWebhookAt: now, evolutionState: connection ?? "unknown", details: json(details) },
    update: { lastWebhookAt: now, ...(connection ? { evolutionState: connection, checkedAt: now, details: json(details) } : {}) },
  });
}
