import test from "node:test";
import assert from "node:assert/strict";
import { AgentTools } from "../../lib/channels/whatsapp/agent-tools.ts";
import { AgentToolError, agentState, type AgentDomain, type AgentEvidence, type AgentState } from "../../lib/channels/whatsapp/agent-contract.ts";
import { WhatsAppAgentService } from "../../lib/channels/whatsapp/agent-service.ts";
import { assertLoadWrite, buildEvidenceGraph, recordLoadReceipt } from "../../lib/channels/whatsapp/evidence-grouping.ts";
import type { BurstSnapshot, BurstStore } from "../../lib/channels/whatsapp/burst-types.ts";
import type { WhatsAppAgentOrchestrator } from "../../lib/channels/whatsapp/agent-orchestrator.ts";

const extraction = { async extractReading(text: string) { return { extractedFields: {}, evidence: [], reviewFields: [], rawSource: { type: "TEXT" as const, text } }; } };
const domain: AgentDomain = {
  async search() { return []; }, async get() { throw Error("unused"); }, async write() { throw Error("unused"); },
  async pending() { return []; }, async resolve() { throw Error("unused"); }, async receipts() { return []; }, async displayed() {},
};
function productSnapshot(id = "burst"): BurstSnapshot {
  const s: BurstSnapshot = {
    id, instance: "eval", phone: "123", userId: "user", revision: 1, status: "PROCESSING", leaseId: "lease",
    state: { tripId: "trip", operationalContext: { tripId: "trip", companyId: "company" }, groups: [], question: null, controlIds: [], pendingRefs: [] },
    messages: [{ id: "camera", sequence: 1, sentAt: null,
      envelope: { instance: "eval", phone: "123", messageId: "camera", type: "IMAGE", text: "Camara con usb", media: null, sentAt: null },
      reading: { complete: true, storageKey: "original-camera", imageKind: "PRODUCT_IMAGE", productImageVerified: true, ocr: "chouze", segments: [{ id: "camera:1", text: "chouze\nCamara con usb" }],
        ingestion: { status: "PARSED", stage: "parsed", attempts: [], loadIds: [], classification: { type: "PRODUCT", side: "UNKNOWN_SIDE", confidence: 0.98, readability: "readable", visual: "Visible camera", card: null, product: { description: "Visible camera", brand: null, model: null, visibleText: [], packaging: false } } } },
    }],
  };
  s.state = agentState(s.state); s.state.ingestion = buildEvidenceGraph(s); return s;
}
function tools(d = domain) { return new AgentTools({ domain: d, extraction, catalog: { trips: [] }, async checkpoint() {} }); }

test("historical message ID is a correctable reference error, not a false unreadable-image diagnosis", async () => {
  const s = productSnapshot(), state = s.state as AgentState, agent = tools();
  await assert.rejects(agent.execute("prepare_evidence", { sources: [{ messageId: "previous-card", quote: "chouze\nCamara con usb", role: "FACTS" }] }, s, state), (error: unknown) => {
    assert.ok(error instanceof AgentToolError); assert.equal(error.code, "INVALID_MESSAGE_ID"); assert.match(error.message, /camera/u); assert.match(error.message, /reintentá/u); return true;
  });
  assert.equal(state.agent.evidence.length, 0);
  const result = await agent.execute("prepare_evidence", { sources: [{ messageId: "camera", quote: "Camara con usb", role: "FACTS" }] }, s, state) as { evidence: AgentEvidence[] };
  assert.equal(result.evidence[0].messageId, "camera"); assert.equal(result.evidence[0].text, "Camara con usb");
  assert.equal(s.state.ingestion!.loads[0].status, "GROUPED");
});

test("a real image-quality failure still reports ASSET_NEEDS_REVIEW", async () => {
  const s = productSnapshot(); s.state.ingestion!.assets[0].status = "NEEDS_REVIEW";
  await assert.rejects(tools().execute("prepare_evidence", { sources: [{ messageId: "camera", quote: null, role: "FACTS" }] }, s, s.state as AgentState), (error: unknown) => error instanceof AgentToolError && error.code === "ASSET_NEEDS_REVIEW");
});

test("preserved supplier receipt cannot complete a product load or replace its resource", () => {
  const s = productSnapshot(), state = s.state as AgentState, load = state.ingestion!.loads[0];
  recordLoadReceipt(state, { operationId: "wrong", tool: "create_supplier_draft", id: "empty-supplier-capture", status: "COMPLETED", logicalLoadIds: [load.id], data: { preservedImageLoad: true } });
  assert.equal(load.status, "GROUPED"); assert.equal(load.resourceId, undefined); assert.equal(state.ingestion!.assets[0].status, "GROUPED");
  recordLoadReceipt(state, { operationId: "correct", tool: "create_product_draft", id: "product", status: "COMPLETED", logicalLoadIds: [load.id] });
  assert.equal(load.resourceId, "product"); assert.equal(load.status, "PROCESSED"); assert.equal(state.ingestion!.assets[0].status, "PROCESSED");
});

test("a product without a resolved destination retains its original and never creates a fallback supplier", async () => {
  const snapshots = [productSnapshot("first"), productSnapshot("next-independent-product")];
  let claims = 0, runs = 0; const finished: BurstSnapshot[] = [];
  const d: AgentDomain = { ...domain, async persistImageLoad() { assert.fail("Product images must not become supplier captures"); } };
  const store = {
    async claim() { return claims < snapshots.length ? [snapshots[claims++]] : []; },
    async catalog() { return { trips: [{ id: "trip", name: "China", companies: [{ id: "company", name: "Broco" }] }] }; },
    async saveReading() {}, async finish(s: BurstSnapshot, state: AgentState) { s.state = state; finished.push(s); },
    async retry() { assert.fail("A missing supplier is not an infrastructure failure"); }, async flushReplies() {},
  } as unknown as BurstStore;
  const orchestrator = { async run(s: BurstSnapshot) { runs++; const state = s.state as AgentState; state.question = "Producto conservado sin destino"; state.agent.pending = { type: "CLARIFICATION", text: state.question, options: [], revision: 1 }; return { state, text: state.question }; } } as unknown as WhatsAppAgentOrchestrator;
  await new WhatsAppAgentService({ ingestion: true, store, domain: d, orchestrator, async save() { return true; }, reader: { async read(message) { return message.reading!; } }, async send() {} }).processDue(2);
  assert.equal(runs, 2); assert.equal(finished.length, 2);
  for (const s of finished) {
    assert.equal(s.messages[0].reading!.storageKey, "original-camera");
    assert.equal(s.state.ingestion!.loads[0].resourceId, undefined); assert.equal(s.state.ingestion!.loads[0].type, "PRODUCT");
    assert.equal((s.state as AgentState).agent.receipts.length, 0);
  }
});

test("pending evidence requires domain authorization, preserves provenance and validates literal quotes", async () => {
  const s = productSnapshot(), state = s.state as AgentState;
  const base: AgentEvidence = { id: "historical-facts", pendingId: "pending-caption", messageId: "previous-card", start: 7, end: 23, text: "FOB 50 MOQ 15000", role: "FACTS", candidate: await extraction.extractReading("FOB 50 MOQ 15000") };
  const d: AgentDomain = { ...domain, async preparePendingEvidence(_s, id) { assert.equal(id, "pending-caption"); return base; } };
  const agent = tools(d);
  const result = await agent.execute("prepare_evidence", { sources: [{ messageId: "pending-caption", quote: null, role: "FACTS" }] }, s, state) as { evidence: AgentEvidence[] };
  assert.equal(result.evidence[0].pendingId, "pending-caption"); assert.equal(result.evidence[0].messageId, "previous-card"); assert.equal(result.evidence[0].start, 7);
  const fragment = await agent.execute("prepare_evidence", { sources: [{ messageId: "pending-caption", quote: "MOQ 15000", role: "FACTS" }] }, s, state) as { evidence: AgentEvidence[] };
  assert.equal(fragment.evidence[0].text, "MOQ 15000"); assert.equal(fragment.evidence[0].start, 14); assert.equal(fragment.evidence[0].pendingId, "pending-caption");
  assert.doesNotThrow(() => assertLoadWrite(s, { tool: "create_product_draft", tripId: "trip", companyId: "company", targetId: "supplier", evidence: result.evidence }));
  const withoutAuthorization = result.evidence.map(evidence => { const copy = { ...evidence }; delete copy.pendingId; return copy; });
  assert.throws(() => assertLoadWrite(s, { tool: "create_product_draft", tripId: "trip", companyId: "company", targetId: "supplier", evidence: withoutAuthorization }), (error: unknown) => error instanceof AgentToolError && error.code === "ASSET_NEEDS_REVIEW");
  await assert.rejects(agent.execute("prepare_evidence", { sources: [{ messageId: "pending-caption", quote: "USD 999", role: "FACTS" }] }, s, state), (error: unknown) => error instanceof AgentToolError && error.code === "INVALID_QUOTE");
  await assert.rejects(tools({ ...domain, async preparePendingEvidence() { return null; } }).execute("prepare_evidence", { sources: [{ messageId: "unowned-pending", quote: null, role: "FACTS" }] }, s, state), (error: unknown) => error instanceof AgentToolError && error.code === "INVALID_MESSAGE_ID");
});
