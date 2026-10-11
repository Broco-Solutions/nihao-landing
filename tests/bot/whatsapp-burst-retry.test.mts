import test from "node:test";
import assert from "node:assert/strict";
import { PrismaBurstStore } from "../../lib/channels/whatsapp/prisma-burst-store.ts";
import type { BurstSnapshot, BurstStore } from "../../lib/channels/whatsapp/burst-types.ts";
import { createAgentEnvironment, localAgentDatabase } from "../../evals/whatsapp-agent/environment.ts";
import { WhatsAppAgentService } from "../../lib/channels/whatsapp/agent-service.ts";
import type { AgentDomain, AgentState } from "../../lib/channels/whatsapp/agent-contract.ts";

const snapshot = (): BurstSnapshot => ({
  id: "burst", instance: "nihao", phone: "redacted", userId: "user", revision: 3,
  status: "PROCESSING", leaseId: "lease", state: { tripId: null, groups: [], question: null, pendingRefs: [], controlIds: [] }, messages: [],
});

function fixture(attempts: number) {
  const row = { id: "burst", instance: "nihao", phone: "redacted", revision: 3, status: "PROCESSING", leaseId: "lease", leaseUntil: new Date(Date.now() + 60_000), attempts, dueAt: new Date(0), state: snapshot().state };
  const replies: Array<{ kind: string; text: string }> = [];
  const tx = {
    async $executeRaw() {},
    whatsAppBurst: {
      async findUniqueOrThrow() { return { ...row }; },
      async update(input: { data: Record<string, unknown> }) { Object.assign(row, input.data); return { ...row }; },
    },
    whatsAppBurstMessage: { async count() { return 0; } },
    whatsAppBurstReply: { async upsert(input: { create: { kind: string; text: string } }) { replies.push(input.create); return input.create; } },
  };
  const prisma = { async $transaction<T>(run: (client: typeof tx) => Promise<T>) { return run(tx); } };
  return { store: new PrismaBurstStore(prisma as never, { claimVersions: [3] }), row, replies };
}

test("a deterministic programming failure is isolated after one attempt", async () => {
  const { store, row, replies } = fixture(1);
  await store.retry(snapshot(), false, new TypeError("private payload"));
  assert.equal(row.status, "FAILED");
  assert.equal((row as typeof row & { lastErrorCode?: string }).lastErrorCode, "DETERMINISTIC_PROGRAMMING_ERROR");
  assert.equal(row.leaseId, null);
  assert.equal(replies.length, 1);
  assert.match(replies[0].text, /Podés seguir usando Nihao/u);
});

test("unknown transient failures use a bounded burst retry budget", async () => {
  const beforeLimit = fixture(4);
  await beforeLimit.store.retry(snapshot(), false, new Error("unexpected dependency failure"));
  assert.equal(beforeLimit.row.status, "OPEN");
  assert.equal(beforeLimit.replies.length, 0);

  const atLimit = fixture(5);
  await atLimit.store.retry(snapshot(), false, new Error("unexpected dependency failure"));
  assert.equal(atLimit.row.status, "FAILED");
  assert.equal(atLimit.replies.length, 1);
});

test("a failed burst does not prevent the worker from processing the next traveler", async () => {
  const make = (id: string, text: string): BurstSnapshot => ({ id, instance: "nihao", phone: id, userId: id, revision: 1, status: "PROCESSING", leaseId: `lease-${id}`, state: { tripId: null, groups: [], question: null, pendingRefs: [], controlIds: [] }, messages: [{ id: `message-${id}`, sequence: 1, sentAt: null, envelope: { instance: "nihao", phone: id, messageId: `external-${id}`, type: "TEXT", text, media: null, sentAt: null }, reading: null }] });
  const queue = [make("broken", "Proveedor Alfa"), make("healthy", "Hola")];
  const retried: string[] = []; const finished: string[] = [];
  const store = {
    async claim() { const next = queue.shift(); return next ? [next] : []; },
    async catalog() { return { trips: [{ id: "trip", name: "Viaje", companies: [{ id: "company", name: "Empresa" }] }] }; },
    async saveReading() {},
    async retry(item: BurstSnapshot) { retried.push(item.id); },
    async finish(item: BurstSnapshot) { finished.push(item.id); },
    async flushReplies() {},
  } as unknown as BurstStore;
  const domain = {
    async conversationContext() { return null; },
    async persistPreviousSupplierComments(item: BurstSnapshot) { if (item.id === "broken") throw new TypeError("legacy operation"); return []; },
    async receipts() { return []; }, async pending() { return []; }, async displayed() {}, async search() { return []; }, async get() { throw new Error("unused"); }, async resolve() { throw new Error("unused"); }, async write() { throw new Error("unused"); },
  } as unknown as AgentDomain;
  await new WhatsAppAgentService({ store, domain, ingestion: false, reader: { async read(message) { return { complete: true, segments: [{ id: `${message.id}:text`, text: message.envelope.text ?? "" }] }; } }, orchestrator: { async run(item: BurstSnapshot) { return { state: item.state as AgentState, text: "Acá estoy." }; } } as never, async save() { return true; }, async send() {} }).processDue(2, Date.now() + 120_000);
  assert.deepEqual(retried, ["broken"]);
  assert.deepEqual(finished, ["healthy"]);
});

test("PostgreSQL: an isolated failed burst cannot capture a later traveler message", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async () => {
  const prisma = localAgentDatabase();
  const env = await createAgentEnvironment(prisma, { trips: [{ id: "trip", name: "Viaje", companies: [{ id: "company", name: "Empresa" }] }] });
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: env.userId }, select: { whatsappPhone: true } });
    const failedId = "failed-" + env.prefix;
    await prisma.whatsAppBurst.create({ data: { id: failedId, userId: env.userId, instance: "nihao", phone: user.whatsappPhone!, version: 3, revision: 1, status: "FAILED", dueAt: new Date(0), state: { tripId: null, groups: [], question: null, pendingRefs: [], controlIds: [] }, lastErrorAt: new Date(), lastErrorCode: "DETERMINISTIC_PROGRAMMING_ERROR" } });
    await prisma.whatsAppAgentContext.create({ data: { instance: "nihao", phone: user.whatsappPhone!, userId: env.userId, focus: { activeBurstId: failedId, supplierIds: [], productIds: [] } } });
    const store = new PrismaBurstStore(prisma, { newVersion: 3, claimVersions: [3], allowNew: true });
    assert.equal(await store.receive({ instance: "nihao", phone: user.whatsappPhone!, messageId: "next-" + env.prefix, type: "TEXT", text: "¿Qué productos guardé?", media: null, sentAt: new Date().toISOString() }), true);
    const messages = await prisma.whatsAppBurstMessage.findMany({ where: { burst: { userId: env.userId } }, select: { burstId: true } });
    assert.equal(messages.length, 1);
    assert.notEqual(messages[0].burstId, failedId);
    assert.equal((await prisma.whatsAppBurst.findUniqueOrThrow({ where: { id: failedId } })).status, "FAILED");
  } finally {
    await env.cleanup();
  }
});
