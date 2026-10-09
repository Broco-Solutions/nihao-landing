import test from "node:test";
import assert from "node:assert/strict";
import { BurstReader } from "../../lib/channels/whatsapp/burst-reader.ts";
import { observedProduct } from "../../lib/channels/whatsapp/product-observation.ts";
import { readingNeedsReview } from "../../lib/channels/whatsapp/multimodal-reading.ts";
import { buildEvidenceGraph, nextIngestionQuestion } from "../../lib/channels/whatsapp/evidence-grouping.ts";
import { AgentTools } from "../../lib/channels/whatsapp/agent-tools.ts";
import { agentState, type AgentDomain } from "../../lib/channels/whatsapp/agent-contract.ts";
import type { BurstMessage, BurstSnapshot } from "../../lib/channels/whatsapp/burst-types.ts";
import type { VisualReading } from "../../lib/channels/whatsapp/ingestion-types.ts";

const visual: VisualReading = { type: "PRODUCT", confidence: 1, readability: "unreadable", side: "UNKNOWN_SIDE", visual: "mueble modular de cocina", card: null, product: { description: "mueble modular de cocina con cajones y superficie blanca", brand: null, model: null, visibleText: [], packaging: false } };
function image(): BurstMessage { return { id: "image", sequence: 1, sentAt: null, envelope: { instance: "test", phone: "123", messageId: "image", type: "IMAGE", text: null, sentAt: null, media: { key: { id: "image", remoteJid: "123@s.whatsapp.net", fromMe: false }, message: { imageMessage: {} } } }, reading: null }; }
function snapshot(messages: BurstMessage[]): BurstSnapshot { return { id: "regression", instance: "test", phone: "123", userId: "user", leaseId: "lease", revision: messages.length, status: "PROCESSING", state: { tripId: "trip", groups: [], question: null, controlIds: [], pendingRefs: [] }, messages }; }
const extraction = { async extractReading(text: string) { return { extractedFields: {}, evidence: [], reviewFields: [], rawSource: { type: "TEXT" as const, text } }; } };

test("real incident: identifiable product with unreadable text remains usable after BurstReader", async () => {
  const objects = new Map<string, Uint8Array>();
  const reader = new BurstReader({ multimodal: true, storage: { async put(i) { objects.set(i.key, Uint8Array.from(i.body as Uint8Array)); }, async get(key) { return new Response(Uint8Array.from(objects.get(key)!)).body; }, async delete() {}, async signedUrl() { return "private"; } }, client: { async getMedia() { return { bytes: new Uint8Array([255, 216, 255]), mimeType: "image/jpeg" }; } }, analyzer: { async readImage() { return "![img-0.jpeg](img-0.jpeg)\n\nfow"; }, async segmentAudio(text) { return { segments: [text], confident: true }; } }, transcription: { async transcribe() { assert.fail("no audio"); } }, extraction, mistral: { async post() { return { choices: [{ message: { content: JSON.stringify(visual) } }] }; } } });
  const message = image(); message.reading = await reader.read(message, async () => {});
  assert.equal(message.reading.productImageVerified, true);
  assert.equal(message.reading.ingestion!.status, "PARSED");
  assert.equal(message.reading.ingestion!.classification!.readability, "unreadable", "retain the original classifier observation");
  assert.equal(observedProduct(message)?.name, visual.product!.description);
  const s = snapshot([message]); s.state.ingestion = buildEvidenceGraph(s);
  assert.equal(nextIngestionQuestion(s), null);
});

test("low confidence, ambiguous object, unreadable card and document retain review", () => {
  for (const v of [{ ...visual, confidence: .84 }, { ...visual, readability: "ambiguous" as const }, { ...visual, product: { ...visual.product!, description: "" } }, { ...visual, type: "DOCUMENT" as const, product: null }, { ...visual, type: "BUSINESS_CARD" as const, product: null }]) {
    assert.equal(readingNeedsReview({ segments: [], ingestion: { classification: v, status: "CLASSIFIED", stage: "vision", attempts: [], loadIds: [] } }), true);
  }
});

function reviewCase() {
  const photo = image(); photo.reading = { complete: true, segments: [], imageKind: "PRODUCT_IMAGE", ingestion: { classification: { ...visual, readability: "ambiguous" }, status: "NEEDS_REVIEW", stage: "vision", error: { type: "UNCERTAIN_VISUAL_READING", retryable: false, stage: "vision" }, attempts: [], loadIds: [] } };
  const s = snapshot([photo, { id: "moq", sequence: 2, sentAt: null, envelope: { instance: "test", phone: "123", messageId: "moq", type: "TEXT", text: "Moq 10", media: null, sentAt: null }, reading: { complete: true, segments: [] } }]);
  const state = agentState(s.state); s.state = state; state.ingestion = buildEvidenceGraph(s);
  const domain: AgentDomain = { async get() { assert.fail("not needed"); }, async search() { return []; }, async write() { assert.fail("not needed"); }, async pending() { return []; }, async receipts() { return state.agent.receipts; }, async resolve() { assert.fail("not needed"); }, async displayed() {} };
  return { s, state, tools: new AgentTools({ domain, extraction, catalog: { trips: [] }, async checkpoint() {} }) };
}

test("review cannot bypass validation of a declared preservation with no real receipt", async () => {
  const f = reviewCase();
  const result = await f.tools.execute("prepare_evidence", { sources: [{ messageId: "moq", quote: null, role: "FACTS" }] }, f.s, f.state) as { evidence: { id: string }[] };
  await assert.rejects(f.tools.execute("finish_turn", { response: "MOQ preservado", outcomes: [{ messageId: "moq", action: "PRESERVE_PRODUCT_FACTS", evidenceIds: result.evidence.map(e => e.id) }] }, f.s, f.state), { code: "UNFINISHED_OPERATION" });
  assert.equal(f.state.agent.pending, null);
});

test("review asks what is missing instead of generic resend/retry instructions", () => {
  const f = reviewCase(); const question = nextIngestionQuestion(f.s)!.question;
  assert.match(question, /mueble modular/);
  assert.match(question, /qué producto|identificar el producto/iu);
  assert.doesNotMatch(question, /lectura pendiente o dudosa|Reenviá las ilegibles|fallas temporales/u);
});

test("completed preservation survives an unrelated image clarification", async () => {
  const f = reviewCase();
  const result = await f.tools.execute("prepare_evidence", { sources: [{ messageId: "moq", role: "FACTS" }] }, f.s, f.state) as { evidence: { id: string }[] };
  const ids = result.evidence.map(e => e.id);
  f.state.agent.receipts.push({ id: "pending", operationId: "preserve", tool: "preserve_product_facts", status: "COMPLETED", evidenceIds: ids, completedRevision: f.s.revision });
  await f.tools.execute("finish_turn", { response: null, outcomes: [{ messageId: "moq", action: "PRESERVE_PRODUCT_FACTS", evidenceIds: ids }] }, f.s, f.state);
  assert.equal(f.state.agent.receipts[0].status, "COMPLETED");
  assert.match(f.state.agent.pending!.text, /qué producto/iu);
});

test("only retryable failures offer retry and independent review questions remain separate", () => {
  const f = reviewCase();
  const asset = f.state.ingestion!.assets[0];
  asset.error = { type: "PROVIDER_UNAVAILABLE_AFTER_RETRIES", retryable: true, stage: "vision" };
  assert.match(nextIngestionQuestion(f.s)!.question, /error temporal[\s\S]*reintentar/u);
  asset.classification = "BUSINESS_CARD";
  asset.error = { type: "UNCERTAIN_VISUAL_READING", retryable: false, stage: "vision" };
  assert.match(nextIngestionQuestion(f.s)!.question, /nombre o los contactos/u);
  assert.doesNotMatch(nextIngestionQuestion(f.s)!.question, /reintentar/u);
});

import { randomUUID } from "node:crypto";
import { createAgentEnvironment, localAgentDatabase } from "../../evals/whatsapp-agent/environment.ts";
import { commercialTypoFacts } from "../../lib/bot/extraction/commercial-typos.ts";
import type { ExtractionCandidate } from "../../lib/bot/types.ts";
import type { AgentReceipt } from "../../lib/channels/whatsapp/agent-contract.ts";

const termsExtraction = { async extractReading(text: string): Promise<ExtractionCandidate> {
  const candidate: ExtractionCandidate = { extractedFields: /^Moq 10$/iu.test(text) ? { moq: { quantity: 10, unit: null, notes: null, rawText: text } } : {}, evidence: [], reviewFields: [], rawSource: { type: "TEXT", text } };
  return commercialTypoFacts(text, candidate);
} };

function incidentMessages() {
  const photo = image(); photo.id = randomUUID(); photo.envelope.messageId = photo.id;
  photo.reading = { complete: true, productImageVerified: true, imageKind: "PRODUCT_IMAGE", ocr: "", visual: visual.product!.description, segments: [], ingestion: { status: "PARSED", stage: "parsed", attempts: [], loadIds: [], classification: visual } };
  return [photo, ...["Fon 15", "Moq 10"].map((text, i): BurstMessage => { const id = randomUUID(); return { id, sequence: i + 2, sentAt: null, envelope: { instance: "test", phone: "123", messageId: id, type: "TEXT", text, media: null, sentAt: null }, reading: { complete: true, segments: [{ id: `${id}:1`, text }] } }; })];
}

test("bare grounded conditions after a product photo form one load without a same-burst supplier card", async () => {
  const messages = incidentMessages();
  for (const message of messages.slice(1)) message.reading!.segments[0].candidate = await termsExtraction.extractReading(message.envelope.text!);
  const s = snapshot(messages); const graph = buildEvidenceGraph(s); s.state.ingestion = graph;
  assert.equal(graph.loads.length, 1);
  assert.deepEqual(graph.loads[0].assetIds, messages.map(m => m.id));
  assert.equal(nextIngestionQuestion(s), null);
});

test("PostgreSQL: LEOCH + original photo + Fon 15 + MOQ 10 creates one grounded product, retries without duplicates", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async () => {
  const db = localAgentDatabase();
  const env = await createAgentEnvironment(db, { trips: [{ id: "trip", name: "China", companies: [{ id: "company", name: "Broco" }], suppliers: [{ id: "leoch", captureId: "leoch-capture", name: "LEOCH RENEWABLE ENERGY CO., LTD", companyId: "company", city: null }] }] });
  try {
    const messages = incidentMessages();
    for (const message of messages.slice(1)) message.reading!.segments[0].candidate = await termsExtraction.extractReading(message.envelope.text!);
    const s = snapshot(messages); s.id = randomUUID(); s.userId = env.userId; s.phone = "5491112345678"; s.state.tripId = env.id("trip");
    const state = agentState(s.state); s.state = state; state.operationalContext = { tripId: env.id("trip"), companyId: env.id("company") };
    const photo = messages[0]; photo.reading!.storageKey = `regression/${photo.id}`; photo.reading!.mimeType = "image/jpeg";
    await env.storage.put({ key: photo.reading!.storageKey, body: new Uint8Array([255, 216, 255, 1]), contentType: "image/jpeg" });
    await env.persist(s);
    await env.domain.selectConversationTarget(s, "SUPPLIER", env.id("leoch"));
    assert.deepEqual((await env.domain.resolveConversationReference(s, "SUPPLIER")).map(r => r.id), [env.id("leoch")]);
    state.ingestion = buildEvidenceGraph(s);
    const tools = new AgentTools({ domain: env.domain, extraction: termsExtraction, catalog: env.catalog, async checkpoint(next) { await env.save(s, next); } });
    await tools.execute("get_supplier", { id: env.id("leoch") }, s, state);
    const prepared = await tools.execute("prepare_evidence", { sources: messages.map(m => ({ messageId: m.id, role: "FACTS", quote: null })) }, s, state) as { evidence: { id: string }[] };
    const args = { supplierId: env.id("leoch"), name: visual.product!.description, evidenceIds: prepared.evidence.map(e => e.id) };
    const receipt = await tools.execute("create_product_draft", args, s, state) as AgentReceipt;
    assert.equal(receipt.status, "COMPLETED");
    assert.deepEqual(await tools.execute("create_product_draft", args, s, state), receipt);
    const product = await db.supplierProduct.findUniqueOrThrow({ where: { id: receipt.id }, include: { images: true } });
    assert.equal(product.supplierId, env.id("leoch")); assert.equal(Number(product.fobAmount), 15); assert.equal(product.fobCurrency, null); assert.equal(product.fobUnit, null); assert.equal(product.fobRawText, "Fon 15"); assert.equal(product.moqQuantity, 10); assert.equal(product.images.length, 1);
    assert.equal(await db.supplierProduct.count({ where: { supplierId: env.id("leoch") } }), 1);
    await tools.execute("finish_turn", { response: null, outcomes: messages.slice(1).map(m => ({ messageId: m.id, action: "CREATE_PRODUCT", evidenceIds: state.agent.evidence.filter(e => e.messageId === m.id).map(e => e.id) })) }, s, state);
    assert.equal(state.agent.pending, null);
  } finally { await env.cleanup(); await db.$disconnect(); }
});

test("an explicit unresolved quotation or a new supplier card cannot inherit the photo's conditions", async () => {
  for (const mode of ["quote", "card", "new-product"] as const) {
    const messages = incidentMessages();
    if (mode === "quote") messages[1].envelope.quotedMessageId = "unknown-external-message";
    if (mode === "card") {
      const card = image(); card.id = randomUUID(); card.envelope.messageId = card.id; card.sequence = 2;
      card.reading = { complete: true, segments: [], imageKind: "BUSINESS_CARD", ingestion: { status: "PARSED", stage: "parsed", attempts: [], loadIds: [], classification: { type: "BUSINESS_CARD", side: "FRONT", confidence: 1, readability: "readable", visual: "Tarjeta Beta", product: null, card: { companyName: "Beta", personName: null, role: null, emails: ["beta@example.test"], phones: [], websites: [], address: null, visibleText: [], uncertainFields: [], branding: null } } } };
      messages.splice(1, 0, card); messages.forEach((m, i) => { m.sequence = i + 1; });
    }
    if (mode === "new-product") { messages[1].envelope.text = "Otro producto: escritorio FOB 15"; messages[1].reading!.segments[0].text = messages[1].envelope.text; }
    for (const message of messages.filter(m => m.envelope.type === "TEXT")) message.reading!.segments[0].candidate = await termsExtraction.extractReading(message.envelope.text!);
    const s = snapshot(messages); const graph = buildEvidenceGraph(s);
    const photoLoad = graph.loads.find(l => l.type === "PRODUCT")!;
    const condition = messages.find(m => m.envelope.type === "TEXT")!;
    assert.ok(!photoLoad.assetIds.includes(condition.id), mode);
  }
});

import { WhatsAppAgentOrchestrator } from "../../lib/channels/whatsapp/agent-orchestrator.ts";

test("the actual orchestrator offers creation for the incident and resumes its terminal checkpoint without another model call", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async () => {
  const db = localAgentDatabase();
  const env = await createAgentEnvironment(db, { trips: [{ id: "trip", name: "China", companies: [{ id: "company", name: "Broco" }], suppliers: [{ id: "leoch", captureId: "capture", name: "LEOCH RENEWABLE ENERGY CO., LTD", companyId: "company", city: null }] }] });
  try {
    const messages = incidentMessages();
    for (const m of messages.slice(1)) m.reading!.segments[0].candidate = await termsExtraction.extractReading(m.envelope.text!);
    const s = snapshot(messages); s.id = randomUUID(); s.userId = env.userId; s.phone = "5491112345678";
    s.state = agentState(s.state); s.state.tripId = env.id("trip");
    const photo = messages[0]; photo.reading!.storageKey = `loop/${photo.id}`; photo.reading!.mimeType = "image/jpeg";
    await env.storage.put({ key: photo.reading!.storageKey, body: new Uint8Array([255, 216, 255, 1]), contentType: "image/jpeg" });
    await env.persist(s); await env.domain.selectConversationTarget(s, "SUPPLIER", env.id("leoch"));
    s.state.ingestion = buildEvidenceGraph(s);
    let rounds = 0;
    const runner = new WhatsAppAgentOrchestrator({ domain: env.domain, extraction: termsExtraction, client: { async post(_path, body) {
      const input = body as { tools: { function: { name: string } }[] };
      const state = agentState(s.state);
      const calls: [string, unknown][] = [
        ["resolve_recent_reference", { kind: "SUPPLIER" }],
        ["get_supplier", { id: env.id("leoch") }],
        ["prepare_evidence", { sources: messages.map(m => ({ messageId: m.id, quote: null, role: "FACTS" })) }],
        ["create_product_draft", { supplierId: env.id("leoch"), name: visual.product!.description, notes: null, evidenceIds: state.agent.evidence.map(e => e.id) }],
        ["finish_turn", { response: null, guidance: false, outcomes: messages.slice(1).map(m => ({ messageId: m.id, action: "CREATE_PRODUCT", evidenceIds: state.agent.evidence.filter(e => e.messageId === m.id).map(e => e.id) })) }],
      ];
      assert.ok(rounds < calls.length, JSON.stringify(state.agent.calls));
      const [name, args] = calls[rounds++];
      assert.ok(input.tools.some(t => t.function.name === name), `${name} must be offered`);
      return { choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: `call-${rounds}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] } }] };
    } } });
    const save = async (state: ReturnType<typeof agentState>) => { s.state = state; await env.save(s, state); };
    const result = await runner.run(s, env.catalog, save);
    assert.equal(rounds, 5); assert.equal(result.state.agent.pending, null); assert.equal(result.state.agent.receipts.filter(r => r.tool === "create_product_draft").length, 1);
    assert.match(result.text, /1 producto cargado/u); assert.doesNotMatch(result.text, /Necesito confirmar|reintentar|reenvi/iu);
    const again = await runner.run(s, env.catalog, save);
    assert.equal(rounds, 5); assert.equal(again.text, result.text);
    const products = await db.supplierProduct.findMany({ where: { supplierId: env.id("leoch") } });
    assert.equal(products.length, 1); assert.equal(Number(products[0].fobAmount), 15); assert.equal(products[0].moqQuantity, 10);
  } finally { await env.cleanup(); await db.$disconnect(); }
});
