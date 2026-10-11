import type { PrismaClient } from "../../../generated/prisma/client.ts";
import type { WhatsAppDeliveryStatus } from "../evolution/webhook.ts";

const ranks: Record<string, number> = { ACCEPTED: 1, SENT: 1, SERVER_ACK: 2, DELIVERED: 3, READ: 4, PLAYED: 5 };
const unresolved = ["PENDING", "SENDING", "DELIVERY_UNKNOWN"];

/** Predicate is evaluated by PostgreSQL in UPDATE, preventing concurrent regression. */
export function deliveryPredecessors(status: WhatsAppDeliveryStatus): string[] {
  if (status === "DELIVERY_FAILED") return [...unresolved, "ACCEPTED", "SENT", "SERVER_ACK"];
  return [...unresolved, ...Object.keys(ranks).filter(value => ranks[value] < ranks[status]), ...(ranks[status] >= 3 ? ["DELIVERY_FAILED"] : [])];
}

export async function recordDeliveryEvent(prisma: PrismaClient, instance: string, providerMessageId: string, status: WhatsAppDeliveryStatus, now = new Date()) {
  await prisma.whatsAppDeliveryEvent.upsert({
    where: { instance_providerMessageId_status: { instance, providerMessageId, status } },
    create: { instance, providerMessageId, status, receivedAt: now }, update: {},
  });
  return reconcileDeliveryEvents(prisma, instance, providerMessageId, now);
}

/** Unmatched events stay durable; run again as soon as the send ID is committed. */
export async function reconcileDeliveryEvents(prisma: PrismaClient, instance: string, providerMessageId: string, now = new Date()) {
  const events = await prisma.whatsAppDeliveryEvent.findMany({ where: { instance, providerMessageId, appliedAt: null }, orderBy: [{ receivedAt: "asc" }, { id: "asc" }] });
  let changed = false;
  for (const event of events) {
    const status = event.status as WhatsAppDeliveryStatus;
    let burst = await prisma.whatsAppBurstReply.findFirst({ where: { providerMessageId, burst: { instance } }, select: { id: true } });
    if (!burst) {
      // Older rows carried external IDs only in the conversation JSON.
      const legacy = await prisma.whatsAppBurst.findFirst({ where: { instance, state: { path: ["outboundReplies"], array_contains: [{ messageId: providerMessageId }] } }, select: { id: true, state: true } });
      const pointer = (legacy?.state as { outboundReplies?: Array<{ messageId: string; revision: number; kind?: string }> } | undefined)?.outboundReplies?.find(value => value.messageId === providerMessageId);
      if (legacy && pointer) {
        burst = await prisma.whatsAppBurstReply.findFirst({ where: { burstId: legacy.id, revision: pointer.revision, kind: pointer.kind ?? "FINAL" }, select: { id: true } });
        if (burst) await prisma.whatsAppBurstReply.updateMany({ where: { id: burst.id, providerMessageId: null }, data: { providerMessageId } });
      }
    }
    const direct = burst ? null : await prisma.whatsAppQuarantinedMessage.findFirst({ where: { instance, replyProviderMessageId: providerMessageId }, select: { id: true } });
    if (!burst && !direct) { await prisma.whatsAppDeliveryEvent.update({ where: { id: event.id }, data: { lastReconcileAt: now } }); continue; }
    const fail = status === "DELIVERY_FAILED";
    const result = burst
      ? await prisma.whatsAppBurstReply.updateMany({ where: { id: burst.id, status: { in: deliveryPredecessors(status) } }, data: { status, deliveryUpdatedAt: now, leaseUntil: null, ...(fail ? { lastErrorAt: now, lastErrorCode: "EVOLUTION_DELIVERY_FAILED" } : { lastErrorAt: null, lastErrorCode: null }) } })
      : await prisma.whatsAppQuarantinedMessage.updateMany({ where: { id: direct!.id, replyStatus: { in: deliveryPredecessors(status) } }, data: { replyStatus: status, replyDeliveryUpdatedAt: now, replyLeaseUntil: null, ...(fail ? { replyLastErrorAt: now, replyLastErrorCode: "EVOLUTION_DELIVERY_FAILED" } : { replyLastErrorAt: null, replyLastErrorCode: null }) } });
    await prisma.whatsAppDeliveryEvent.update({ where: { id: event.id }, data: { appliedAt: now, lastReconcileAt: now } });
    changed ||= result.count > 0;
  }
  return changed;
}

/** Repairs a crash between storing an external ID and reconciling its inbox. */
export async function reconcilePendingDeliveryEvents(prisma: PrismaClient) {
  const events = await prisma.whatsAppDeliveryEvent.findMany({ where: { appliedAt: null }, distinct: ["instance", "providerMessageId"], orderBy: [{ lastReconcileAt: "asc" }, { receivedAt: "asc" }], take: 100 });
  for (const event of events) await reconcileDeliveryEvents(prisma, event.instance, event.providerMessageId);
}
