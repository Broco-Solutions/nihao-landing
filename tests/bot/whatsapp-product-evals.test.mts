import test from "node:test";
import assert from "node:assert/strict";
import { scoreProductPlan } from "../../evals/whatsapp-products/runner.ts";
import { PRODUCT_CASES } from "../../evals/whatsapp-products/cases.ts";
import type { BurstPlan, BurstSnapshot } from "../../lib/channels/whatsapp/burst-types.ts";

const fixture = PRODUCT_CASES.find((f) => f.caseId === "WP11-two-suppliers")!;
const plan: BurstPlan = {
  tripId: "trip-china", question: null, pendingRefs: [], controlIds: [],
  groups: fixture.groups.map((g, i) => ({ id: `g${i}`, name: null, kind: "PRODUCT", productName: g.name, supplierId: g.supplierId, companyId: i === 0 ? "broco" : "kendal", refs: [`m${i + 1}:1`], reason: "Explicit request", certain: true })),
};
const snapshot: BurstSnapshot = {
  id: "eval", instance: "eval", phone: "5491112345678", userId: "eval", revision: 2, status: "PROCESSING", leaseId: "eval", state: plan,
  messages: fixture.messages.map((m, i) => ({ id: `m${i + 1}`, sequence: i + 1, sentAt: null, envelope: { instance: "eval", phone: "5491112345678", messageId: `m${i + 1}`, type: "TEXT", text: m.text!, media: null, sentAt: null }, reading: { complete: true, segments: [{ id: `m${i + 1}:1`, text: m.text! }] } })),
};

test("product eval detects swapped suppliers and evidence even with correct product names", () => {
  const correct = scoreProductPlan(fixture, snapshot, plan);
  assert.equal(correct.wrongFields.length, 0);
  assert.equal(correct.missingExpectedFields.length, 0);
  const swapped = structuredClone(plan);
  [swapped.groups[0].supplierId, swapped.groups[1].supplierId] = [swapped.groups[1].supplierId, swapped.groups[0].supplierId];
  [swapped.groups[0].refs, swapped.groups[1].refs] = [swapped.groups[1].refs, swapped.groups[0].refs];
  const failed = scoreProductPlan(fixture, snapshot, swapped);
  assert.deepEqual(failed.wrongFields.map((d) => d.field), ["supplier:0", "sources:0", "supplier:1", "sources:1"]);
});

test("product eval detects omitted products, wrong capture kind and unnecessary questions", () => {
  const incomplete = structuredClone(plan);
  incomplete.groups.pop();
  incomplete.groups[0].kind = "SUPPLIER_CAPTURE";
  incomplete.question = "¿Para qué empresa?";
  const failed = scoreProductPlan(fixture, snapshot, incomplete);
  assert.deepEqual(failed.wrongFields.map((d) => d.field), ["groupCount", "question", "kind:0"]);
  assert.deepEqual(failed.missingExpectedFields.map((d) => d.field), ["product:1"]);
});
