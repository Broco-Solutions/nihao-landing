import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EMPTY_TIER_1_DATA } from "../../lib/bot/types.ts";
import { normalizeEmail, normalizePhone, normalizeString, normalizeUrl, sameValue } from "../../evals/core/normalize.ts";
import { scoreExtraction, summarize } from "../../evals/core/scoring.ts";
import { renderSummary, writeRun } from "../../evals/core/reporting.ts";
import { compareRuns } from "../../evals/core/regression.ts";
import { runMerge } from "../../evals/merge/runner.ts";
import type { EvalRun } from "../../evals/core/types.ts";

const fields = { ...EMPTY_TIER_1_DATA };
test("normalization conservadora de string, email, phone y URL", () => {
  assert.equal(normalizeString("  ACME   S.A. "), "acme s.a.");
  assert.equal(normalizeEmail("  INFO@EXAMPLE.COM "), "info@example.com");
  assert.equal(normalizePhone("+54 (341) 555-1234"), "+543415551234");
  assert.equal(normalizeUrl("https://www.example.com/"), "example.com");
  assert.ok(sameValue("phone", "+54 (341) 555-1234", "+54 341 5551234"));
  assert.ok(sameValue("phone", ["+54 341 1111111", "+54 341 5551234"], "+54 (341) 555-1234"));
  assert.ok(!sameValue("phone", "+54 341 5551234", "+54 341 5551235"));
});
test("companyName tolera sólo espaciado tipográfico con contenido alfanumérico idéntico", () => {
  for (const [expected, actual] of [
    ["Kendal Salud", "KendalSalud"],
    ["BROCO SOLUTIONS", "broco solutions"],
    ["ACME  Machinery", "ACME Machinery"],
  ]) assert.ok(sameValue("companyName", expected, actual), `${expected} vs ${actual}`);
  for (const [expected, actual] of [
    ["Kendal Salud", "Kendal Health"],
    ["Broco Solutions", "Broco Solution"],
    ["ABC Trading", "AB Trading"],
    ["ACME & Sons", "ACME Sons"],
  ]) assert.ok(!sameValue("companyName", expected, actual), `${expected} vs ${actual}`);
  assert.ok(!sameValue("category", "Kendal Salud", "KendalSalud"));
  assert.ok(!sameValue("city", "New York", "NewYork"));
});
test("FOB, MOQ y lead time comparan valor y unidad sin fuzzy permisivo", () => {
  assert.ok(sameValue("fob", { amount: 20, currency: "USD", unit: "unidad" }, { amount: 20, currency: "usd", unit: "units" }));
  assert.ok(!sameValue("fob", { amount: 20, currency: "USD", unit: "unidad" }, { amount: 24, currency: "USD", unit: "unidad" }));
  assert.ok(!sameValue("moq", { quantity: 100, unit: "unidades" }, { quantity: 500, unit: "unidades" }));
  assert.ok(sameValue("leadTime", { days: 21 }, { days: 21, rawText: "tres semanas" }));
});
test("exact match, missing expected, wrong y hallucination quedan separados", () => {
  const result = scoreExtraction("text", { caseId: "sample", expected: { companyName: "ACME", city: "Shenzhen", moq: { quantity: 100 } }, mustRemainMissing: ["fob", "province"] },
    { ...fields, companyName: "Acme", city: "Guangzhou", fob: { amount: 50, currency: "USD", unit: "unidad", rawText: "USD 50" } }, [], 10, "model");
  assert.deepEqual(result.correctFields.map((item) => item.field), ["companyName"]);
  assert.deepEqual(result.wrongFields.map((item) => item.field), ["city"]);
  assert.deepEqual(result.missingExpectedFields.map((item) => item.field), ["moq"]);
  assert.deepEqual(result.hallucinatedFields.map((item) => item.field), ["fob"]);
  assert.equal(result.status, "FAIL");
  const summary = summarize([result]).global;
  assert.equal(summary.fieldPrecision, 1 / 3);
  assert.equal(summary.fieldRecall, 1 / 3);
  assert.equal(summary.criticalHallucinationCount, 1);
});
test("contacto compuesto permite nombre/email/phone sin ocultar discrepancias", () => {
  const result = scoreExtraction("business-cards", { caseId: "contact", expected: { contactName: "Ana Ruiz", email: "ANA@EXAMPLE.COM", phone: "+54 341 555 1234" }, mustRemainMissing: [] },
    { ...fields, contact: "Ana Ruiz · ana@example.com · +54 (341) 555-1234" }, [], 0, "model");
  assert.equal(result.correctFields.length, 3);
  assert.equal(result.status, "PASS");
});
test("REVIEW esperado y XFAIL no ocultan un XPASS", () => {
  const failedReview = scoreExtraction("merge", { caseId: "review", expected: {}, mustRemainMissing: [], reviewExpected: ["moq"] }, fields, [], 0, null);
  assert.equal(failedReview.status, "FAIL");
  const xfail = scoreExtraction("channel", { caseId: "known", expected: { companyName: "Known" }, mustRemainMissing: [], xfail: "known bug" }, fields, [], 0, null);
  assert.equal(xfail.status, "XFAIL");
  const xpass = scoreExtraction("channel", { caseId: "known", expected: {}, mustRemainMissing: [], xfail: "known bug" }, fields, [], 0, null);
  assert.equal(xpass.status, "XPASS");
});
test("merge real cubre conflictos y conserva múltiples correcciones humanas", async () => {
  const cases = await runMerge();
  assert.equal(cases.length, 7);
  assert.ok(cases.every((item) => item.status === "PASS"));
  assert.equal(cases.find((item) => item.caseId === "M03-conflict")?.reviewCorrect, true);
  assert.equal(cases.find((item) => item.caseId === "M07-multiple-human-corrections")?.humanOverridePreserved, true);
});
test("reporte y comparación de baseline detectan regresión concreta", () => {
  const good = scoreExtraction("text", { caseId: "x", expected: { companyName: "ACME" }, mustRemainMissing: ["moq"] }, { ...fields, companyName: "ACME" }, [], 10, "model");
  const bad = scoreExtraction("text", { caseId: "x", expected: { companyName: "ACME" }, mustRemainMissing: ["moq"] }, { ...fields, companyName: "OTHER", moq: { quantity: 100, unit: "unidades", notes: null, rawText: "100" } }, [], 10, "model");
  const base: EvalRun = { runId: "base", timestamp: "", gitCommit: "abc", branch: "develop", provider: "test", models: [], suiteVersions: {}, sourceHashes: {}, cases: [good], summary: summarize([good]) };
  const candidate = { ...base, runId: "candidate", cases: [bad], summary: summarize([bad]) };
  assert.match(renderSummary(base), /Precision/);
  const comparison = compareRuns(base, candidate);
  assert.ok(comparison.regressions.some((item) => item.includes("PASS → FAIL")));
  assert.ok(comparison.regressions.some((item) => item.includes("hallucinatedFields moq")));
  assert.equal(comparison.metrics.GLOBAL.criticalHallucinationCount.delta, 1);
});
test("report generation crea JSON y Markdown en raíz privada indicada", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "nihao-eval-report-"));
  try {
    const result = scoreExtraction("text", { caseId: "report", expected: { companyName: "ACME" }, mustRemainMissing: [] }, { ...fields, companyName: "ACME" }, [], 2, "model");
    const run: EvalRun = { runId: "report-test", timestamp: "2026-09-24T00:00:00Z", gitCommit: "abc", branch: "develop", provider: "test", models: ["model"], suiteVersions: { text: 1 }, sourceHashes: {}, cases: [result], summary: summarize([result]) };
    const directory = await writeRun(run, temporary);
    assert.equal(JSON.parse(await readFile(path.join(directory, "cases.json"), "utf8")).length, 1);
    assert.equal(JSON.parse(await readFile(path.join(directory, "summary.json"), "utf8")).summary.global.pass, 1);
    assert.match(await readFile(path.join(directory, "summary.md"), "utf8"), /Nihao eval/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
