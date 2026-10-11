import test from "node:test";
import assert from "node:assert/strict";
import { PrismaBurstStore } from "../../lib/channels/whatsapp/prisma-burst-store.ts";
import type { BurstSnapshot } from "../../lib/channels/whatsapp/burst-types.ts";
import { createAgentEnvironment, localAgentDatabase } from "../../evals/whatsapp-agent/environment.ts";

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
