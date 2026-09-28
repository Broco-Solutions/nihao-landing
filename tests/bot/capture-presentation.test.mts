import assert from "node:assert/strict";
import { test } from "node:test";
import { groupCaptureFields } from "../../lib/bot/capture-presentation.ts";

test("separa datos detectados, a revisar y faltantes para la UI móvil", () => {
  const groups = groupCaptureFields(["contact"], ["category", "interestScore"], []);
  assert.ok(groups.detected.includes("companyName"));
  assert.deepEqual(groups.review, ["contact"]);
  assert.deepEqual(groups.missing, ["category", "interestScore"]);
});

test("un campo marcado como no sé deja de pedirse como faltante", () => {
  const groups = groupCaptureFields([], ["category", "interestScore"], ["category"]);
  assert.deepEqual(groups.missing, ["interestScore"]);
});
