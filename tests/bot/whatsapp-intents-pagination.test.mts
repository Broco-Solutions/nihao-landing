import test from "node:test";
import assert from "node:assert/strict";
import { agentState, type AgentDomain, type AgentRecord } from "../../lib/channels/whatsapp/agent-contract.ts";
import { WhatsAppAgentOrchestrator } from "../../lib/channels/whatsapp/agent-orchestrator.ts";
import { registerIntents, resolveIntent, assertIntentCoverage } from "../../lib/channels/whatsapp/intent-ledger.ts";
import type { BurstSnapshot } from "../../lib/channels/whatsapp/burst-types.ts";
import { createAgentEnvironment, localAgentDatabase } from "../../evals/whatsapp-agent/environment.ts";

const snapshot = (text: string): BurstSnapshot => ({ id: "burst", instance: "eval", phone: "5491112345678", userId: "user", revision: 1, leaseId: "lease", status: "PROCESSING", state: { tripId: null, groups: [], question: null, controlIds: [], pendingRefs: [] }, messages: [{ id: "m1", sequence: 1, sentAt: null, envelope: { instance: "eval", phone: "5491112345678", messageId: "m1", type: "TEXT", text, media: null, sentAt: null }, reading: { complete: true, segments: [{ id: "m1:1", text }] } }] });
const catalog = { trips: [{ id: "trip", name: "China", companies: [{ id: "company", name: "Demo" }], suppliers: [] }] };
const suppliers: AgentRecord[] = Array.from({ length: 45 }, (_, i) => ({ id: `s${i + 1}`, captureId: `c${i + 1}`, kind: "SUPPLIER", name: `Proveedor ${String(i + 1).padStart(2, "0")}`, tripId: "trip", companyId: "company", status: "CONFIRMED", version: "1", data: {} }));
const domain: AgentDomain = { async search() { return suppliers; }, async get(_s, _k, id) { return suppliers.find(s => s.id === id)!; }, async write() { throw new Error("unused"); }, async pending() { return []; }, async resolve() { throw new Error("unused"); }, async receipts() { return []; }, async displayed() {} };
const extraction = { async extractReading(text: string) { return { extractedFields: {}, reviewFields: [], evidence: [], rawSource: { type: "TEXT" as const, text } }; } };
type Message = { role: string; content: string | null };
const lastTool = (body: unknown) => JSON.parse([...(body as { messages: Message[] }).messages].reverse().find(m => m.role === "tool")!.content!);
const scripted = (steps: Array<(body: unknown) => [string, unknown]>) => {
  let index = 0; const seen: unknown[] = [];
  return { seen, client: { async post(_endpoint: string, body: unknown) {
    if (index > 0) seen.push(lastTool(body));
    const step = steps[index++]; if (!step) throw new Error("script exhausted");
    const [name, args] = step(body);
    return { choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: `c${index}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] } }] };
  } } };
};
const errors = (seen: unknown[]) => seen.filter(r => (r as { error?: string }).error);

test("“todos” recorre todas las páginas con conteo real y responde aparte lo ajeno", async () => {
  const text = "¿Qué proveedores tengo? Pasame todos. Y de paso, ¿quién ganó el mundial 86?";
  let ids: string[] = []; const pages: Array<{ total: number; nextCursor: string | null; records: AgentRecord[] }> = [];
  const listing = (from: number, to: number) => suppliers.slice(from, to).map(s => `• ${s.name}`).join("\n");
  const { client, seen } = scripted([
    () => ["register_intents", { intents: [{ messageId: "m1", quote: "¿Qué proveedores tengo? Pasame todos.", label: "Listar proveedores", kind: "QUERY" }, { messageId: "m1", quote: "¿quién ganó el mundial 86?", label: "Fútbol", kind: "OUT_OF_SCOPE" }] }],
    body => { ids = lastTool(body).intents.map((i: { id: string }) => i.id); return ["search_suppliers", { tripId: "trip", query: "", cursor: null }]; },
    body => { pages.push(lastTool(body)); return ["search_suppliers", { tripId: "trip", query: "", cursor: pages.at(-1)!.nextCursor }]; },
    body => { pages.push(lastTool(body)); return ["search_suppliers", { tripId: "trip", query: "", cursor: pages.at(-1)!.nextCursor }]; },
    body => { pages.push(lastTool(body)); return ["resolve_intent", { intentId: ids[0], status: "PENDING", response: `Tenés 45 proveedores:\n${listing(0, 20)}`, receiptIds: null }]; },
    () => ["resolve_intent", { intentId: ids[0], status: "ANSWERED", response: listing(20, 45), receiptIds: null }],
    () => ["resolve_intent", { intentId: ids[1], status: "OUT_OF_SCOPE", response: "Lo del mundial no tiene que ver con Nihao, así que no lo respondo.", receiptIds: null }],
    () => ["finish_turn", { response: null, guidance: null, outcomes: null }],
  ]);
  const result = await new WhatsAppAgentOrchestrator({ domain, extraction, client }).run(snapshot(text), catalog, async () => {});
  assert.deepEqual(errors(seen), []);
  assert.deepEqual(pages.map(p => [p.records.length, p.total, Boolean(p.nextCursor)]), [[20, 45, true], [20, 45, true], [5, 45, false]]);
  for (const s of suppliers) assert.equal(result.text.split(s.name!).length - 1, 1, `${s.name} aparece una vez`);
  assert.match(result.text, /mundial no tiene que ver con Nihao/u);
  assert.equal(result.state.agent.termination?.reason, "completed");
});

test("una aclaración bloquea sólo su pedido, se muestra una vez y la consulta independiente se responde", async () => {
  const text = "Cargá el producto Vaso. ¿Cuántos proveedores tengo?";
  let ids: string[] = [];
  const { client, seen } = scripted([
    () => ["register_intents", { intents: [{ messageId: "m1", quote: "Cargá el producto Vaso.", label: "Cargar Vaso", kind: "CREATE_PRODUCT" }, { messageId: "m1", quote: "¿Cuántos proveedores tengo?", label: "Contar proveedores", kind: "QUERY" }] }],
    body => { ids = lastTool(body).intents.map((i: { id: string }) => i.id); return ["ask_clarification", { question: "¿A qué proveedor pertenece el producto Vaso?", intentIds: [ids[0]], options: null, pendingProducts: [{ name: "Vaso", supplierQuery: null }] }]; },
    () => ["search_suppliers", { tripId: "trip", query: "", cursor: null }],
    () => ["resolve_intent", { intentId: ids[1], status: "ANSWERED", response: "Tenés 45 proveedores en este viaje.", receiptIds: null }],
    () => ["finish_turn", { response: null, guidance: null, outcomes: null }],
  ]);
  const result = await new WhatsAppAgentOrchestrator({ domain, extraction, client }).run(snapshot(text), catalog, async () => {});
  assert.deepEqual(errors(seen), []);
  assert.match(result.text, /Tenés 45 proveedores en este viaje\./u);
  assert.equal(result.text.match(/proveedor pertenece/gu)?.length, 1, result.text);
  assert.equal(result.state.agent.termination?.reason, "asked_clarification");
  assert.ok(result.state.question);
});

test("PostgreSQL: páginas autorizadas con total real, cursor ligado a la búsqueda y sin datos ajenos", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async () => {
  const prisma = localAgentDatabase();
  const many = (n: number, tag: string) => ({ trips: [{ id: "trip", name: "China", companies: [{ id: "company", name: "Demo" }], suppliers: Array.from({ length: n }, (_, i) => ({ id: `${tag}${i}`, captureId: `${tag}c${i}`, name: `${tag} Proveedor ${String(i).padStart(2, "0")}`, companyId: "company", city: null })) }] });
  const mine = await createAgentEnvironment(prisma, many(23, "Mio"));
  const other = await createAgentEnvironment(prisma, many(5, "Ajeno"));
  try {
    const s = { ...snapshot(""), userId: mine.userId, id: `${mine.prefix}-page` };
    const first = await mine.domain.searchPage!(s, "SUPPLIER", mine.id("trip"), "");
    assert.equal(first.total, 23); assert.equal(first.records.length, 20); assert.ok(first.nextCursor);
    const second = await mine.domain.searchPage!(s, "SUPPLIER", mine.id("trip"), "", undefined, first.nextCursor!);
    assert.equal(second.records.length, 3); assert.equal(second.nextCursor, null);
    assert.deepEqual(new Set([...first.records, ...second.records].map(r => r.id)).size, 23);
    assert.ok([...first.records, ...second.records].every(r => r.name?.startsWith("Mio")));
    await assert.rejects(mine.domain.searchPage!(s, "SUPPLIER", mine.id("trip"), "Mio Proveedor 0", undefined, first.nextCursor!), /cursor/u);
    await assert.rejects(mine.domain.searchPage!(s, "SUPPLIER", other.id("trip"), ""));
  } finally { await prisma.$disconnect(); }
});

test("el registro exige recibos reales, datos consultados y cobertura de cada mensaje", () => {
  const s = snapshot("Cargá el producto Vaso. ¿Cuántos proveedores tengo?"); const state = agentState(s.state);
  const [write, query] = registerIntents(s, state, [{ messageId: "m1", quote: "Cargá el producto Vaso.", label: "Vaso", kind: "CREATE_PRODUCT" }, { messageId: "m1", quote: "¿Cuántos proveedores tengo?", label: "Contar", kind: "QUERY" }]);
  assert.throws(() => registerIntents(s, state, [{ messageId: "m1", quote: "texto inventado", label: "x", kind: "QUERY" }]), /fragmento literal/u);
  assert.throws(() => resolveIntent(s, state, { intentId: write.id, status: "COMPLETED", receiptIds: ["fake"] }), /recibos reales/u);
  assert.throws(() => resolveIntent(s, state, { intentId: write.id, status: "ANSWERED", response: "Listo, guardado" }), /Una escritura requiere/u);
  assert.throws(() => resolveIntent(s, state, { intentId: query.id, status: "ANSWERED", response: "Tenés 3" }), /Consultá primero/u);
  assert.throws(() => assertIntentCoverage(s, state), /Resolvé todos los pedidos/u);
  resolveIntent(s, state, { intentId: write.id, status: "UNAVAILABLE", response: "Falta el proveedor." });
  state.agent.calls.push({ name: "search_suppliers", result: { records: [] }, revision: 1 });
  resolveIntent(s, state, { intentId: query.id, status: "ANSWERED", response: "No tenés proveedores." });
  assert.doesNotThrow(() => assertIntentCoverage(s, state));
});
