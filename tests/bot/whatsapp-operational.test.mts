import test from "node:test";
import assert from "node:assert/strict";
import { BurstReader } from "../../lib/channels/whatsapp/burst-reader.ts";
import { WhatsAppAgentService } from "../../lib/channels/whatsapp/agent-service.ts";
import { WhatsAppAgentOrchestrator } from "../../lib/channels/whatsapp/agent-orchestrator.ts";
import { AgentCheckpoint, type AgentDomain, type AgentReceipt, type AgentState } from "../../lib/channels/whatsapp/agent-contract.ts";
import { operationId } from "../../lib/channels/whatsapp/prisma-agent-domain.ts";
import { failure, Limiter, observeResponse, ProviderHttpError, safeDeadline } from "../../lib/channels/whatsapp/operational-runtime.ts";
import { ProviderGate, resilientClient, CircuitOpenError } from "../../lib/channels/whatsapp/provider-resilience.ts";
import type { BurstReading, BurstSnapshot, BurstStore } from "../../lib/channels/whatsapp/burst-types.ts";
import type { VisualReading } from "../../lib/channels/whatsapp/ingestion-types.ts";
import { ReplayTape, IdentityMap } from "../../evals/whatsapp-replay/tape.ts";

function setEnv(t: import("node:test").TestContext, name: string, value: string) { const old = process.env[name]; process.env[name] = value; t.after(() => { if (old === undefined) delete process.env[name]; else process.env[name] = old; }); }
const visual = (i: number): VisualReading => ({ type: "BUSINESS_CARD", side: "FRONT", confidence: 0.97, readability: "readable", visual: `Card ${i}`, card: { companyName: `Supplier ${i}`, personName: null, role: null, phones: [], emails: [], websites: [], address: null, visibleText: [], uncertainFields: [], branding: null }, product: null });
const catalog = { trips: [{ id: "trip", name: "China", companies: [{ id: "company", name: "Broco" }] }] };
const extraction = { async extractReading(text: string) { return { extractedFields: { companyName: text }, evidence: [], reviewFields: [], rawSource: { type: "TEXT" as const, text } }; } };

function harness(count: number, advance: () => void, options: { permanent?: number[]; transient?: number; network?: number; circuit?: number; crash?: string; tape?: ReplayTape } = {}) {
  const persisted: BurstSnapshot = { id: "burst", instance: "test", phone: "123", userId: "user", revision: count, status: "PROCESSING", leaseId: "lease", state: { tripId: null, groups: [], question: null, pendingRefs: [], controlIds: [] }, messages: Array.from({ length: count }, (_, i) => ({ id: `asset-${i + 1}`, sequence: i + 1, sentAt: null, envelope: { instance: "test", phone: "123", messageId: `asset-${i + 1}`, type: "IMAGE", text: null, sentAt: null, media: { key: { id: `asset-${i + 1}`, remoteJid: "123@s.whatsapp.net", fromMe: false }, message: {} } }, reading: null })) };
  const objects = new Map<string, Uint8Array>(); const operations = new Map<string, AgentReceipt>();
  const counts = { download: 0, ocr: 0, vision: 0, write: 0, runs: 0, checkpoints: 0, retries: 0 }; let finished = false; let sent = ""; let crashed = false; let transient = false;
  const domain: AgentDomain = {
    async receipts() { return [...operations.values()]; }, async pending() { return []; }, async displayed() {}, async search() { return []; }, async get() { throw Error("unused"); }, async resolve() { throw Error("unused"); },
    async write(s, input) {
      const id = operationId(s, input);
      let receipt = operations.get(id);
      if (!receipt) {
        counts.write++;
        receipt = { operationId: id, id: `supplier-${id}`, captureId: `capture-${id}`, tool: input.tool, status: "COMPLETED", name: input.evidence[0]?.candidate.extractedFields.companyName ?? null, tripId: input.tripId, companyId: input.companyId, evidenceIds: input.evidence.map((e) => e.id), logicalLoadIds: [s.state.ingestion!.activeLoadId!] };
        operations.set(id, structuredClone(receipt));
      }
      if (options.crash === "write" && !crashed) { crashed = true; throw new AgentCheckpoint(); }
      return structuredClone(receipt);
    },
  };
  let call = 0;
  const model = { async post(_path: string, body: unknown) {
    const request = body as { messages: Array<{ role: string; content: string }> };
    const initial = JSON.parse(request.messages[1].content); const last = request.messages.at(-1)!; const result = last.role === "tool" ? JSON.parse(last.content) : null;
    const active = initial.logicalLoads.find((l: { id: string }) => l.id === initial.activeLoadId);
    const name = result?.evidence ? "create_supplier_draft" : result?.status === "COMPLETED" ? "finish_turn" : "prepare_evidence";
    const args = name === "prepare_evidence" ? { sources: active.assetIds.map((messageId: string) => ({ messageId, quote: null, role: "FACTS" })) } : name === "create_supplier_draft" ? { notes: null, tripId: "trip", companyId: "company", evidenceIds: result.evidence.map((e: { id: string }) => e.id) } : { response: null, guidance: null };
    return { choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: `call-${++call}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] } }] };
  } };
  function reader() {
    return new BurstReader({ multimodal: true,
      storage: { async put(i) { objects.set(i.key, Uint8Array.from(i.body as Uint8Array)); }, async get(k) { return new Response(Uint8Array.from(objects.get(k)!)).body; }, async delete() {}, async signedUrl() { return "test"; } },
      client: { async getMedia(input) { counts.download++; const i = Number(input.message.key.id.split("-")[1]); return { bytes: new Uint8Array([0xff, 0xd8, 0xff, i]), mimeType: "image/jpeg" }; } },
      analyzer: { async readImage(bytes) { counts.ocr++; advance(); const i = bytes[3]; if (options.circuit === i) throw new CircuitOpenError(60_000); if (options.network === i) throw Object.assign(new Error("network failed"), { code: "ENOTFOUND" }); if (options.permanent?.includes(i)) { const { ValidationError } = await import("../../lib/bot/validation.ts"); throw new ValidationError("corrupt file"); } if (options.transient === i && !transient) { transient = true; throw new ProviderHttpError("Mistral", 503); } return `Supplier ${i}`; }, async segmentAudio(t) { return { segments: [t], confident: true }; } },
      mistral: { async post(_p, body) { counts.vision++; const url = (body as { messages: Array<{ content: Array<{ image_url?: { url: string } }> }> }).messages.at(-1)!.content[0].image_url!.url; const i = Buffer.from(url.split(",")[1], "base64")[3]; const result = { choices: [{ message: { content: JSON.stringify(visual(i)) } }] }; return options.tape ? options.tape.call("vision", { asset: i }, async () => result) : result; } }, extraction,
      transcription: { async transcribe() { throw Error("unused"); } },
    });
  }
  async function run(deadline: number) {
    counts.runs++; let claimed = false;
    const s = structuredClone(persisted); s.leaseId = `lease-${counts.runs}`;
    const store = { async claim() { if (claimed || finished) return []; claimed = true; return [s]; }, async catalog() { return catalog; }, async saveReading(id: string, reading: BurstReading) {
      counts.checkpoints++; persisted.messages.find((m) => m.id === id)!.reading = structuredClone(reading);
      if (!crashed && options.crash && ((options.crash === "download" && reading.storageKey && !reading.ingestion?.classification) || (options.crash === "ocr" && reading.ocr !== undefined) || (options.crash === "vision" && reading.ingestion?.classification))) { crashed = true; throw new AgentCheckpoint(); }
    }, async retry() { counts.retries++; }, async finish(_s: BurstSnapshot, state: AgentState, text: string) { finished = true; persisted.state = structuredClone(state); sent = text; }, async flushReplies() {} } as unknown as BurstStore;
    await new WhatsAppAgentService({ ingestion: true, store, reader: reader(), domain, orchestrator: new WhatsAppAgentOrchestrator({ domain, extraction, client: model }), async save(_id, _r, _l, state) { persisted.state = structuredClone(state); if (options.crash === "grouping" && !crashed && state.ingestion) { crashed = true; throw new AgentCheckpoint(); } return true; }, async send() { assert.fail("No network sends"); } }).processDue(1, deadline);
  }
  return { run, counts, operations, objects, snapshot: () => structuredClone(persisted), finished: () => finished, sent: () => sent };
}

for (const count of [34, 50]) test(`${count} images resume across forced deadlines with exact durable results`, async (t) => {
  setEnv(t, "WHATSAPP_ASSET_CONCURRENCY", "1"); let now = 1_000_000; t.mock.method(Date, "now", () => now);
  const h = harness(count, () => { now += 1000; });
  for (let i = 0; i < 20 && !h.finished(); i++) {
    await h.run(now + 37_001);
    if (!h.finished()) assert.equal(h.sent(), "", "No false completion summary");
    now += 60_000;
  }
  assert.ok(h.finished()); assert.ok(h.counts.runs >= Math.ceil(count / 8)); assert.equal(h.operations.size, count); assert.equal(h.counts.write, count); assert.equal(h.counts.ocr, count); assert.equal(h.counts.vision, count); assert.equal(h.counts.download, count); assert.equal(h.snapshot().state.ingestion?.assets.length, count); assert.equal(h.snapshot().state.ingestion?.summary.processed, count);
});
for (const crash of ["download", "ocr", "vision", "grouping", "write"]) test(`crash after ${crash}: new worker reuses checkpoints and effects`, async (t) => {
  setEnv(t, "WHATSAPP_ASSET_CONCURRENCY", "1"); const h = harness(3, () => {}, { crash });
  await h.run(Date.now() + 100_000); assert.equal(h.finished(), false);
  await h.run(Date.now() + 100_000); assert.ok(h.finished()); assert.equal(h.counts.download, 3); assert.equal(h.counts.ocr, 3); assert.equal(h.counts.vision, 3); assert.equal(h.counts.write, 3); assert.equal(h.operations.size, 3); assert.equal(h.snapshot().state.ingestion?.summary.processed, 3);
});
for (const permanent of [[7], [3, 11, 29]]) test(`34 assets isolate permanent errors ${permanent}`, async (t) => {
  setEnv(t, "WHATSAPP_ASSET_CONCURRENCY", "2"); const h = harness(34, () => {}, { permanent }); await h.run(Date.now() + 100_000);
  assert.ok(h.finished()); assert.equal(h.operations.size, 34 - permanent.length); assert.equal(h.objects.size, 34); assert.equal(h.snapshot().state.ingestion?.assets.length, 34); assert.equal(h.snapshot().state.ingestion?.summary.needsReview, permanent.length);
});
test("timeout, DNS, reset and 503 are infrastructure; validation is terminal", () => {
  for (const code of ["ETIMEDOUT", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN"]) assert.equal(failure(Object.assign(Error("external"), { code })).retryable, true);
  assert.equal(failure(new ProviderHttpError("Mistral", 503)).type, "PROVIDER_UNAVAILABLE"); assert.equal(failure(new SyntaxError()).retryable, false);
});
test("429 respects Retry-After and timeout retries with backoff", async () => {
  for (const error of [new ProviderHttpError("OpenAI", 429, 3500), Object.assign(Error("timeout"), { code: "ETIMEDOUT" })]) {
    const delays: number[] = []; let calls = 0;
    const client = resilientClient({ async post() { if (++calls === 1) throw error; return "ok"; } }, "OpenAI", "text", { limiter: new Limiter(2), gate: new ProviderGate(), attempts: 2, sleep: async (ms) => { delays.push(ms); }, random: () => 0.5 });
    assert.equal(await client.post("/chat/completions", {}, new AbortController().signal), "ok"); assert.equal(calls, 2); assert.equal(delays[0], error instanceof ProviderHttpError ? 3500 : 500);
  }
});
test("503 opens separate provider circuit and recovery admits a single probe", async () => {
  let now = 0; let calls = 0; let down = true;
  const gate = new ProviderGate(3, 1000, () => now);
  const client = resilientClient({ async post() { calls++; if (down) throw new ProviderHttpError("Mistral", 503); return "ok"; } }, "Mistral", "vision", { limiter: new Limiter(2), gate, attempts: 1 });
  for (let i = 0; i < 3; i++) await assert.rejects(client.post("/chat/completions", {}, new AbortController().signal));
  await assert.rejects(client.post("/chat/completions", {}, new AbortController().signal), CircuitOpenError); assert.equal(calls, 3);
  const other = new ProviderGate(); other.enter(); other.success();
  now = 1001; down = false; assert.equal(await client.post("/chat/completions", {}, new AbortController().signal), "ok"); assert.equal(calls, 4);
});
test("34 provider calls respect configured slots and backpressure", async () => {
  const limiter = new Limiter(3); let active = 0; let peak = 0;
  const client = resilientClient({ async post() { active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 1)); active--; return {}; } }, "Mistral", "ocr", { limiter, gate: new ProviderGate(), attempts: 1 });
  await Promise.all(Array.from({ length: 34 }, () => client.post("/ocr", {}, new AbortController().signal))); assert.equal(peak, 3); assert.equal(limiter.peak, 3); assert.equal(limiter.active, 0);
});
test("safe deadline derives from runtime and reserves shutdown buffer", (t) => { setEnv(t, "WHATSAPP_SHUTDOWN_BUFFER_MS", "80000"); assert.equal(safeDeadline(300_000, 100), 220_100); });
test("Retry-After HTTP date and numeric headers preserve status", () => {
  const response = new Response("", { status: 429, headers: { "retry-after": "4", "x-ratelimit-remaining-requests": "0" } });
  assert.throws(() => observeResponse("OpenAI", response, Date.now()), (e: unknown) => e instanceof ProviderHttpError && e.retryAfterMs === 4000);
});
test("replay tape: 34 assets, infrastructure failure, multiple windows, resume, final completion", async (t) => {
  setEnv(t, "WHATSAPP_ASSET_CONCURRENCY", "1"); let now = 1_000_000; t.mock.method(Date, "now", () => now);
  const tape = new ReplayTape(new IdentityMap("operational"), "deterministic", "hardening");
  const h = harness(34, () => { now += 1000; }, { transient: 11, tape });
  for (let i = 0; i < 20 && !h.finished(); i++) { await h.run(now + 37_001); now += 60_000; }
  assert.ok(h.finished()); assert.equal(h.operations.size, 34); assert.ok(h.counts.runs > 1); assert.equal(h.counts.ocr, 35); assert.equal(h.counts.vision, 34); assert.equal(tape.data().entries.length, 34); tape.finish();
});

test("infrastructure failure is pending; next window recovers original and OCR", async (t) => {
  setEnv(t, "WHATSAPP_ASSET_CONCURRENCY", "2"); let now = 1_000_000; t.mock.method(Date, "now", () => now);
  const h = harness(34, () => {}, { transient: 11 });
  await h.run(now + 100_000);
  assert.equal(h.finished(), false); assert.equal(h.sent(), "");
  const asset = h.snapshot().messages[10]; assert.equal(asset.reading?.ingestion?.status, "PENDING_RETRY"); assert.equal(asset.reading?.ingestion?.error?.type, "PROVIDER_UNAVAILABLE"); assert.ok(asset.reading?.storageKey); assert.equal(h.counts.download, 34);
  now += 60_000; await h.run(now + 100_000); assert.ok(h.finished()); assert.equal(h.operations.size, 34); assert.equal(h.counts.download, 34); assert.equal(h.counts.vision, 34); assert.equal(h.counts.ocr, 35);
});

test("PostgreSQL: crash after supplier/product effect before caller receipt checkpoint", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async (t) => {
  const { createAgentEnvironment, localAgentDatabase } = await import("../../evals/whatsapp-agent/environment.ts");
  const { AgentTools } = await import("../../lib/channels/whatsapp/agent-tools.ts");
  const { randomUUID } = await import("node:crypto");
  const { agentState } = await import("../../lib/channels/whatsapp/agent-contract.ts");
  const prisma = localAgentDatabase();
  const env = await createAgentEnvironment(prisma, { trips: [{ ...catalog.trips[0], suppliers: [{ id: "seed", captureId: "seed-capture", companyId: "company", name: "Seed", city: null }] }] });
  try {
    for (const kind of ["supplier", "product"] as const) await t.test(kind, async () => {
      await prisma.whatsAppBurst.updateMany({ where: { userId: env.userId }, data: { status: "DONE", leaseId: null } });
      const id = randomUUID(); const text = kind === "supplier" ? "Nuevo Tools" : "Producto Martillo a Seed";
      const snapshot: BurstSnapshot = { id, instance: "test", userId: env.userId, phone: "123", revision: 1, status: "PROCESSING", leaseId: "lease", state: { tripId: null, groups: [], question: null, pendingRefs: [], controlIds: [] }, messages: [{ id: `${id}-message`, sequence: 1, sentAt: null, envelope: { instance: "test", messageId: `${id}-message`, phone: "123", type: "TEXT", text, sentAt: null, media: null }, reading: { complete: true, segments: [{ id: `${id}-message:1`, text }] } }] };
      await env.persist(snapshot); const state = agentState(snapshot.state); snapshot.state = state;
      const domain = Object.create(env.domain) as AgentDomain;
      domain.write = async (s, input) => { await env.domain.write(s, input); throw new AgentCheckpoint(); };
      const tools = new AgentTools({ domain, extraction, catalog: env.catalog, async checkpoint(next) { await env.save(snapshot, next); } });
      await tools.execute("get_context", {}, snapshot, state);
      if (kind === "product") await tools.execute("get_supplier", { id: env.id("seed") }, snapshot, state);
      const prepared = await tools.execute("prepare_evidence", { sources: [{ messageId: snapshot.messages[0].id, quote: null, role: "FACTS" }] }, snapshot, state) as { evidence: Array<{ id: string }> };
      const args = kind === "supplier" ? { tripId: env.id("trip"), companyId: env.id("company"), evidenceIds: prepared.evidence.map((e) => e.id) } : { supplierId: env.id("seed"), name: "Martillo", evidenceIds: prepared.evidence.map((e) => e.id) };
      await assert.rejects(tools.execute(`create_${kind}_draft`, args, snapshot, state), AgentCheckpoint);
      const row = await prisma.whatsAppBurst.findUniqueOrThrow({ where: { id } });
      const resumedState = agentState(row.state as unknown as AgentState); snapshot.state = resumedState;
      assert.equal(resumedState.agent.receipts.length, 0, "caller receipt was not checkpointed");
      const resumed = new AgentTools({ domain: env.domain, extraction, catalog: env.catalog, async checkpoint(next) { await env.save(snapshot, next); } });
      const receipt = await resumed.execute(`create_${kind}_draft`, args, snapshot, resumedState) as AgentReceipt;
      assert.equal(receipt.status, "COMPLETED");
      assert.equal(await prisma.whatsAppAgentOperation.count({ where: { burstId: id } }), 1);
      if (kind === "supplier") assert.equal(await prisma.supplierCapture.count({ where: { id: receipt.captureId } }), 1);
      else assert.equal(await prisma.supplierProduct.count({ where: { id: receipt.id } }), 1);
    });
    await t.test("stale lease cannot overwrite asset checkpoint", async () => {
      const { PrismaBurstStore } = await import("../../lib/channels/whatsapp/prisma-burst-store.ts");
      const { AgentSuperseded } = await import("../../lib/channels/whatsapp/agent-contract.ts");
      const row = await prisma.whatsAppBurst.findFirstOrThrow({ where: { userId: env.userId }, include: { messages: true } });
      await prisma.whatsAppBurst.update({ where: { id: row.id }, data: { leaseId: "new-owner", leaseUntil: new Date(Date.now() + 100_000) } });
      await assert.rejects(new PrismaBurstStore(prisma).saveReading(row.messages[0].id, { segments: [], complete: false }, { ...row, leaseId: "old-owner" } as unknown as BurstSnapshot), AgentSuperseded);
      assert.deepEqual((await prisma.whatsAppBurstMessage.findUniqueOrThrow({ where: { id: row.messages[0].id } })).reading, row.messages[0].reading);
    });
  } finally { await env.cleanup(); await prisma.$disconnect(); }
});

test("DNS stays retryable across runs, exhaustion requests review and retains all originals", async (t) => {
  setEnv(t, "WHATSAPP_ASSET_MAX_FAILURES", "2"); let now = 1_000_000; t.mock.method(Date, "now", () => now);
  const h = harness(34, () => {}, { network: 7 });
  await h.run(now + 100_000);
  assert.equal(h.snapshot().messages[6].reading?.ingestion?.status, "PENDING_RETRY");
  assert.equal(h.snapshot().messages[6].reading?.ingestion?.error?.type, "PROVIDER_NETWORK_ERROR");
  now += 60_000; await h.run(now + 100_000);
  assert.ok(h.finished()); assert.equal(h.operations.size, 33); assert.equal(h.objects.size, 34);
  assert.equal(h.snapshot().messages[6].reading?.ingestion?.status, "NEEDS_REVIEW");
  assert.equal(h.snapshot().messages[6].reading?.ingestion?.error?.type, "PROVIDER_UNAVAILABLE_AFTER_RETRIES");
});

test("Retry-After beyond this window survives checkpoint policy without sleeping or retrying early", async () => {
  const { operationContext } = await import("../../lib/channels/whatsapp/operational-runtime.ts");
  let calls = 0;
  const client = resilientClient({ async post() { calls++; throw new ProviderHttpError("OpenAI", 429, 3_600_000); } }, "OpenAI", "text", { limiter: new Limiter(1), gate: new ProviderGate(), sleep: async () => assert.fail("Do not sleep past worker window") });
  await operationContext.run({ deadline: Date.now() + 100_000 }, async () => {
    await assert.rejects(client.post("/chat/completions", {}, new AbortController().signal), (error: unknown) => failure(error).retryAfterMs === 3_600_000);
  });
  assert.equal(calls, 1);
});

test("open circuit defers an asset without exhausting unmade request attempts; recovery finishes burst", async (t) => {
  setEnv(t, "WHATSAPP_ASSET_MAX_FAILURES", "1"); let now = 1_000_000; t.mock.method(Date, "now", () => now);
  const options: { circuit?: number } = { circuit: 7 }; const h = harness(34, () => {}, options);
  for (let run = 0; run < 3; run++) { await h.run(now + 100_000); now += 61_000; }
  assert.equal(h.snapshot().messages[6].reading?.ingestion?.status, "PENDING_RETRY");
  assert.equal(h.snapshot().messages[6].reading?.ingestion?.operational?.failures, 0);
  options.circuit = undefined; await h.run(now + 100_000);
  assert.ok(h.finished()); assert.equal(h.operations.size, 34); assert.equal(h.counts.vision, 34);
});
