import { randomUUID } from "node:crypto";
import type { PrismaClient, Prisma } from "../../generated/prisma/client.ts";
import type { AgentDomain, AgentReceipt, AgentState } from "../../lib/channels/whatsapp/agent-contract.ts";
import type { BurstSnapshot } from "../../lib/channels/whatsapp/burst-types.ts";
import { recordReceipt } from "../../lib/channels/whatsapp/agent-tools.ts";

/** Seed a proposal created before direct corrections were enabled. */
export async function legacyProposal(prisma: PrismaClient, domain: AgentDomain, snapshot: BurstSnapshot, state: AgentState, tool: "update_product" | "update_supplier", targetId: string, patch: Record<string, unknown>, evidenceIds: string[]): Promise<AgentReceipt> {
  const target = await domain.get(snapshot, tool === "update_product" ? "PRODUCT" : "SUPPLIER", targetId);
  const result: AgentReceipt = { operationId: `legacy-${randomUUID()}`, tool, id: target.id, captureId: target.captureId, tripId: target.tripId, companyId: target.companyId, name: target.name, status: "PROPOSED", data: { before: Object.fromEntries(Object.keys(patch).map(k => [k, target.data[k] ?? null])), patch, version: target.version, targetKind: target.kind } };
  const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  await prisma.whatsAppAgentOperation.create({ data: { id: result.operationId, burstId: snapshot.id, revision: snapshot.revision, tool, arguments: json({ tool, targetId: target.id, targetKind: target.kind, tripId: target.tripId, companyId: target.companyId, patch, evidence: state.agent.evidence.filter(e => evidenceIds.includes(e.id)) }), result: json(result), status: "PROPOSED", expiresAt: new Date(Date.now() + 86400000) } });
  recordReceipt(state, result);
  state.agent.pending = { type: "APPROVAL", proposalId: result.operationId, revision: snapshot.revision, options: [], text: "¿Confirmás el cambio pendiente?" };
  state.question = state.agent.pending.text;
  await prisma.whatsAppBurst.update({ where: { id: snapshot.id }, data: { state: json(state) } });
  return result;
}
