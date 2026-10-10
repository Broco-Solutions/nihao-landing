import test from "node:test";
import assert from "node:assert/strict";
import { agentState } from "../../lib/channels/whatsapp/agent-contract.ts";
import { rememberedIds, recentReferenceCandidates, type RecentConversation } from "../../lib/channels/whatsapp/agent-memory.ts";
import type { BurstSnapshot } from "../../lib/channels/whatsapp/burst-types.ts";
const catalog = { trips: [{ id: "trip", name: "China", companies: [{ id: "broco", name: "Broco Solutions" }, { id: "kendal", name: "Kendal Salud" }] }] };
const ref = (id: string, companyId = "broco") => ({ id, name: id, kind: "SUPPLIER" as const, companyId, tripId: "trip", captureId: `${id}-capture`, status: "CONFIRMED" });
const memory: RecentConversation[] = [
  { conversationId: "new", completedAt: new Date().toISOString(), references: [ref("Beta", "kendal")], operations: [] },
  { conversationId: "old", completedAt: new Date().toISOString(), references: [ref("Alfa")], operations: [] },
];
function snapshot(text: string): BurstSnapshot { return { id: "current", userId: "user", instance: "instance", phone: "phone", revision: 1, leaseId: "lease", status: "PROCESSING", state: { tripId: null, groups: [], question: null, controlIds: [], pendingRefs: [] }, messages: [{ id: "m", sequence: 1, sentAt: null, envelope: { instance: "instance", phone: "phone", messageId: "m", type: "TEXT", text, media: null, sentAt: null }, reading: null }] }; }
test("referencia sin destino usa la conversación anterior más próxima", () => {
  assert.deepEqual(recentReferenceCandidates(memory, snapshot("Agregale producto Martillo"), catalog, "SUPPLIER").map((r) => r.id), ["Beta"]);
  assert.deepEqual(recentReferenceCandidates(memory, snapshot("Agregá producto Martillo al último proveedor"), catalog, "SUPPLIER").map((r) => r.id), ["Beta"]);
  assert.deepEqual(recentReferenceCandidates(memory, snapshot("Agregale producto Martillo para Broco Solutions"), catalog, "SUPPLIER").map((r) => r.id), ["Alfa"]);
  assert.deepEqual(recentReferenceCandidates(memory, snapshot("Agregale producto Martillo, empresa Broco Solutions"), catalog, "SUPPLIER").map((r) => r.id), ["Alfa"]);
});
test("destino explícito y pregunta pendiente prevalecen sobre el fallback", () => {
  for (const text of ["Agregale producto Martillo al proveedor Gamma", "Agregale producto Martillo para Gamma", "Agregale producto Martillo a Gamma"]) assert.equal(recentReferenceCandidates(memory, snapshot(text), catalog, "SUPPLIER").length, 0);
  assert.equal(recentReferenceCandidates(memory, snapshot("Agregá producto Martillo"), catalog, "SUPPLIER")[0].id, "Beta");
  const s = snapshot("Agregale producto Martillo"); const state = agentState(s.state); state.agent.pending = { type: "CLARIFICATION", revision: 0, options: [], text: "¿Cuál?" }; s.state = state;
  assert.equal(recentReferenceCandidates(memory, s, catalog, "SUPPLIER").length, 0);
});
test("no recuerda destinos de búsquedas ambiguas ni propuestas sin aplicar", () => {
  const state = agentState(snapshot("texto").state);
  state.agent.calls = [{ name: "search_suppliers", result: { records: [ref("Alfa"), ref("Beta")] } }, { name: "get_product", result: { id: "taladro" } }, { name: "get_supplier", result: { error: "NOT_FOUND" } }];
  state.agent.receipts = [{ id: "Alfa", tool: "update_supplier", operationId: "proposal", status: "PROPOSED" }];
  assert.deepEqual(rememberedIds(state), [{ id: "taladro", kind: "PRODUCT" }]);
});

import { randomUUID } from "node:crypto";
import { createAgentEnvironment, localAgentDatabase } from "../../evals/whatsapp-agent/environment.ts";
import { PRODUCT_CATALOG } from "../../evals/whatsapp-products/cases.ts";
import { AgentTools } from "../../lib/channels/whatsapp/agent-tools.ts";

test("memoria PostgreSQL: límites, autorización y asociaciones reales", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async (t) => {
  const prisma = localAgentDatabase();
  async function run(body: (env: Awaited<ReturnType<typeof createAgentEnvironment>>, current: BurstSnapshot, history: (supplierId: string, ageMs?: number, overrides?: Record<string, unknown>) => Promise<string>) => Promise<void>) {
    const env = await createAgentEnvironment(prisma, PRODUCT_CATALOG);
    const current = snapshot("Agregale producto Martillo. FOB USD 3 por unidad."); current.id = randomUUID(); current.userId = env.userId; current.leaseId = "lease";
    await env.persist(current);
    async function history(supplierId: string, ageMs = 0, overrides: Record<string, unknown> = {}) {
      const s = agentState(snapshot("old").state); s.agent.calls = [{ name: "get_supplier", result: { id: supplierId } }];
      const row = await prisma.whatsAppBurst.create({ data: { id: randomUUID(), userId: env.userId, phone: current.phone, instance: current.instance, version: 3, status: "DONE", dueAt: new Date(), updatedAt: new Date(Date.now() - ageMs), state: JSON.parse(JSON.stringify(s)), ...overrides } }); return row.id;
    }
    try { await body(env, current, history); } finally { await env.cleanup(); }
  }
  try {
    await t.test("últimas diez, 24 horas y mismo usuario/teléfono/instancia/version", () => run(async (env, current, history) => {
      await history(env.id("supplier-beta"), 25 * 60 * 60 * 1000);
      await history(env.id("supplier-beta"), 0, { phone: "other-phone" });
      await history(env.id("supplier-beta"), 0, { instance: "other-instance" });
      await history(env.id("supplier-beta"), 0, { version: 2 });
      await history(env.id("supplier-beta"), 0, { status: "WAITING" });
      const valid = []; for (let i = 11; i >= 1; i--) valid.push(await history(env.id("supplier-alfa"), i * 1000));
      const memory = await env.domain.recentMemory(current);
      assert.equal(memory.length, 10); assert.deepEqual(memory.map((m) => m.conversationId), valid.slice(1).reverse());
      assert.ok(memory.every((m) => m.references[0].id === env.id("supplier-alfa")));
      const other = { ...current, userId: "other-user" }; assert.deepEqual(await env.domain.recentMemory(other), []);
    }));
    await t.test("continuación crea un producto con precio actual y no hereda MOQ", () => run(async (env, current, history) => {
      await history(env.id("supplier-alfa")); const state = agentState(current.state); current.state = state;
      const tools = new AgentTools({ domain: env.domain, catalog: env.catalog, extraction: { async extractReading(text) { return { extractedFields: { fob: { amount: 3, currency: "USD", unit: "unidad", rawText: "FOB USD 3 por unidad" } }, reviewFields: [], evidence: [], rawSource: { type: "TEXT", text } }; } }, async checkpoint(s) { current.state = s; await env.save(current, s); } });
      const resolved = await tools.execute("resolve_recent_reference", { kind: "SUPPLIER" }, current, state) as { records: Array<{ id: string }> }; assert.equal(resolved.records[0].id, env.id("supplier-alfa"));
      const evidence = await tools.execute("prepare_evidence", { sources: [{ messageId: "m", role: "FACTS" }] }, current, state) as { evidence: Array<{ id: string }> };
      await tools.execute("create_product_draft", { supplierId: env.id("supplier-alfa"), name: "Martillo", evidenceIds: evidence.evidence.map((e) => e.id) }, current, state);
      const p = await prisma.supplierProduct.findFirstOrThrow({ where: { captureId: env.id("capture-alfa") } });
      assert.equal(p.supplierId, env.id("supplier-alfa")); assert.equal(Number(p.fobAmount), 3); assert.equal(p.moqQuantity, null); assert.equal(p.status, "DRAFT");
    }));
    await t.test("modelo no puede elegir arbitrariamente entre dos proveedores recientes", () => run(async (env, current, history) => {
      await history(env.id("supplier-alfa"), 1000); await history(env.id("supplier-beta"));
      const evidence = [{ id: "e", messageId: "m", start: 0, end: 10, text: "Martillo", role: "FACTS" as const, candidate: { extractedFields: {}, reviewFields: [], evidence: [], rawSource: { type: "TEXT" as const, text: "Martillo" } } }];
      await assert.rejects(env.domain.write(current, { tool: "create_product_draft", tripId: env.id("trip-china"), companyId: env.id("broco"), targetId: env.id("supplier-alfa"), evidence, name: "Martillo" }), /inequívocamente|otro proveedor/);
      assert.equal(await prisma.supplierProduct.count({ where: { capture: { tripId: env.id("trip-china") } } }), 0);
    }));
    await t.test("aclaración numérica elige entre opciones recientes persistidas", () => run(async (env, current, history) => {
      const prior = agentState(snapshot("old").state);
      prior.agent.calls = [{ name: "get_supplier", result: { id: env.id("supplier-alfa") } }, { name: "get_supplier", result: { id: env.id("supplier-beta") } }];
      await history(env.id("supplier-beta"), 0, { state: JSON.parse(JSON.stringify(prior)) });
      const state = agentState(current.state); current.state = state;
      const tools = new AgentTools({ domain: env.domain, catalog: env.catalog, extraction: { async extractReading(text) { return { extractedFields: {}, reviewFields: [], evidence: [], rawSource: { type: "TEXT", text } }; } }, async checkpoint(s) { current.state = s; await env.save(current, s); } });
      const result = await tools.execute("resolve_recent_reference", { kind: "SUPPLIER" }, current, state); state.agent.calls.push({ name: "resolve_recent_reference", result });
      await tools.execute("ask_clarification", { question: "¿A cuál proveedor?", pendingProducts: [{ name: "Martillo" }] }, current, state);
      assert.equal(state.agent.pending!.options.length, 2);
      const selected = state.agent.pending!.options[1].id; current.revision++;
      current.messages.push({ id: "answer", sequence: 2, sentAt: null, reading: null, envelope: { ...current.messages[0].envelope, messageId: "answer", text: "2" } });
      await prisma.whatsAppBurst.update({ where: { id: current.id }, data: { revision: 2 } });
      const records = await tools.execute("search_suppliers", { tripId: env.id("trip-china"), query: "irrelevant" }, current, state) as { records: Array<{ id: string }> };
      assert.equal(records.records[0].id, selected);
      const prepared = await tools.execute("prepare_evidence", { sources: [{ messageId: "m", role: "FACTS" }] }, current, state) as { evidence: Array<{ id: string }> };
      await tools.execute("create_product_draft", { supplierId: selected, name: "Martillo", evidenceIds: prepared.evidence.map((e) => e.id) }, current, state);
      const p = await prisma.supplierProduct.findFirstOrThrow({ where: { capture: { tripId: env.id("trip-china") } } }); assert.equal(p.supplierId, selected); assert.equal(p.status, "DRAFT");
    }));
    await t.test("editar un producto confirmado recordado aplica una corrección clara directamente", () => run(async (env, current) => {
      const p = await prisma.supplierProduct.create({ data: { captureId: env.id("capture-alfa"), supplierId: env.id("supplier-alfa"), name: "Taladro", status: "CONFIRMED", fobAmount: 9, fobCurrency: "USD", fobUnit: "unidad", moqQuantity: 500 } });
      const past = agentState(snapshot("old").state); past.agent.calls = [{ name: "get_product", result: { id: p.id } }];
      await prisma.whatsAppBurst.create({ data: { userId: env.userId, phone: current.phone, instance: current.instance, version: 3, status: "DONE", dueAt: new Date(), state: JSON.parse(JSON.stringify(past)) } });
      current.messages[0].envelope.text = "Corregí el FOB del último producto a USD 7 por unidad.";
      const evidence = [{ id: "e", messageId: "m", start: 0, end: 55, text: current.messages[0].envelope.text, role: "FACTS" as const, candidate: { extractedFields: { fob: { amount: 7, currency: "USD", unit: "unidad", rawText: "USD 7 por unidad" } }, reviewFields: [], evidence: [], rawSource: { type: "TEXT" as const, text: current.messages[0].envelope.text } } }];
      const result = await env.domain.write(current, { tool: "update_product", tripId: env.id("trip-china"), companyId: env.id("broco"), targetId: p.id, evidence, patch: { fob: { amount: 7 } } });
      assert.equal(result.status, "COMPLETED"); assert.equal(Number((await prisma.supplierProduct.findUniqueOrThrow({ where: { id: p.id } })).fobAmount), 7);
      assert.equal(await prisma.whatsAppAgentOperation.count({ where: { burstId: current.id, status: "PROPOSED" } }), 0);
    }));
    await t.test("referencias vencidas o permisos revocados no aparecen", () => run(async (env, current, history) => {
      await history(env.id("supplier-alfa"), 25 * 60 * 60 * 1000); assert.equal((await env.domain.recentMemory(current)).length, 0);
      await history(env.id("supplier-alfa")); await prisma.tripMember.deleteMany({ where: { userId: env.userId } });
      assert.deepEqual((await env.domain.recentMemory(current)).flatMap((m) => m.references), []);
    }));
    await t.test("un borrador confirmado en la web conserva su referencia con el nuevo ID", () => run(async (env, current, history) => {
      const captureId = `${env.prefix}-draft`;
      await prisma.supplierCapture.create({ data: { id: captureId, tripId: env.id("trip-china"), companyId: env.id("broco"), createdById: env.userId, status: "DRAFT", sourceType: "TEXT", companyName: "Nuevo Tools", missingFields: [], reviewFields: [], acknowledgedUnknownFields: [], evidence: [] } });
      await history(captureId);
      assert.equal((await env.domain.recentMemory(current))[0].references[0].kind, "SUPPLIER_DRAFT");
      await prisma.supplierCapture.update({ where: { id: captureId }, data: { status: "CONFIRMED" } });
      const supplier = await prisma.supplier.create({ data: { captureId, tripId: env.id("trip-china"), companyId: env.id("broco"), createdById: env.userId, companyName: "Nuevo Tools", pendingFields: [] } });
      assert.equal((await env.domain.recentMemory(current))[0].references[0].id, supplier.id);
    }));
    await t.test("valores actuales se consultan de nuevo y nunca se incorporan al resumen", () => run(async (env, current, history) => {
      await history(env.id("supplier-alfa")); await prisma.supplier.update({ where: { id: env.id("supplier-alfa") }, data: { city: "Guangzhou" } });
      const memory = await env.domain.recentMemory(current); assert.equal(memory[0].references[0].city, "Guangzhou"); assert.ok(!("data" in memory[0].references[0]));
    }));
  } finally { await prisma.$disconnect(); }
});

import { WhatsAppAgentOrchestrator, WHATSAPP_AGENT_MEMORY_PROMPT } from "../../lib/channels/whatsapp/agent-orchestrator.ts";
import type { AgentDomain } from "../../lib/channels/whatsapp/agent-contract.ts";
test("el prompt y la tool de memoria se ofrecen sólo para referencias al contexto", async () => {
  const domain: AgentDomain = { async recentMemory() { return []; }, async get() { throw new Error("unused"); }, async search() { return []; }, async write() { throw new Error("unused"); }, async receipts() { return []; }, async pending() { return []; }, async displayed() {}, async resolve() { throw new Error("unused"); } };
  for (const [text, expected] of [["Agregá producto Martillo a Alfa Tools", true], ["Agregale producto Martillo", true]] as const) {
    const runner = new WhatsAppAgentOrchestrator({ domain, extraction: { async extractReading() { throw new Error("unused"); } }, client: { async post(_endpoint, body) {
      const payload = body as { tools: Array<{ function: { name: string } }>; messages: Array<{ content: string }> };
      assert.equal(payload.tools.some((t) => t.function.name === "resolve_recent_reference"), expected);
      assert.equal(payload.messages[0].content.includes(WHATSAPP_AGENT_MEMORY_PROMPT), expected);
      return { choices: [{ message: { role: "assistant", tool_calls: [{ id: "question", type: "function", function: { name: "ask_clarification", arguments: JSON.stringify({ question: "¿A cuál proveedor?", pendingProducts: [{ name: "Martillo" }] }) } }] } }] };
    } } });
    await runner.run(snapshot(text), catalog, async () => {});
  }
});

test("la memoria no agrega una pregunta de empresa cuando el pedido ya la identifica", async () => {
  const s = snapshot("Cargá producto Taladro para el proveedor Alfa Tools de Kendal Salud."); const state = agentState(s.state);
  const tools = new AgentTools({ domain: {} as AgentDomain, catalog, extraction: {} as never, async checkpoint() {} });
  await tools.execute("get_context", {}, s, state);
  await assert.rejects(tools.execute("ask_clarification", { question: "¿Para qué empresa?", options: [{ id: "broco", label: "Broco Solutions" }, { id: "kendal", label: "Kendal Salud" }], pendingProducts: [{ name: "Taladro", supplierQuery: "Alfa Tools" }] }, s, state), /ya indicó la empresa Kendal Salud/);
  assert.equal(state.agent.pending, null);
});
