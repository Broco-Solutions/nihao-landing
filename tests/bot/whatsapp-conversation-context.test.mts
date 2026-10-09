import { WhatsAppAgentOrchestrator } from "../../lib/channels/whatsapp/agent-orchestrator.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { advanceFocus, emptyFocus } from "../../lib/channels/whatsapp/conversation-context.ts";
import { agentState, type AgentReceipt, type AgentState } from "../../lib/channels/whatsapp/agent-contract.ts";
import { availableAgentTools } from "../../lib/channels/whatsapp/agent-policy.ts";
import { answersPending } from "../../lib/channels/whatsapp/burst-routing.ts";
import { createAgentEnvironment, localAgentDatabase } from "../../evals/whatsapp-agent/environment.ts";
import { AgentTools } from "../../lib/channels/whatsapp/agent-tools.ts";
import type { BurstSnapshot } from "../../lib/channels/whatsapp/burst-types.ts";
import type { ExtractionCandidate } from "../../lib/bot/types.ts";

function snapshot(text: string): BurstSnapshot {
  const id = randomUUID(), m = randomUUID();
  return { id, userId: "user", instance: "test", phone: "5491112345678", revision: 1, leaseId: "lease", status: "PROCESSING", state: agentState({ tripId: null, groups: [], question: null, controlIds: [], pendingRefs: [] }), messages: [{ id: m, sequence: 1, sentAt: null, envelope: { instance: "test", phone: "5491112345678", messageId: m, type: "TEXT", text, media: null, sentAt: null }, reading: { complete: true, segments: [{ id: `${m}:1`, text }] } }] };
}
const catalog = { trips: [{ id: "trip", name: "China", companies: [{ id: "company", name: "Broco" }], suppliers: [{ id: "supplier", captureId: "capture", name: "Alfa Tools", companyId: "company", city: null }] }] };

test("short clarifications have access to reference resolution without keywords", () => {
  const s = snapshot("Son 500 unidades");
  assert.ok(availableAgentTools(s, agentState(s.state), catalog).some(t => t.function.name === "resolve_recent_reference"));
});
test("focus preserves multiple products in one turn and resets on a later turn", () => {
  const s = snapshot("Dos productos");
  const r: AgentReceipt = { operationId: "op1", tool: "create_product_draft", id: "p1", tripId: "trip", companyId: "company", status: "COMPLETED" };
  const one = advanceFocus(emptyFocus(), r, s, "supplier");
  const two = advanceFocus(one, { ...r, id: "p2", operationId: "op2" }, s, "supplier");
  assert.deepEqual(two.productIds, ["p1", "p2"]);
  assert.deepEqual(advanceFocus(two, r, s, "supplier"), two);
  assert.deepEqual(advanceFocus(two, { ...r, id: "p3", operationId: "op3" }, { ...s, revision: 2 }, "supplier").productIds, ["p3"]);
});
test("free text and audio answers resume a question; independent uploads do not", () => {
  const s = snapshot("El rojo"); const state = s.state as AgentState;
  state.agent.pending = { type: "CLARIFICATION", revision: 0, text: "¿Cuál producto?", options: [] };
  assert.equal(answersPending(s.messages[0].envelope, state), true);
  assert.equal(answersPending({ ...s.messages[0].envelope, type: "AUDIO", text: null }, state), true);
  assert.equal(answersPending({ ...s.messages[0].envelope, text: "Cargá otro producto Martillo" }, state), false);
});

test("PostgreSQL: supplier → product → clarification across bursts, durable focus and ambiguity", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async t => {
  const prisma = localAgentDatabase(), env = await createAgentEnvironment(prisma, catalog);
  const extraction = { async extractReading(text: string): Promise<ExtractionCandidate> {
    return { extractedFields: text.includes("500") ? { moq: { quantity: 500, unit: "unidades", notes: null, rawText: "500 unidades" } } : {}, evidence: [], reviewFields: [], rawSource: { type: "TEXT", text } };
  } };
  async function turn(text: string) {
    await prisma.whatsAppBurst.updateMany({ where: { userId: env.userId }, data: { status: "DONE" } });
    const s = snapshot(text); s.userId = env.userId; await env.persist(s);
    const state = s.state as AgentState;
    const tools = new AgentTools({ domain: env.domain, extraction, catalog: env.catalog, async checkpoint(next) { s.state = next; await env.save(s, next); } });
    const evidence = async () => {
      const r = await tools.execute("prepare_evidence", { sources: [{ messageId: s.messages[0].id, role: "FACTS" }] }, s, state) as { evidence: { id: string }[] };
      return r.evidence.map(e => e.id);
    };
    return { s, state, tools, evidence };
  }
  try {
    const first = await turn("Proveedor Alfa Tools");
    await env.domain.selectConversationTarget(first.s, "SUPPLIER", env.id("supplier"));
    const second = await turn("Producto Taladro");
    assert.equal((await env.domain.resolveConversationReference(second.s, "SUPPLIER"))[0].id, env.id("supplier"));
    await second.tools.execute("get_supplier", { id: env.id("supplier") }, second.s, second.state);
    const created = await second.tools.execute("create_product_draft", { supplierId: env.id("supplier"), name: "Taladro", evidenceIds: await second.evidence() }, second.s, second.state) as AgentReceipt;
    assert.equal(created.status, "COMPLETED");
    await t.test("days later updates the same confirmed product, directly and idempotently", async () => {
      await prisma.whatsAppAgentContext.updateMany({ where: { userId: env.userId }, data: { updatedAt: new Date(Date.now() - 3 * 86400000) } });
      const third = await turn("El MOQ es 500 unidades");
      const refs = await third.tools.execute("resolve_recent_reference", { kind: "PRODUCT" }, third.s, third.state) as { records: { id: string }[] };
      assert.deepEqual(refs.records.map(r => r.id), [created.id]);
      await third.tools.execute("get_product", { id: created.id }, third.s, third.state);
      const args = { id: created.id, patch: { moq: { quantity: 500, unit: "unidades" } }, evidenceIds: await third.evidence() };
      const updated = await third.tools.execute("update_product", args, third.s, third.state) as AgentReceipt;
      assert.equal(updated.status, "COMPLETED");
      assert.deepEqual(await third.tools.execute("update_product", args, third.s, third.state), updated);
      assert.equal((await prisma.supplierProduct.findUniqueOrThrow({ where: { id: created.id } })).moqQuantity, 500);
      assert.equal(await prisma.supplierProduct.count({ where: { captureId: env.id("capture") } }), 1);
      assert.equal(await prisma.whatsAppAgentOperation.count({ where: { burstId: third.s.id, status: "PROPOSED" } }), 0);
      await third.tools.execute("get_supplier", { id: env.id("supplier") }, third.s, third.state);
      await assert.rejects(third.tools.execute("create_product_draft", { supplierId: env.id("supplier"), name: "Taladro", evidenceIds: args.evidenceIds }, third.s, third.state), /aclaración del producto activo/);
    });
    await t.test("the complete agent loop receives persistent focus and corrects a short message", async () => {
      const current = await turn("Son 500 unidades");
      let round = 0;
      const runner = new WhatsAppAgentOrchestrator({ domain: env.domain, extraction, client: { async post(_path, body) {
        const request = body as { messages: Array<{ content: string }> };
        const initial = JSON.parse(request.messages[1].content);
        assert.equal(initial.conversationContext.products[0].id, created.id);
        assert.equal(initial.operationalContext.selectedTripId, env.id("trip"));
        const sequence: Array<[string, unknown]> = [
          ["resolve_recent_reference", { kind: "PRODUCT" }],
          ["get_product", { id: created.id }],
          ["prepare_evidence", { sources: [{ messageId: current.s.messages[0].id, quote: null, role: "FACTS" }] }],
          ["update_product", { id: created.id, patch: { notes: null, name: null, fob: null, leadTime: null, clearFields: null, moq: { quantity: 500, unit: "unidades", notes: null, rawText: null } }, evidenceIds: round === 3 ? JSON.parse(request.messages.at(-1)!.content).evidence.map((e: { id: string }) => e.id) : [] }],
          ["finish_turn", { response: null, guidance: null, outcomes: null }],
        ];
        assert.ok(round < sequence.length, request.messages.at(-1)!.content);
        const [name, args] = sequence[round++];
        return { choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: `context-${round}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] } }] };
      } } });
      await runner.run(current.s, { trips: [...env.catalog.trips, { id: "other-trip", name: "Otro viaje", companies: [{ id: "other-company", name: "Otra empresa" }] }] }, next => env.save(current.s, next));
      assert.equal(round, 5);
      assert.equal(await prisma.supplierProduct.count({ where: { captureId: env.id("capture") } }), 1);
    });
    await t.test("quoted messages override the active resource and stale writes are rejected", async () => {
      const current = await turn("El MOQ es 500 unidades");
      current.s.messages[0].envelope.quotedMessageId = second.s.messages[0].id;
      assert.deepEqual((await env.domain.resolveConversationReference(current.s, "PRODUCT")).map(r => r.id), [created.id]);
      await prisma.whatsAppBurst.update({ where: { id: second.s.id }, data: { state: { ...JSON.parse(JSON.stringify(second.s.state)), outboundReplies: [{ revision: second.s.revision, messageId: "saved-product-reply" }] } } });
      current.s.messages[0].envelope.quotedMessageId = "saved-product-reply";
      assert.deepEqual((await env.domain.resolveConversationReference(current.s, "PRODUCT")).map(r => r.id), [created.id]);
      const target = await env.domain.get(current.s, "PRODUCT", created.id);
      current.state.agent.resolvedRecords = [{ id: target.id, kind: target.kind, version: target.version }];
      await prisma.supplierProduct.update({ where: { id: created.id }, data: { updatedAt: new Date(Date.now() + 5000) } });
      const prepared = await current.evidence();
      await assert.rejects(env.domain.write(current.s, { tool: "update_product", targetId: created.id, tripId: env.id("trip"), companyId: env.id("company"), patch: { moq: { quantity: 500 } }, evidence: current.state.agent.evidence.filter(e => prepared.includes(e.id)) }), /registro cambió/);
    });
    await t.test("multiple products require a choice, and a numeric answer selects the target", async () => {
      const multiple = await turn("Producto Rojo. Producto Azul");
      await env.domain.write(multiple.s, { tool: "create_product_draft", targetId: env.id("supplier"), tripId: env.id("trip"), companyId: env.id("company"), name: "Rojo", evidence: [{ id: `${multiple.s.messages[0].id}:red`, messageId: multiple.s.messages[0].id, start: 0, end: 13, text: "Producto Rojo", role: "FACTS", candidate: { extractedFields: {}, evidence: [], reviewFields: [], rawSource: { type: "TEXT", text: "Producto Rojo" } } }] });
      const blue = await env.domain.write(multiple.s, { tool: "create_product_draft", targetId: env.id("supplier"), tripId: env.id("trip"), companyId: env.id("company"), name: "Azul", evidence: [{ id: `${multiple.s.messages[0].id}:blue`, messageId: multiple.s.messages[0].id, start: 15, end: 28, text: "Producto Azul", role: "FACTS", candidate: { extractedFields: {}, evidence: [], reviewFields: [], rawSource: { type: "TEXT", text: "Producto Azul" } } }] });
      const clarification = await turn("El precio es 7");
      const refs = await env.domain.resolveConversationReference(clarification.s, "PRODUCT");
      assert.equal(refs.length, 2);
      clarification.state.agent.pending = { type: "CLARIFICATION", revision: 0, text: "¿Cuál?", options: refs.map(r => ({ id: r.id, label: r.name! })) };
      clarification.s.messages[0].envelope.text = String(refs.findIndex(r => r.id === blue.id) + 1);
      assert.deepEqual((await env.domain.resolveConversationReference(clarification.s, "PRODUCT")).map(r => r.id), [blue.id]);
    });
    await t.test("explicit unknown destinations, reset and revoked access never fall back", async () => {
      const unknown = await turn("Producto Martillo para Gamma");
      assert.deepEqual(await env.domain.resolveConversationReference(unknown.s, "SUPPLIER"), []);
      const reset = await turn("Empezá de nuevo"); await env.domain.resetConversationContext(reset.s);
      const after = await turn("El MOQ es 500 unidades");
      assert.deepEqual(await env.domain.resolveConversationReference(after.s, "PRODUCT"), []);
      await env.domain.selectConversationTarget(after.s, "SUPPLIER", env.id("supplier"));
      await prisma.tripMember.deleteMany({ where: { userId: env.userId } });
      assert.deepEqual((await env.domain.conversationContext(after.s)).suppliers, []);
    });
  } finally { await env.cleanup(); await prisma.$disconnect(); }
});
