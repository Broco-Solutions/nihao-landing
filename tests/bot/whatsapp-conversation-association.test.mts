import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createAgentEnvironment, localAgentDatabase } from "../../evals/whatsapp-agent/environment.ts";
import { AgentTools } from "../../lib/channels/whatsapp/agent-tools.ts";
import { agentState, type AgentReceipt } from "../../lib/channels/whatsapp/agent-contract.ts";
import type { BurstSnapshot, BurstMessage } from "../../lib/channels/whatsapp/burst-types.ts";
import type { ExtractionCandidate } from "../../lib/bot/types.ts";

function message(sequence: number, text: string, fields: ExtractionCandidate["extractedFields"]): BurstMessage {
  const id = randomUUID();
  return { id, sequence, sentAt: null, envelope: { instance: "test", phone: "123", messageId: id, type: "TEXT", text, media: null, sentAt: null }, reading: { complete: true, segments: [{ id: `${id}:1`, text, candidate: { rawSource: { type: "TEXT", text }, extractedFields: fields, evidence: [], reviewFields: [] } }] } };
}

test("PostgreSQL: dos proveedores, ordinal, fallback y producto con proveedor incompleto", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async (t) => {
  const prisma = localAgentDatabase();
  for (const [text, expected] of [["El primer proveedor nos vende Taladro FOB USD 7", 0], ["Este proveedor nos vende Taladro FOB USD 7", 1], ["Taladro FOB USD 7", 1]] as const) await t.test(text, async () => {
    const env = await createAgentEnvironment(prisma, { trips: [{ id: "trip", name: "China", companies: [{ id: "company", name: "Broco" }], suppliers: [] }] });
    try {
      const messages = [message(1, "Cargá nuevo proveedor Alfa Tools", { companyName: "Alfa Tools" }), message(2, "Cargá nuevo proveedor Beta Tools", { companyName: "Beta Tools" }), message(3, text, { fob: { amount: 7, currency: "USD", unit: null, rawText: "FOB USD 7" } })];
      const snapshot: BurstSnapshot = { id: randomUUID(), userId: env.userId, instance: "test", phone: "5491112345678", status: "PROCESSING", revision: 3, leaseId: "lease", state: { tripId: null, groups: [], question: null, pendingRefs: [], controlIds: [] }, messages };
      await env.persist(snapshot); const state = agentState(snapshot.state); snapshot.state = state;
      const tools = new AgentTools({ domain: env.domain, catalog: env.catalog, extraction: { async extractReading(text) { return { rawSource: { type: "TEXT", text }, extractedFields: {}, evidence: [], reviewFields: [] }; } }, async checkpoint(state) { snapshot.state = state; await env.save(snapshot, state); } });
      await tools.execute("get_context", {}, snapshot, state);
      const prepare = async (m: BurstMessage) => { const result = await tools.execute("prepare_evidence", { sources: [{ messageId: m.id, role: "FACTS", quote: null }] }, snapshot, state) as { evidence: { id: string }[] }; return result.evidence.map((e) => e.id); };
      const suppliers: AgentReceipt[] = [];
      for (const m of messages.slice(0, 2)) suppliers.push(await tools.execute("create_supplier_draft", { tripId: env.id("trip"), companyId: env.id("company"), evidenceIds: await prepare(m) }, snapshot, state) as AgentReceipt);
      const resolved = await tools.execute("resolve_recent_reference", { kind: "SUPPLIER" }, snapshot, state) as { records: { id: string }[] };
      assert.equal(resolved.records[0].id, suppliers[expected].id);
      const evidenceIds = await prepare(messages[2]);
      await assert.rejects(() => tools.execute("create_product_draft", { supplierId: suppliers[1 - expected].id, name: "Taladro", evidenceIds }, snapshot, state), /otro proveedor/);
      const product = await tools.execute("create_product_draft", { supplierId: suppliers[expected].id, name: "Taladro", evidenceIds }, snapshot, state) as AgentReceipt;
      assert.equal(product.resourceStatus, "DRAFT");
      assert.equal(product.confirmationReason, undefined);
      const stored = await prisma.supplierProduct.findUniqueOrThrow({ where: { id: product.id } });
      assert.equal(stored.captureId, suppliers[expected].captureId);
      assert.equal(stored.supplierId, null);
      assert.equal(await prisma.supplier.count({ where: { tripId: env.id("trip") } }), 0);
      assert.equal(await prisma.supplierProduct.count({ where: { capture: { tripId: env.id("trip") } } }), 1);
      await prisma.whatsAppBurst.update({ where: { id: snapshot.id }, data: { status: "DONE" } });
      const following: BurstSnapshot = { ...snapshot, id: randomUUID(), revision: 1, messages: [message(1, "Martillo FOB USD 3", {})], state: { tripId: null, groups: [], question: null, pendingRefs: [], controlIds: [], operationalContext: { tripId: env.id("trip"), companyId: env.id("company") } } };
      await env.persist(following);
      assert.equal((await env.domain.resolveSupplierReference(following))[0].id, suppliers[expected].id, "el último producto transmite su proveedor a la conversación siguiente");
      following.messages[0].envelope.text = "El primer proveedor nos vende Martillo FOB USD 3";
      following.messages[0].reading!.segments[0].text = following.messages[0].envelope.text;
      assert.equal((await env.domain.resolveSupplierReference(following))[0].id, suppliers[0].id, "el ordinal histórico mantiene el orden original");
    } finally { await env.cleanup(); }
  });
  await prisma.$disconnect();
});
