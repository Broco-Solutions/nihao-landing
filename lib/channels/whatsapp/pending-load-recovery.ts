import type { Prisma } from "../../../generated/prisma/client.ts";
import { agentState, type AgentEvidence } from "./agent-contract.ts";
import type { BurstState } from "./burst-types.ts";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const normalized = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

/** Repair only fragments with an exact original evidence reference and no domain writes.
 * Unrelated/ambiguous pending loads stay intact. Caller holds the conversation lock.
 */
export async function recoverReferencedPendingLoad(tx: Prisma.TransactionClient, fragmentId: string): Promise<string> {
  const fragment = await tx.whatsAppBurst.findUniqueOrThrow({ where: { id: fragmentId }, include: { messages: { orderBy: { sequence: "asc" } }, operations: true } });
  if (fragment.version !== 3 || fragment.status !== "WAITING" || fragment.leaseId || fragment.operations.some(op => /^(?:create_|update_|apply_pending)/u.test(op.tool))) return fragmentId;
  const state = agentState(fragment.state as unknown as BurstState);
  const product = state.agent.pending?.products?.length === 1 ? state.agent.pending.products[0] : null;
  if (!product?.supplierQuery || state.agent.pending?.options.length || fragment.messages.some(m => (m.envelope as { type?: string }).type !== "TEXT")) return fragmentId;
  const literal = fragment.messages.map(m => (m.envelope as { text?: string }).text ?? "").join("\n");
  if (!normalized(literal).includes(normalized(product.name)) || !/es el nombre|(?:nombre|producto) (?:es|se llama)|se llama/u.test(normalized(literal))) return fragmentId;
  const evidence = [...state.agent.evidence, ...state.agent.calls.filter(c => c.name === "prepare_evidence").flatMap(c => (c.result as { evidence?: AgentEvidence[] }).evidence ?? [])];
  const parents = await tx.whatsAppBurst.findMany({ where: { id: { not: fragment.id }, userId: fragment.userId, instance: fragment.instance, phone: fragment.phone, version: 3, status: "WAITING", leaseId: null,
    messages: { some: { id: { in: evidence.map(e => e.messageId) } } } }, include: { messages: { select: { id: true } } } });
  if (parents.length !== 1) return fragmentId;
  const parent = parents[0];
  const original = agentState(parent.state as unknown as BurstState);
  if (original.agent.pending?.type !== "CLARIFICATION" || !/nombre/iu.test(original.agent.pending.text)) return fragmentId;
  if (state.operationalContext && original.operationalContext && (state.operationalContext.tripId !== original.operationalContext.tripId || state.operationalContext.companyId !== original.operationalContext.companyId)) return fragmentId;
  if (state.tripId && original.tripId && state.tripId !== original.tripId) return fragmentId;
  const loads = original.ingestion?.loads.filter(load => load.type === "PRODUCT" && !load.resourceId && !load.resolution) ?? [];
  if (loads.length !== 1 || !original.agent.receipts.some(r => r.status === "COMPLETED" && r.name && normalized(r.name) === normalized(product.supplierQuery!))) return fragmentId;
  if (original.agent.pending.products?.some(p => normalized(p.name) !== normalized(product.name))) return fragmentId;
  const offset = parent.revision;
  for (const message of fragment.messages) {
    await tx.whatsAppBurstMessage.update({ where: { id: message.id }, data: { burstId: parent.id, sequence: offset + message.sequence,
      envelope: json({ ...(message.envelope as object), recoveredFromBurstId: fragment.id, recoveredFromSequence: message.sequence }) } });
  }
  original.agent.evidence = [...new Map([...original.agent.evidence, ...state.agent.evidence].map(e => [e.id, e])).values()];
  original.agent.seenIds = [...new Set([...original.agent.seenIds, ...state.agent.seenIds])];
  original.agent.history = []; original.agent.historyRevision = -1; original.agent.terminal = undefined;
  original.agent.pending = { ...state.agent.pending!, loadId: loads[0].id, revision: offset + state.agent.pending!.revision,
    sourceMessageIds: [...parent.messages.map(m => m.id), ...fragment.messages.map(m => m.id)] };
  original.question = state.question;
  original.outboundReplies = [...(original.outboundReplies ?? []), ...(state.outboundReplies ?? []).map(reply => ({ ...reply, revision: offset + reply.revision }))];
  await tx.whatsAppBurst.update({ where: { id: parent.id }, data: { revision: offset + fragment.revision, state: json(original) } });
  await tx.whatsAppBurst.update({ where: { id: fragment.id }, data: { status: "DONE", state: json({ ...state, recoveredIntoBurstId: parent.id }) } });
  return parent.id;
}
