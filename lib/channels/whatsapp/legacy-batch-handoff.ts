import type { Prisma } from "../../../generated/prisma/client.ts";
import { agentState } from "./agent-contract.ts";

/** Only untouched, unassigned inboxes can change processor. Retain originals for audit/recovery. */
export async function handoffUnresolvedLegacyBatch(tx: Prisma.TransactionClient, instance: string, phone: string, userId: string) {
  // Same lock as v1 intake: no message can be appended between copying and retiring the inbox.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${instance}:${phone}`}, 0))::text`;
  const active = await tx.whatsAppBatch.findFirst({ where: { instance, phone, status: { in: ["OPEN", "READY", "PROCESSING", "NEEDS_CLARIFICATION"] } }, select: { id: true } });
  if (!active) return { blocked: false, burst: null };
  await tx.$queryRaw`SELECT id FROM "WhatsAppBatch" WHERE id = ${active.id} FOR UPDATE`;
  const batch = await tx.whatsAppBatch.findUniqueOrThrow({ where: { id: active.id }, include: { messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } } });
  const untouched = batch.userId === userId && batch.status === "OPEN" && batch.attempts === 0 && batch.tripId === null && batch.companyId === null && batch.claimedAt === null && batch.analysis === null && batch.messages.length > 0 && batch.messages.every((m) => m.status === "PENDING" && m.assignedCaptureId === null && (["TEXT", "IMAGE", "AUDIO"].includes(m.type)) && (m.type === "TEXT" || Boolean(m.storageKey && m.mimeType)));
  if (!untouched) return { blocked: true, burst: null };
  const state = agentState({ tripId: null, groups: [], question: null, controlIds: [], pendingRefs: [], legacyBatchId: batch.id });
  state.order = batch.messages.map((m) => m.id);
  const conversation = await tx.whatsAppConversation.findUnique({ where: { userId } });
  // Legacy trip choices use a different ordering; let their existing selector finish safely.
  if (conversation?.stage === "TRIP") return { blocked: true, burst: null };
  if (conversation?.stage === "COMPANY" && conversation.tripId) {
    const companies = await tx.tripCompany.findMany({ where: { tripId: conversation.tripId, active: true, members: { some: { userId } }, trip: { status: { in: ["ACTIVE", "PLANNED"] }, members: { some: { userId, role: "TRAVELER" } } } }, select: { id: true, catalogCompany: { select: { name: true } } }, orderBy: { catalogCompany: { name: "asc" } } });
    if (companies.length) {
      state.question = "¿Para qué empresa es la carga pendiente?";
      state.agent.pending = { type: "CLARIFICATION", text: state.question, revision: batch.messages.length, options: companies.map((c) => ({ id: c.id, label: c.catalogCompany.name })) };
    }
  }
  const burst = await tx.whatsAppBurst.create({ data: { id: `wah_${batch.id}`, instance, phone, userId, version: 3, revision: batch.messages.length, dueAt: new Date(), state: JSON.parse(JSON.stringify(state)) } });
  for (const [index, message] of batch.messages.entries()) {
    await tx.whatsAppBurstMessage.create({ data: {
      id: message.id, burstId: burst.id, instance, messageId: message.messageId, sequence: index + 1, receivedAt: message.createdAt,
      envelope: { instance, phone, messageId: message.messageId, type: message.type, text: message.text, media: null, sentAt: null },
      ...(message.type === "TEXT" ? {} : { reading: { segments: [], storageKey: message.storageKey, mimeType: message.mimeType, ...(message.ocrText === null ? {} : { ocr: message.ocrText }), ...(message.transcription === null ? {} : { transcript: message.transcription, model: message.transcriptionModel }) } }),
    } });
  }
  await tx.whatsAppBatch.update({ where: { id: batch.id }, data: { status: "TRANSFERRED" } });
  await tx.whatsAppConversation.updateMany({ where: { userId, stage: { in: ["TRIP", "COMPANY"] } }, data: { stage: "DONE" } });
  return { blocked: false, burst };
}
