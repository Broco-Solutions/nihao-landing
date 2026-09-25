import type { Tier1Data } from "../../lib/bot/types.ts";
import { normalizePhone, present, sameValue } from "./normalize.ts";
import type { EvalCase, EvalFixture, EvalMetrics, EvalSummary, Suite } from "./types.ts";

const CRITICAL = new Set(["fob", "fobPrice", "moq", "leadTime", "interestScore", "supplierType", "category"]);
function actualField(fields: Tier1Data, field: string): unknown {
  if (field === "contactName") return fields.contact;
  if (field === "email") return fields.contact?.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] ?? null;
  if (field === "phone" || field === "mobile") return fields.contact?.split(" · ").find((part) => /\d{7}/.test(normalizePhone(part))) ?? null;
  if (field === "fobPrice") return fields.fob;
  return fields[field as keyof Tier1Data] ?? null;
}
export function scoreExtraction(suite: Suite, fixture: EvalFixture, fields: Tier1Data, reviewActual: string[], latencyMs: number, model: string | null, metadata: Record<string, unknown> = {}): EvalCase {
  const correctFields: EvalCase["correctFields"] = []; const missingExpectedFields: EvalCase["missingExpectedFields"] = [];
  const wrongFields: EvalCase["wrongFields"] = []; const hallucinatedFields: EvalCase["hallucinatedFields"] = [];
  for (const [field, expected] of Object.entries(fixture.expected)) {
    const actual = actualField(fields, field);
    const delta = { field, expected, actual };
    if (!present(actual)) missingExpectedFields.push(delta);
    else if (sameValue(field, expected, actual)) correctFields.push(delta);
    else wrongFields.push(delta);
  }
  for (const field of fixture.mustRemainMissing) {
    const actual = actualField(fields, field);
    if (present(actual) && !Object.hasOwn(fixture.expected, field)) hallucinatedFields.push({ field, expected: null, actual });
  }
  const reviewExpected = fixture.reviewExpected ?? [];
  const reviewCorrect = reviewExpected.every((field) => reviewActual.includes(field));
  const failed = missingExpectedFields.length > 0 || wrongFields.length > 0 || hallucinatedFields.length > 0 || !reviewCorrect;
  const status = fixture.observational ? "OBSERVATIONAL" : fixture.xfail ? (failed ? "XFAIL" : "XPASS") : failed ? "FAIL" : "PASS";
  return { caseId: fixture.caseId, suite, status, correctFields, missingExpectedFields, wrongFields, hallucinatedFields,
    reviewExpected, reviewActual, reviewCorrect, latencyMs, model, metadata: { ...metadata, ...(fixture.xfail ? { knownIssue: fixture.xfail } : {}) } };
}
export function errorCase(suite: Suite, caseId: string, error: unknown, latencyMs: number, model: string | null): EvalCase {
  return { caseId, suite, status: "ERROR", correctFields: [], missingExpectedFields: [], wrongFields: [], hallucinatedFields: [],
    reviewExpected: [], reviewActual: [], reviewCorrect: null, latencyMs, model,
    metadata: { error: error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error" } };
}
function ratio(numerator: number, denominator: number): number | null { return denominator ? numerator / denominator : null; }
function metrics(cases: EvalCase[]): EvalMetrics {
  const correct = cases.reduce((n, item) => n + item.correctFields.length, 0);
  const missing = cases.reduce((n, item) => n + item.missingExpectedFields.length, 0);
  const wrong = cases.reduce((n, item) => n + item.wrongFields.length, 0);
  const hallucinations = cases.reduce((n, item) => n + item.hallucinatedFields.length, 0);
  const precision = ratio(correct, correct + wrong + hallucinations);
  const recall = ratio(correct, correct + wrong + missing);
  const review = cases.map((item) => item.reviewCorrect).filter((value): value is boolean => value !== null);
  const merge = cases.map((item) => item.mergeCorrect).filter((value): value is boolean => typeof value === "boolean");
  const human = cases.map((item) => item.humanOverridePreserved).filter((value): value is boolean => typeof value === "boolean");
  return { cases: cases.length, pass: cases.filter((item) => item.status === "PASS").length,
    fail: cases.filter((item) => item.status === "FAIL").length, xfail: cases.filter((item) => item.status === "XFAIL").length,
    xpass: cases.filter((item) => item.status === "XPASS").length, skipped: cases.filter((item) => item.status === "SKIPPED").length,
    error: cases.filter((item) => item.status === "ERROR").length, observational: cases.filter((item) => item.status === "OBSERVATIONAL").length,
    fieldPrecision: precision, fieldRecall: recall, fieldF1: precision !== null && recall !== null && precision + recall ? 2 * precision * recall / (precision + recall) : null,
    missingExpectedCount: missing, wrongFieldCount: wrong, hallucinationCount: hallucinations,
    hallucinationRate: ratio(hallucinations, correct + wrong + hallucinations),
    criticalHallucinationCount: cases.reduce((n, item) => n + item.hallucinatedFields.filter((delta) => CRITICAL.has(delta.field)).length, 0),
    reviewCorrectness: ratio(review.filter(Boolean).length, review.length), mergeCorrectness: ratio(merge.filter(Boolean).length, merge.length),
    humanOverridePreservation: ratio(human.filter(Boolean).length, human.length), latencyMs: cases.reduce((n, item) => n + item.latencyMs, 0) };
}
export function summarize(cases: EvalCase[]): EvalSummary {
  const suites: Record<string, EvalMetrics> = {};
  for (const suite of new Set(cases.map((item) => item.suite))) suites[suite] = metrics(cases.filter((item) => item.suite === suite));
  const stability: EvalSummary["stability"] = {};
  for (const key of new Set(cases.map((item) => `${item.suite}/${item.caseId}`))) {
    const group = cases.filter((item) => `${item.suite}/${item.caseId}` === key);
    const fields = new Set(group.flatMap((item) => [...item.correctFields, ...item.missingExpectedFields, ...item.wrongFields, ...item.hallucinatedFields].map((delta) => delta.field)));
    const variableFields = [...fields].filter((field) => new Set(group.map((item) => JSON.stringify([...item.correctFields, ...item.missingExpectedFields, ...item.wrongFields, ...item.hallucinatedFields].find((delta) => delta.field === field)?.actual))).size > 1);
    stability[key] = { passCount: group.filter((item) => item.status === "PASS").length,
      failCount: group.filter((item) => item.status === "FAIL" || item.status === "ERROR").length, variableFields };
  }
  return { global: metrics(cases), suites, stability };
}
