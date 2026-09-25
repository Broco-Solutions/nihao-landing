import type { EvalMetrics, EvalRun } from "./types.ts";

export type MetricDelta = { baseline: number | null; candidate: number | null; delta: number | null };
export type Comparison = { metrics: Record<string, Record<string, MetricDelta>>; regressions: string[] };
const keys: Array<keyof EvalMetrics> = ["fieldPrecision", "fieldRecall", "fieldF1", "hallucinationCount", "criticalHallucinationCount", "wrongFieldCount", "missingExpectedCount", "mergeCorrectness", "reviewCorrectness", "humanOverridePreservation"];
export function compareRuns(baseline: EvalRun, candidate: EvalRun): Comparison {
  const metrics: Comparison["metrics"] = {};
  const suites = new Set(["GLOBAL", ...Object.keys(baseline.summary.suites), ...Object.keys(candidate.summary.suites)]);
  for (const suite of suites) {
    const left = suite === "GLOBAL" ? baseline.summary.global : baseline.summary.suites[suite];
    const right = suite === "GLOBAL" ? candidate.summary.global : candidate.summary.suites[suite];
    metrics[suite] = {};
    for (const key of keys) {
      const a = typeof left?.[key] === "number" ? left[key] as number : null;
      const b = typeof right?.[key] === "number" ? right[key] as number : null;
      metrics[suite][key] = { baseline: a, candidate: b, delta: a !== null && b !== null ? b - a : null };
    }
  }
  const old = new Map(baseline.cases.map((item) => [`${item.suite}/${item.caseId}`, item]));
  const regressions: string[] = [];
  for (const current of candidate.cases) {
    const key = `${current.suite}/${current.caseId}`;
    const previous = old.get(key);
    if (!previous) continue;
    if (previous.status === "PASS" && current.status !== "PASS") regressions.push(`${key}: PASS → ${current.status}`);
    for (const kind of ["wrongFields", "missingExpectedFields", "hallucinatedFields"] as const) {
      const before = new Set(previous[kind].map((delta) => delta.field));
      for (const delta of current[kind]) if (!before.has(delta.field)) regressions.push(`${key}: new ${kind} ${delta.field}`);
    }
  }
  return { metrics, regressions };
}
export function renderComparison(comparison: Comparison): string {
  const rows = Object.entries(comparison.metrics).flatMap(([suite, metrics]) => Object.entries(metrics).map(([name, values]) =>
    `| ${suite} | ${name} | ${values.baseline ?? "n/a"} | ${values.candidate ?? "n/a"} | ${values.delta === null ? "n/a" : `${values.delta >= 0 ? "+" : ""}${values.delta.toFixed(3)}`} |`));
  return `| Suite | Metric | Baseline | Candidate | Delta |\n|---|---|---:|---:|---:|\n${rows.join("\n")}\n\nRegressions:\n${comparison.regressions.length ? comparison.regressions.map((item) => `- ${item}`).join("\n") : "- None observed"}`;
}
