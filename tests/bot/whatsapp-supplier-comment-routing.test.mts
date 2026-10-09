import test from "node:test";
import assert from "node:assert/strict";
import { PrismaAgentDomain } from "../../lib/channels/whatsapp/prisma-agent-domain.ts";
import { agentState, type AgentWrite } from "../../lib/channels/whatsapp/agent-contract.ts";
import { buildEvidenceGraph } from "../../lib/channels/whatsapp/evidence-grouping.ts";
import type { BurstSnapshot } from "../../lib/channels/whatsapp/burst-types.ts";

const literal = "Tambien Fabrica escritorios, esos tienen un Fob de 45 y un tardan 60 dias";
function snapshot(type: "TEXT" | "AUDIO"): BurstSnapshot {
  const state = agentState({ tripId: "trip", groups: [], question: null, controlIds: [], pendingRefs: [] });
  const s: BurstSnapshot = { id: "burst", userId: "user", instance: "test", phone: "5491112345678", revision: 1, leaseId: "lease", status: "PROCESSING", state, messages: [{ id: "m", sequence: 1, sentAt: null, envelope: { instance: "test", phone: "5491112345678", messageId: "m", type, text: type === "TEXT" ? literal : null, media: null, sentAt: null }, reading: { complete: true, transcript: type === "AUDIO" ? literal : undefined, segments: [{ id: "m:1", text: literal, candidate: { extractedFields: { fob: { amount: 45, currency: null, unit: null, rawText: "Fob de 45" }, leadTime: { days: 60, rawText: "60 dias" } }, reviewFields: [], evidence: [], rawSource: { type: "TEXT", text: literal } } }] } }] };
  state.ingestion = buildEvidenceGraph(s);
  return s;
}

for (const type of ["TEXT", "AUDIO"] as const) test(`standalone ${type} naming a product is not eagerly written into the previous supplier`, async () => {
  const s = snapshot(type);
  const writes: AgentWrite[] = [];
  const domain = new PrismaAgentDomain({} as never, {} as never);
  // Isolate the real eager-routing method from storage; the preceding factory
  // update has already made this supplier the sole focus, with no product focus.
  Object.defineProperties(domain, {
    readFocus: { value: async () => ({ supplierIds: ["supplier"], productIds: [] }) },
    currentSupplierContext: { value: async () => ({ records: [{ id: "supplier" }], association: { reason: "NEAREST_PREVIOUS_SUPPLIER" } }) },
    get: { value: async () => ({ id: "supplier", captureId: "capture", name: "HUADA TOY", tripId: "trip", companyId: "company", kind: "SUPPLIER", status: "CONFIRMED", version: "1", data: {} }) },
    write: { value: async (_snapshot: BurstSnapshot, input: AgentWrite) => { writes.push(input); return { operationId: "op", tool: input.tool, id: "supplier", captureId: "capture", tripId: "trip", companyId: "company", status: "COMPLETED", completedRevision: 1 }; } },
  });
  const receipts = await domain.persistPreviousSupplierComments(s);
  assert.deepEqual(writes, [], "product FOB and delivery must reach the conversational interpreter before any supplier write");
  assert.deepEqual(receipts, []);
  assert.equal(s.state.ingestion!.loads[0].status, "GROUPED");
});
