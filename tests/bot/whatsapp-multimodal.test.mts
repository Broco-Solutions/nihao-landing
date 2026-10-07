import { ValidationError } from "../../lib/bot/validation.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { BurstReader } from "../../lib/channels/whatsapp/burst-reader.ts";
import { parseVisualReading } from "../../lib/channels/whatsapp/multimodal-reading.ts";
import { buildEvidenceGraph, assertLoadWrite } from "../../lib/channels/whatsapp/evidence-grouping.ts";
import { ingestBurst } from "../../lib/channels/whatsapp/multimodal-ingestion.ts";
import { agentState, type AgentReceipt, type AgentState } from "../../lib/channels/whatsapp/agent-contract.ts";
import { AgentTools } from "../../lib/channels/whatsapp/agent-tools.ts";
import { WhatsAppAgentOrchestrator } from "../../lib/channels/whatsapp/agent-orchestrator.ts";
import { WhatsAppAgentService } from "../../lib/channels/whatsapp/agent-service.ts";
import { createAgentEnvironment, localAgentDatabase } from "../../evals/whatsapp-agent/environment.ts";
import type { BurstMessage, BurstReading, BurstSnapshot, BurstStore } from "../../lib/channels/whatsapp/burst-types.ts";
import type { VisualReading } from "../../lib/channels/whatsapp/ingestion-types.ts";
import type { ExtractionCandidate } from "../../lib/bot/types.ts";

function card(name: string | null, side: VisualReading["side"] = "FRONT", email: string | null = null): VisualReading {
  return { type: "BUSINESS_CARD", side, confidence: 0.97, readability: "readable", visual: "Tarjeta comercial", card: { companyName: name, personName: null, role: null, phones: [], emails: email ? [email] : [], websites: name ? [`https://${name.replace(/\s/gu, "").toLowerCase()}.test`] : [], address: null, visibleText: [], uncertainFields: [], branding: "brand" }, product: null };
}
function product(description: string): VisualReading { return { type: "PRODUCT", side: "UNKNOWN_SIDE", confidence: 0.96, readability: "readable", visual: description, card: null, product: { description, brand: null, model: null, visibleText: [], packaging: false } }; }
function image(id: string, visual: VisualReading): BurstMessage {
  const text = visual.card ? [visual.card.companyName, ...visual.card.emails].filter(Boolean).join("\n") : "";
  return { id, sequence: 1, sentAt: null, envelope: { instance: "test", messageId: id, phone: "123", type: "IMAGE", text: null, media: null, sentAt: null }, reading: { complete: true, visual: visual.product?.description ?? visual.visual, ocr: text, imageKind: visual.type === "PRODUCT" ? "PRODUCT_IMAGE" : visual.type, productImageVerified: visual.type === "PRODUCT", ingestion: { status: "PARSED", stage: "parsed", classification: visual, trustedText: visual.card ? text : undefined, loadIds: [], attempts: [] }, segments: [{ id: `${id}:1`, text, candidate: visual.card ? { extractedFields: { companyName: visual.card.companyName, contact: visual.card.emails[0] ?? null }, contactMethods: visual.card.emails.map((rawText) => ({ type: "EMAIL", rawText })), evidence: [], reviewFields: [], rawSource: { type: "IMAGE_BUSINESS_CARD", text } } : undefined }] } };
}
function audio(id: string, text: string): BurstMessage { return { id, sequence: 1, sentAt: null, envelope: { instance: "test", messageId: id, phone: "123", type: "AUDIO", text: null, media: null, sentAt: null }, reading: { complete: true, transcript: text, ingestion: { status: "PARSED", stage: "parsed", attempts: [], loadIds: [] }, segments: [{ id: `${id}:1`, text }] } }; }
function snapshot(messages: BurstMessage[]): BurstSnapshot { return { id: randomUUID(), instance: "test", phone: "123", userId: "user", revision: messages.length, leaseId: "lease", status: "PROCESSING", state: { tripId: null, groups: [], question: null, pendingRefs: [], controlIds: [] }, messages: messages.map((m, i) => ({ ...m, sequence: i + 1 })) }; }
function group(messages: BurstMessage[]) { const s = snapshot(messages); s.state.ingestion = buildEvidenceGraph(s); return s; }
function target(s: BurstSnapshot, id: string) { return s.state.ingestion!.links.find((l) => l.sourceAssetId === id && l.relationship === "FACTS_FOR")?.targetLoadId; }
const extraction = { async extractReading(text: string): Promise<ExtractionCandidate> { return { extractedFields: { companyName: text.includes("Alfa Tools") ? "Alfa Tools" : null }, evidence: [], reviewFields: [], rawSource: { type: "TEXT", text } }; } };

test("3 frente/reverso misma empresa forma una carga y conserva relación", () => {
  const s = group([image("front", card("Alfa Tools")), image("back", card("Alfa Tools", "BACK"))]);
  assert.equal(s.state.ingestion!.loads.length, 1); assert.deepEqual(s.state.ingestion!.loads[0].assetIds, ["front", "back"]);
  assert.equal(s.state.ingestion!.links.find((l) => l.sourceAssetId === "back")!.relationship, "BACK_OF");
});
test("4 tarjetas consecutivas de empresas distintas no se agrupan", () => { assert.equal(group([image("a", card("Alfa")), image("b", card("Beta"))]).state.ingestion!.loads.length, 2); });
test("5 reverso sin nombre se une por dominio al frente correcto", () => {
  const s = group([image("a", card("Alfa")), image("b", card("Beta")), image("back", card(null, "BACK", "juan@alfa.test"))]);
  assert.equal(s.state.ingestion!.loads.length, 2); assert.deepEqual(s.state.ingestion!.loads.find((l) => l.name === "Alfa")!.assetIds, ["a", "back"]);
});
test("6 branding parecido no une empresas distintas", () => { assert.equal(group([image("a", card("Alfa")), image("b", card("Beta", "BACK"))]).state.ingestion!.loads.length, 2); });
test("7 audio nombra Alfa aunque Beta sea la última tarjeta", () => {
  const s = group([image("a", card("Alfa")), image("b", card("Beta")), audio("audio", "Para Alfa, el MOQ es 500")]);
  assert.equal(target(s, "audio"), s.state.ingestion!.loads.find((l) => l.name === "Alfa")!.id);
  assert.deepEqual(s.state.ingestion!.links.find((l) => l.sourceAssetId === "audio")!.reasons, ["EXPLICIT_SUPPLIER_NAME"]);
});
test("8 referencia ambigua no se asocia y ask_clarification conserva opciones", async () => {
  const s = group([image("a", card("Alfa")), image("b", card("Beta")), audio("audio", "El tercer proveedor tiene MOQ 500 y entrega a 60 días")]);
  assert.equal(s.state.ingestion!.links.find((l) => l.sourceAssetId === "audio" && l.relationship === "POSSIBLY_RELATED")?.targetLoadId, undefined);
  const state = agentState(s.state); s.state = state;
  const tools = new AgentTools({ catalog: { trips: [] }, extraction, domain: {} as never, async checkpoint() {} });
  await tools.execute("ask_clarification", { question: "¿Destino?", options: null, pendingProducts: null }, s, state);
  assert.match(state.question!, /Alfa o Beta/); assert.equal(state.agent.pending?.associationSource?.assetId, "audio");
  const answer = audio("answer", "1"); answer.envelope.type = "TEXT"; answer.envelope.text = "1"; answer.sequence = ++s.revision; s.messages.push(answer);
  s.state.ingestion = buildEvidenceGraph(s);
  assert.equal(target(s, "audio"), state.agent.pending?.options[0].id);
  assert.ok(s.state.ingestion.links.some((l) => l.sourceAssetId === "audio" && l.reasons.includes("CLARIFICATION_ANSWER")));
});
for (const [number, words, expected] of [[9, "El martillo vale USD 3", "martillo"], [15, "El vaso vale USD 3 y MOQ 500", "vaso"], [16, "El martillo tiene MOQ 500", "martillo"]] as const) test(`${number} semántica visual asocia al producto correcto`, () => {
  const s = group([image("vaso", product("vaso de vidrio transparente")), image("martillo", product("martillo de metal")), audio("audio", words)]);
  assert.equal(target(s, "audio"), s.state.ingestion!.loads.find((l) => l.assetIds.includes(expected))!.id);
});
test("10 este producto con una única carga se asocia explícitamente", () => { const s = group([image("vaso", product("vaso de vidrio")), audio("audio", "Este producto tiene MOQ 500")]); assert.equal(target(s, "audio"), s.state.ingestion!.loads[0].id); });
for (const [number, visual] of [[11, card("Alfa")], [12, product("vaso")], [13, { ...product("documento"), type: "DOCUMENT", product: null }], [14, { ...product("no reconocible"), type: "OTHER", confidence: 0.2, readability: "unreadable", product: null }]] as const) test(`${number} clasificación estructurada ${visual.type}`, () => { assert.equal(parseVisualReading(visual).type, visual.type); });
test("schemas visuales rechazan enums/campos extra y contactos inválidos quedan inciertos", () => {
  assert.throws(() => parseVisualReading({ ...card("Alfa"), type: "UNKNOWN" })); assert.throws(() => parseVisualReading({ ...product("vaso"), fob: 30 }));
  const v = card("Alfa"); v.card!.emails = ["invalid"]; v.card!.phones = ["123"];
  const parsed = parseVisualReading(v); assert.deepEqual(parsed.card!.emails, []); assert.deepEqual(parsed.card!.phones, []); assert.ok(parsed.card!.uncertainFields.length >= 2);
});
function visionReader(responses: VisualReading[], ocr = "Alfa Tools\nsales@alfa.test") {
  let calls = 0; const objects = new Map<string, Uint8Array>();
  const reader = new BurstReader({ multimodal: true, storage: { async put(i) { objects.set(i.key, Uint8Array.from(i.body as Uint8Array)); }, async get(k) { return new Response(Uint8Array.from(objects.get(k)!)).body; }, async delete() {}, async signedUrl() { return "private"; } }, client: { async getMedia() { return { bytes: new Uint8Array([0xff, 0xd8, 0xff]), mimeType: "image/jpeg" }; } }, analyzer: { async readImage() { return ocr; }, async segmentAudio(t) { return { segments: [t], confident: true }; } }, transcription: { async transcribe() { throw Error("not audio"); } }, extraction, mistral: { async post(_path, body) {
    const input = JSON.stringify(body); assert.ok(!input.includes("Alfa Tools\\n"), "la visión independiente no recibe OCR ni respuesta anterior");
    return { choices: [{ message: { content: JSON.stringify(responses[Math.min(calls++, responses.length - 1)]) } }] };
  } } });
  const m = image(randomUUID(), responses[0]); m.reading = null; m.envelope.media = { key: { id: m.id, remoteJid: "123@s.whatsapp.net", fromMe: false }, message: { imageMessage: {} } };
  return { reader, m, calls: () => calls };
}
test("19 OCR y visión coincidentes aceptan tarjeta", async () => { const x = visionReader([card("Alfa Tools", "FRONT", "sales@alfa.test")]); const r = await x.reader.read(x.m, async () => {}); assert.equal(r.ingestion?.status, "PARSED"); assert.equal(x.calls(), 1); });
test("20 discrepancia provoca segundo intento independiente y reconciliación", async () => { const x = visionReader([card("Alfa Foods"), card("Alfa Tools", "FRONT", "sales@alfa.test")]); const r = await x.reader.read(x.m, async () => {}); assert.equal(x.calls(), 2); assert.equal(r.ingestion?.classification?.card?.companyName, "Alfa Tools"); assert.equal(r.ingestion?.status, "PARSED"); });
test("21 discrepancia persistente conserva imagen y lecturas para revisión", async () => { const x = visionReader([card("Alfa Foods"), card("Alfa Foods")]); const r = await x.reader.read(x.m, async () => {}); assert.equal(r.ingestion?.status, "NEEDS_REVIEW"); assert.equal(r.ingestion?.error?.type, "AMBIGUOUS_CARD_READING"); assert.equal(r.ingestion?.independentReadings?.length, 2); assert.ok(r.storageKey); });
test("producto visual conserva observaciones sin inventar condiciones comerciales", async () => { const x = visionReader([product("vaso de vidrio transparente")], ""); const r = await x.reader.read(x.m, async () => {}); assert.equal(r.visual, "vaso de vidrio transparente"); assert.equal(r.productImageVerified, true); assert.equal(r.segments[0].candidate, undefined); });
test("audio mal asociado/otra imagen se rechaza en servidor", () => {
  const s = group([image("vaso", product("vaso de vidrio")), image("martillo", product("martillo")), audio("audio", "El vaso vale USD 3")]);
  assert.throws(() => assertLoadWrite(s, { tool: "create_product_draft", tripId: "t", companyId: "c", name: "vaso", evidence: [{ messageId: "martillo", text: "martillo", role: "FACTS" }, { messageId: "audio", text: "El vaso vale USD 3", role: "FACTS" }] as never }), /cargas|imagen|producto/);
});

test("PostgreSQL: batches parciales, agrupación y confirmaciones del pipeline", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async (t) => {
  const prisma = localAgentDatabase();
  const env = await createAgentEnvironment(prisma, { trips: [{ id: "trip", name: "China", companies: [{ id: "company", name: "Broco" }], suppliers: [{ id: "base", captureId: "base-capture", companyId: "company", name: "BaseSupplier", city: null }] }] });
  async function persist(s: BurstSnapshot) {
    await prisma.whatsAppBurst.updateMany({ where: { userId: env.userId }, data: { status: "DONE" } });
    s.userId = env.userId;
    for (const m of s.messages.filter((m) => m.envelope.type === "IMAGE")) {
      m.reading!.storageKey = `stage2/${m.id}`; m.reading!.mimeType = "image/jpeg";
      await env.storage.put({ key: m.reading!.storageKey, body: new Uint8Array([0xff, 0xd8, 0xff, 1]), contentType: "image/jpeg" });
    }
    await env.persist(s);
  }
  function model() {
    let callId = 0;
    return { async post(_path: string, body: unknown) {
      const request = body as { messages: Array<{ role: string; content: string }> };
      const input = JSON.parse(request.messages[1].content);
      const last = request.messages.at(-1)!; const tool = last.role === "tool" ? JSON.parse(last.content) : null;
      const active = input.logicalLoads.find((l: { id: string }) => l.id === input.activeLoadId);
      const name = tool?.evidence ? "create_supplier_draft" : tool?.status === "COMPLETED" ? "finish_turn" : "prepare_evidence";
      const args = name === "prepare_evidence" ? { sources: active.assetIds.map((messageId: string) => ({ messageId, quote: null, role: "FACTS" })) } : name === "create_supplier_draft" ? { notes: null, tripId: env.id("trip"), companyId: env.id("company"), evidenceIds: tool.evidence.map((e: { id: string }) => e.id) } : { response: null, guidance: null };
      return { choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: `stage2-${++callId}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] } }] };
    } };
  }
  try {
    for (const failures of [1, 3]) await t.test(`${failures === 1 ? 1 : 2} batch de 20 confirma los 20 que conservan nombre y contacto pese a ${failures} errores de lectura`, async () => {
      const s = snapshot(Array.from({ length: 20 }, (_, i) => image(randomUUID(), card(`Supplier${i}`, "FRONT", `sales@supplier${i}.test`))));
      await persist(s);
      const failed = new Set(s.messages.slice(0, failures).map((m) => m.id));
      const reads = new Map<string, number>(); let claimed = false; let final: AgentState | undefined; let response = "";
      const store = { async receive() { return true; }, async claim() { if (claimed) return []; claimed = true; return [s]; }, async catalog() { return env.catalog; }, async saveReading(id: string, reading: BurstReading) { await prisma.whatsAppBurstMessage.update({ where: { id }, data: { reading: JSON.parse(JSON.stringify(reading)) } }); }, async finish(_snapshot: BurstSnapshot, state: AgentState, text: string) { final = state; response = text; await env.save(s, state); }, async retry() { assert.fail("Una falla de asset no debe abortar el worker"); }, async flushReplies() {} } as unknown as BurstStore;
      const service = new WhatsAppAgentService({ ingestion: true, store, domain: env.domain, reader: { async read(message) {
        reads.set(message.id, (reads.get(message.id) ?? 0) + 1);
        if (failed.has(message.id)) { message.reading!.ingestion!.stage = "ocr"; throw new ValidationError("Invalid file for this asset"); }
        return message.reading!;
      } }, orchestrator: new WhatsAppAgentOrchestrator({ domain: env.domain, extraction, client: model() }), async save(_id, _revision, _lease, state) { await env.save(s, state); return true; }, async send() { assert.fail("No enviar WhatsApp real"); } });
      await service.processDue(1);
      assert.equal(final?.ingestion?.summary.totalAssets, 20);
      assert.equal(final?.ingestion?.summary.processed, 20);
      assert.equal(final?.ingestion?.summary.needsReview, 0);
      assert.equal(await prisma.whatsAppAgentOperation.count({ where: { burstId: s.id, status: "COMPLETED" } }), 20);
      for (const id of failed) assert.equal(reads.get(id), 1, "terminal errors are not retried");
      const operations = await prisma.whatsAppAgentOperation.findMany({ where: { burstId: s.id } });
      assert.equal(operations.filter(o => (o.result as unknown as AgentReceipt).resourceStatus === "CONFIRMED").length, 20);
      assert.equal(operations.filter(o => (o.result as unknown as AgentReceipt).resourceStatus === "DRAFT").length, 0);
      for (const id of s.messages.map(m => m.id)) {
        const operation = operations.find(o => ((o.result as unknown as AgentReceipt).data?.assetIds as string[] | undefined)?.includes(id) || (o.arguments as { evidence: Array<{ messageId: string }> }).evidence.some(e => e.messageId === id));
        assert.ok(operation);
        const attachments = await prisma.supplierAttachment.findMany({ where: { supplierCaptureId: (operation.result as unknown as AgentReceipt).captureId } });
        assert.ok(attachments.length >= 1);
      }
      assert.match(response, /20 proveedores cargados/u); assert.equal((response.match(/lo cargué como borrador/gu) ?? []).length, 0);
      const persisted = await prisma.whatsAppBurst.findUniqueOrThrow({ where: { id: s.id } }); assert.equal((persisted.state as unknown as AgentState).ingestion?.assets.length, 20);
    });
    await t.test("falla de copia de una tarjeta conserva WRITTEN y no impide guardar la otra", async () => {
      const s = snapshot([image(randomUUID(), card("CopyFailure", "FRONT", "sales@copyfailure.test")), image(randomUUID(), card("GoodCopy", "FRONT", "sales@goodcopy.test"))]);
      await persist(s); const failedKey = s.messages[0].reading!.storageKey; const get = env.storage.get;
      env.storage.get = async (key) => { if (key === failedKey) throw new Error("storage unavailable for one object"); return get(key); };
      let claimed = false; let final: AgentState | undefined; let continuations = 0;
      const store = { async claim() { if (claimed) return []; claimed = true; return [s]; }, async catalog() { return env.catalog; }, async saveReading(id: string, reading: BurstReading) { await prisma.whatsAppBurstMessage.update({ where: { id }, data: { reading: JSON.parse(JSON.stringify(reading)) } }); }, async finish(_snapshot: BurstSnapshot, state: AgentState) { final = state; await env.save(s, state); }, async retry() { continuations++; }, async flushReplies() {} } as unknown as BurstStore;
      try {
        await new WhatsAppAgentService({ ingestion: true, store, domain: env.domain, reader: { async read(m) { return m.reading!; } }, orchestrator: new WhatsAppAgentOrchestrator({ domain: env.domain, extraction, client: model() }), async save(_id, _revision, _lease, state) { await env.save(s, state); return true; }, async send() {} }).processDue(1);
      } finally { env.storage.get = get; }
      assert.equal(final, undefined); assert.equal(continuations, 1);
      assert.equal(s.state.ingestion?.loads.filter((l) => l.status === "PROCESSED").length, 1);
      assert.equal(s.state.ingestion?.loads.filter((l) => l.status === "PENDING_RETRY").length, 1);
      assert.equal(await prisma.whatsAppAgentOperation.count({ where: { burstId: s.id, status: "WRITTEN" } }), 1);
      assert.equal(await prisma.whatsAppAgentOperation.count({ where: { burstId: s.id, status: "COMPLETED" } }), 1);
      claimed = false;
      for (const load of s.state.ingestion!.loads) if (load.operational) load.operational.nextAttemptAt = 0;
      await new WhatsAppAgentService({ ingestion: true, store, domain: env.domain, reader: { async read(m) { return m.reading!; } }, orchestrator: new WhatsAppAgentOrchestrator({ domain: env.domain, extraction, client: model() }), async save(_id, _revision, _lease, state) { await env.save(s, state); return true; }, async send() {} }).processDue(1);
      assert.equal((final as AgentState | undefined)?.ingestion?.summary.processed, 2);
      assert.equal(await prisma.whatsAppAgentOperation.count({ where: { burstId: s.id, status: "COMPLETED" } }), 2);
    });
    await t.test("22 frente con nombre y reverso con contacto crean un único proveedor confirmado", async () => {
      const s = group([image(randomUUID(), card("Alfa")), image(randomUUID(), card(null, "BACK", "juan@alfa.test"))]); await persist(s);
      const state = agentState(s.state); s.state = state;
      const tools = new AgentTools({ domain: env.domain, extraction, catalog: env.catalog, async checkpoint(next) { s.state = next; await env.save(s, next); } });
      const prepared = await tools.execute("prepare_evidence", { sources: [{ messageId: s.messages[0].id, quote: null, role: "FACTS" }] }, s, state) as { evidence: Array<{ id: string }> };
      assert.equal(prepared.evidence.length, 2, "backend incluye el reverso complementario");
      const result = await tools.execute("create_supplier_draft", { tripId: env.id("trip"), companyId: env.id("company"), evidenceIds: prepared.evidence.map((e) => e.id) }, s, state) as AgentReceipt;
      assert.equal(result.resourceStatus, "CONFIRMED"); assert.equal(await prisma.supplier.count({ where: { captureId: result.captureId } }), 1);
      const retry = await tools.execute("create_supplier_draft", { tripId: env.id("trip"), companyId: env.id("company"), evidenceIds: prepared.evidence.map((e) => e.id) }, s, state);
      assert.deepEqual(retry, result);
      assert.equal(result.logicalLoadIds?.length, 1); assert.equal(await prisma.supplierAttachment.count({ where: { supplierCaptureId: result.captureId } }), 2);
    });
    for (const [number, visual, expected] of [[23, product("vaso de vidrio"), "DRAFT"], [24, card("Alfa"), "DRAFT"], [17, card("Alfa"), "DRAFT"], [18, { ...product("documento"), type: "DOCUMENT", product: null }, "DRAFT"], [18, { ...product("genérica"), type: "OTHER", product: null }, "DRAFT"]] as const) await t.test(`${number} nombre + ${visual.type} termina ${expected}`, async () => {
      const m = image(randomUUID(), visual as VisualReading); const a = audio(randomUUID(), "BaseSupplier. Producto vaso");
      const s = group([m, a]); await persist(s); const state = agentState(s.state); s.state = state;
      const tools = new AgentTools({ domain: env.domain, extraction, catalog: env.catalog, async checkpoint(next) { s.state = next; await env.save(s, next); } });
      await tools.execute("get_supplier", { id: env.id("base") }, s, state);
      const prepared = await tools.execute("prepare_evidence", { sources: [{ messageId: a.id, quote: null, role: "FACTS" }, { messageId: m.id, quote: null, role: visual.type === "PRODUCT" ? "FACTS" : "CONTEXT" }] }, s, state) as { evidence: Array<{ id: string }> };
      const result = await tools.execute("create_product_draft", { supplierId: env.id("base"), name: "vaso", evidenceIds: prepared.evidence.map((e) => e.id) }, s, state) as AgentReceipt;
      assert.equal(result.resourceStatus, expected); const persisted = await prisma.supplierProduct.findUniqueOrThrow({ where: { id: result.id } }); assert.equal(persisted.status, expected);
    });
  } finally { await env.cleanup(); await prisma.$disconnect(); }
});

test("fallas determinísticas no reintentan ciegamente; fallo temporal conserva original", async () => {
  const m = image("bad", card("Alfa")); const s = snapshot([m]); let calls = 0;
  await ingestBurst(s, { async read(message) { calls++; message.reading!.ingestion!.stage = "validation"; const { IngestionValidationError } = await import("../../lib/channels/whatsapp/multimodal-reading.ts"); throw new IngestionValidationError("INVALID_VISUAL_FIELDS"); } }, async () => {}, Date.now() + 100_000);
  assert.equal(calls, 1); assert.equal(s.state.ingestion!.assets[0].status, "NEEDS_REVIEW"); assert.equal(s.state.ingestion!.assets[0].error?.retryable, false);
});

test("documento nativo de WhatsApp conserva archivo y requiere revisión, sin confirmar producto", async () => {
  const objects = new Map<string, Uint8Array>();
  const m = audio(randomUUID(), ""); m.envelope.type = "DOCUMENT"; m.reading = null;
  m.envelope.media = { key: { id: m.id, remoteJid: "123@s.whatsapp.net", fromMe: false }, message: { documentMessage: {} } };
  const reader = new BurstReader({ multimodal: true, storage: { async put(i) { objects.set(i.key, Uint8Array.from(i.body as Uint8Array)); }, async get(k) { return new Response(Uint8Array.from(objects.get(k)!)).body; }, async delete() {}, async signedUrl() { return "private"; } }, client: { async getMedia() { return { bytes: new TextEncoder().encode("%PDF-1.4 document"), mimeType: "application/pdf" }; } }, analyzer: { async readImage() { assert.fail("No enviar PDF como imagen"); }, async segmentAudio() { assert.fail("No tratar como audio"); } }, extraction, transcription: { async transcribe() { assert.fail("No transcribir documento"); } }, mistral: { async post() { assert.fail("No inventar lectura de documento no soportado"); } } });
  const r = await reader.read(m, async () => {}); assert.equal(r.ingestion?.status, "NEEDS_REVIEW"); assert.equal(r.ingestion?.classification?.type, "DOCUMENT"); assert.equal(r.productImageVerified, false); assert.ok(objects.has(r.storageKey!));
});
test("alias explícito único no depende del orden; último sin referencia no es un destino", () => {
  const s = group([image("a", card("Alfa Tools")), image("b", card("Beta Tools")), audio("audio", "Para Alfa, el MOQ es 500")]);
  assert.equal(target(s, "audio"), s.state.ingestion!.loads.find((load) => load.name === "Alfa Tools")!.id);
  const ambiguous = group([image("a", card("Alfa Tools")), image("b", card("Alfa Foods")), audio("audio", "Alfa tiene MOQ 500")]);
  assert.ok(ambiguous.state.ingestion!.links.some((l) => l.relationship === "POSSIBLY_RELATED" && l.candidateTargets.length === 2));
});
test("reagrupar frente/reverso ya procesados mantiene ID y no genera duplicados", () => {
  const s = group([image("front", card("Alfa")), image("back", card(null, "BACK", "juan@alfa.test"))]);
  const id = s.state.ingestion!.loads[0].id; s.state.ingestion!.loads[0].status = "PROCESSED"; s.state.ingestion!.loads[0].resourceId = "supplier";
  s.state.ingestion = buildEvidenceGraph(s); assert.equal(s.state.ingestion.loads.length, 1); assert.equal(s.state.ingestion.loads[0].id, id); assert.equal(s.state.ingestion.loads[0].status, "PROCESSED"); assert.equal(s.state.ingestion.loads[0].resourceId, "supplier");
});

test("nombre aislado no permite confirmar con una foto de otro producto", () => {
  const a = audio("name", "BaseSupplier. Producto vaso"); const s = group([image("martillo", product("martillo")), a]);
  assert.throws(() => assertLoadWrite(s, { tool: "create_product_draft", tripId: "t", companyId: "c", name: "vaso", evidence: [{ messageId: "martillo", text: "", role: "FACTS" }, { messageId: "name", text: "BaseSupplier. Producto vaso", role: "FACTS" }] as never }), /asociación|imagen|producto/);
});

test("quotes de un audio con dos productos mantienen asociaciones separadas", () => {
  const a = audio("audio", "Vaso MOQ 500. Martillo FOB USD 3.");
  a.reading!.segments = [{ id: "audio:1", text: "Vaso MOQ 500." }, { id: "audio:2", text: "Martillo FOB USD 3." }];
  const s = group([image("vaso", product("vaso de vidrio")), image("martillo", product("martillo")), a]);
  assert.doesNotThrow(() => assertLoadWrite(s, { tool: "create_product_draft", tripId: "t", companyId: "c", name: "vaso", evidence: [{ messageId: "vaso", text: "", role: "FACTS" }, { messageId: "audio", text: "Vaso MOQ 500.", role: "FACTS" }] as never }));
  assert.throws(() => assertLoadWrite(s, { tool: "create_product_draft", tripId: "t", companyId: "c", name: "vaso", evidence: [{ messageId: "vaso", text: "", role: "FACTS" }, { messageId: "audio", text: a.reading!.transcript!, role: "FACTS" }] as never }), /cargas|imagen|producto/);
});


test("aclaración de reverso ambiguo persiste la elección del frente", () => {
  const s = group([image("a", card("Alfa")), image("b", card("Alfa")), image("back", card(null, "BACK", "juan@alfa.test"))]);
  const state = agentState(s.state); s.state = state;
  const selected = state.ingestion!.loads.find((l) => l.assetIds.includes("b"))!;
  state.agent.pending = { type: "CLARIFICATION", text: "¿Qué frente?", revision: s.revision, options: [{ id: selected.id, label: "segundo frente" }], associationSource: { assetId: "back" } };
  const response = audio("answer", "1"); response.envelope.type = "TEXT"; response.envelope.text = "1"; response.sequence = ++s.revision; s.messages.push(response);
  s.state.ingestion = buildEvidenceGraph(s);
  assert.deepEqual(s.state.ingestion.loads.find((l) => l.id === selected.id)!.assetIds.filter((id) => id !== "answer"), ["b", "back"]);
  assert.ok(!s.state.ingestion.links.some((l) => l.sourceAssetId === "back" && l.relationship === "POSSIBLY_RELATED"));
  state.agent.pending = null; s.state.ingestion = buildEvidenceGraph(s);
  assert.deepEqual(s.state.ingestion.loads.find((l) => l.id === selected.id)!.assetIds.filter((id) => id !== "answer"), ["b", "back"]);
});


test("contacto presente en OCR y omitido por ambas lecturas visuales requiere revisión", async () => {
  const x = visionReader([card("Alfa Tools"), card("Alfa Tools")]);
  const r = await x.reader.read(x.m, async () => {});
  assert.equal(x.calls(), 2); assert.equal(r.ingestion?.status, "NEEDS_REVIEW"); assert.equal(r.ingestion?.error?.type, "AMBIGUOUS_CARD_READING");
});

test("ordinal explícito selecciona el primer proveedor aunque el segundo sea más cercano", () => {
  const s = group([image("first", card("Alfa Tools", "FRONT", "alfa@tools.test")), image("second", card("Beta Tools", "FRONT", "beta@tools.test")), audio("voice", "El primer proveedor nos vende un taladro FOB USD 7")]);
  assert.equal(target(s, "voice"), s.state.ingestion!.loads.find((load) => load.assetIds.includes("first"))!.id);
  assert.equal(s.state.ingestion!.associationAttempts!.find((attempt) => attempt.assetId === "voice")!.reason, "ORDINAL_SUPPLIER_REFERENCE");
});

test("sin referencia usa el proveedor anterior más próximo y conserva la asociación de imágenes de producto", () => {
  const s = group([image("first", card("Alfa Tools")), image("second", card("Beta Tools")), image("product", product("Taladro")), audio("voice", "Este producto cuesta FOB USD 7")]);
  const beta = s.state.ingestion!.loads.find((load) => load.assetIds.includes("second"))!;
  const item = s.state.ingestion!.loads.find((load) => load.type === "PRODUCT")!;
  assert.equal(item.supplierContext!.loadId, beta.id);
  assert.equal(item.supplierContext!.reason, "NEAREST_PREVIOUS_SUPPLIER");
});

test("ordinal inexistente conserva la duda; no lo reemplaza por el último proveedor", () => {
  const s = group([image("first", card("Alfa Tools")), audio("voice", "El tercer proveedor nos vende un taladro FOB USD 7")]);
  assert.equal(target(s, "voice"), undefined);
  assert.equal(s.state.ingestion!.associationAttempts!.find((attempt) => attempt.assetId === "voice")!.clarificationRequired, true);
});

 test("audio nombra al proveedor y al producto sin perder el vínculo de su imagen", () => {
  const s = group([image("first", card("Alfa Tools")), image("second", card("Beta Tools")), image("product", product("Taladro")), audio("voice", "El primer proveedor nos vende el taladro FOB USD 7")]);
  const first = s.state.ingestion!.loads.find((load) => load.assetIds.includes("first"))!;
  const item = s.state.ingestion!.loads.find((load) => load.type === "PRODUCT")!;
  assert.equal(target(s, "voice"), item.id);
  assert.equal(item.supplierContext!.loadId, first.id);
  assert.equal(item.supplierContext!.reason, "ORDINAL_SUPPLIER_REFERENCE");
});
