import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createAgentEnvironment, localAgentDatabase } from "../../evals/whatsapp-agent/environment.ts";
import { PRODUCT_CATALOG } from "../../evals/whatsapp-products/cases.ts";
import { AgentTools } from "../../lib/channels/whatsapp/agent-tools.ts";
import { AgentCheckpoint, agentState } from "../../lib/channels/whatsapp/agent-contract.ts";
import type { BurstSnapshot } from "../../lib/channels/whatsapp/burst-types.ts";
import { WhatsAppAgentOrchestrator } from "../../lib/channels/whatsapp/agent-orchestrator.ts";
import { PrismaBurstStore } from "../../lib/channels/whatsapp/prisma-burst-store.ts";
import { buildEvidenceGraph } from "../../lib/channels/whatsapp/evidence-grouping.ts";
import { listTripWhatsAppEvidence } from "../../lib/channels/whatsapp/web-evidence.ts";
import { processingOutcome } from "../../lib/channels/whatsapp/processing-outcome.ts";

// Synthetic causal reconstruction of 19fec7aa (27 October): one text creates
// a supplier and preserves product terms without identifying a product.
test("incident 27/10: same-source supplier terms are durable and preservation is idempotent", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async () => {
  const prisma = localAgentDatabase();
  const env = await createAgentEnvironment(prisma, PRODUCT_CATALOG);
  const text = "Proveedor Telar Azul. Vende jeans. MOQ 300 unidades. Son fabricantes.";
  const messageId = randomUUID();
  const snapshot: BurstSnapshot = {
    id: randomUUID(), userId: env.userId, instance: "synthetic", phone: "5491112345678", version: 3,
    revision: 1, leaseId: "lease", status: "PROCESSING",
    state: { tripId: env.id("trip-china"), groups: [], question: null, controlIds: [], pendingRefs: [] },
    messages: [{ id: messageId, sequence: 1, sentAt: null, envelope: { instance: "synthetic", messageId, phone: "5491112345678", type: "TEXT", text, media: null, sentAt: null },
      reading: { complete: true, segments: [{ id: `${messageId}:1`, text, candidate: { extractedFields: { companyName: "Telar Azul", supplierType: "FACTORY", moq: { quantity: 300, unit: "unidades", notes: null, rawText: "MOQ 300 unidades" } }, evidence: [], reviewFields: [], rawSource: { type: "TEXT", text } } }] } }],
  };
  try {
    await env.persist(snapshot);
    const state = agentState(snapshot.state); snapshot.state = state;
    const tools = new AgentTools({ domain: env.domain, catalog: env.catalog, extraction: { async extractReading() { throw new Error("cached reading required"); } }, async checkpoint(s) { await env.save(snapshot, s); } });
    const prepared = await tools.execute("prepare_evidence", { sources: [{ messageId, role: "FACTS" }] }, snapshot, state) as { evidence: Array<{ id: string }> };
    const evidenceIds = prepared.evidence.map(e => e.id);
    const supplier = await tools.execute("create_supplier_draft", { tripId: env.id("trip-china"), companyId: env.id("broco"), evidenceIds }, snapshot, state) as { id: string };
    const before = await prisma.whatsAppPendingEvidence.findMany({ where: { sourceMessageId: messageId } });
    assert.equal(before.length, 1);
    assert.equal(before[0].captureId, supplier.id);
    await tools.execute("preserve_product_facts", { supplierId: supplier.id, evidenceIds }, snapshot, state);
    await tools.execute("preserve_product_facts", { supplierId: supplier.id, evidenceIds }, snapshot, state);
    assert.equal(await prisma.whatsAppPendingEvidence.count({ where: { sourceMessageId: messageId } }), 1);
    assert.equal(await prisma.supplierProduct.count({ where: { captureId: supplier.id } }), 0);
    assert.equal((await prisma.supplierCapture.findUniqueOrThrow({ where: { id: supplier.id } })).moqQuantity, null);
    const receipt = await prisma.whatsAppAgentOperation.findFirstOrThrow({ where: { burstId: snapshot.id, tool: "preserve_product_facts" } });
    assert.equal(receipt.status, "COMPLETED");
  } finally { await env.cleanup(); await prisma.$disconnect(); }
});

test("PostgreSQL: ambiguity suspends once; a displayed supplier selection resumes original facts without AI or duplication", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async () => {
  const prisma = localAgentDatabase(); const env = await createAgentEnvironment(prisma, PRODUCT_CATALOG);
  const text = "Tengo estos productos. MOQ 300 unidades.";
  const messageId = randomUUID();
  const candidate = { extractedFields: { moq: { quantity: 300, unit: "unidades", notes: null, rawText: "MOQ 300 unidades" } }, reviewFields: [], evidence: [], rawSource: { type: "TEXT" as const, text } };
  const snapshot: BurstSnapshot = { id: randomUUID(), userId: env.userId, instance: "synthetic", phone: "5491112345678", version: 3, revision: 1, leaseId: "lease", status: "PROCESSING", state: { tripId: env.id("trip-china"), groups: [], question: null, controlIds: [], pendingRefs: [] }, messages: [{ id: messageId, sequence: 1, sentAt: null, envelope: { instance: "synthetic", messageId, phone: "5491112345678", type: "TEXT", text, media: null, sentAt: null }, reading: { complete: true, segments: [{ id: `${messageId}:1`, text, candidate }] } }] };
  let calls = 0;
  const extraction = { async extractReading() { return candidate; } };
  try {
    await env.persist(snapshot);
    snapshot.state.ingestion = buildEvidenceGraph(snapshot);
    await prisma.user.update({ where: { id: env.userId }, data: { whatsappPhone: snapshot.phone } });
    const runner = new WhatsAppAgentOrchestrator({ domain: env.domain, extraction, client: { async post() {
      calls++;
      const state = agentState(snapshot.state);
      const tool = calls === 1 ? "get_supplier" : calls === 2 ? "prepare_evidence" : "preserve_product_facts";
      const args = calls === 1 ? { id: env.id("supplier-alfa") } : calls === 2 ? { sources: [{ messageId, quote: null, role: "FACTS" }] } : { supplierId: env.id("supplier-alfa"), evidenceIds: state.agent.evidence.map(e => e.id) };
      assert.ok(calls <= 3, "the backend must not ask the model to repair a business ambiguity");
      return { choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: `call-${calls}`, type: "function", function: { name: tool, arguments: JSON.stringify(args) } }] } }] };
    } } });
    const first = await runner.run(snapshot, env.catalog, async s => env.save(snapshot, s));
    assert.equal(first.state.agent.termination?.reason, "asked_clarification");
    assert.equal(first.state.agent.pending?.terminalFailure, undefined);
    assert.ok(first.state.agent.pending!.options.length > 1);
    assert.equal(first.state.ingestion!.summary.pending, 1);
    assert.equal(processingOutcome(first.state).commercialStatus, "AWAITING_CLARIFICATION");
    assert.equal(await prisma.whatsAppAgentOperation.count({ where: { burstId: snapshot.id } }), 0);
    const store = new PrismaBurstStore(prisma, { newVersion: 3, claimVersions: [3] });
    await store.finish(snapshot, first.state, first.text);
    const web = await listTripWhatsAppEvidence(prisma, env.userId, env.id("trip-china"));
    assert.equal(web.find(row => row.id === snapshot.id)!.status.label, "Espera una aclaración");
    const chosen = first.state.agent.pending!.options[0].id;
    const answer = { instance: snapshot.instance, phone: snapshot.phone, messageId: randomUUID(), type: "TEXT" as const, text: "1", media: null, sentAt: null };
    await Promise.all([store.receive(answer), store.receive(answer)]);
    await prisma.whatsAppBurst.update({ where: { id: snapshot.id }, data: { dueAt: new Date(0) } });
    const [resumed] = await store.claim(1);
    assert.equal(resumed.id, snapshot.id);
    assert.equal(resumed.revision, 2, "concurrent redelivery must not add a revision");
    const noAI = new WhatsAppAgentOrchestrator({ domain: env.domain, extraction, client: { async post() { assert.fail("displayed selection must not require the model"); } } });
    await assert.rejects(noAI.run(resumed, env.catalog, async s => {
      if (s.agent.receipts.some(r => r.tool === "preserve_product_facts")) throw new AgentCheckpoint();
      await env.save(resumed, s);
    }), AgentCheckpoint);
    assert.equal(await prisma.whatsAppPendingEvidence.count({ where: { sourceMessageId: messageId } }), 1, "effect committed before the caller checkpoint");
    await prisma.whatsAppBurst.update({ where: { id: snapshot.id }, data: { leaseUntil: new Date(0), dueAt: new Date(0) } });
    const [recovered] = await store.claim(1);
    const final = await noAI.run(recovered, env.catalog, async s => env.save(recovered, s));
    await store.finish(recovered, final.state, final.text);
    const saved = await prisma.whatsAppPendingEvidence.findMany({ where: { sourceMessageId: messageId } });
    assert.equal(saved.length, 1);
    assert.equal(saved[0].captureId, (await env.domain.get(resumed, "SUPPLIER", chosen)).captureId);
    assert.equal((saved[0].facts as { moq: { quantity: number } }).moq.quantity, 300);
    assert.equal(await prisma.supplierProduct.count({ where: { capture: { tripId: env.id("trip-china") } } }), 0);
    assert.equal(await prisma.whatsAppBurstReply.count({ where: { burstId: snapshot.id, revision: 2 } }), 1);
    assert.equal(final.state.agent.pending, null);
    assert.equal(final.state.agent.rounds, 0);
    assert.equal((await prisma.whatsAppBurst.findUniqueOrThrow({ where: { id: snapshot.id } })).status, "DONE");
  } finally { await env.cleanup(); await prisma.$disconnect(); }
});
