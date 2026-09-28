import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EvalCase, EvalRun } from "./types.ts";

const CRITICAL = new Set(["fob", "fobPrice", "moq", "leadTime", "interestScore", "supplierType", "category"]);
function display(value: number | null): string { return value === null ? "n/a" : value.toFixed(3); }
function severity(item: EvalCase): number {
  if (item.hallucinatedFields.some((delta) => CRITICAL.has(delta.field))) return 4;
  if (item.hallucinatedFields.length) return 3;
  if (item.wrongFields.length) return 2;
  if (item.missingExpectedFields.length) return 1;
  return 0;
}
export function renderSummary(run: EvalRun): string {
  const rows = Object.entries({ GLOBAL: run.summary.global, ...run.summary.suites }).map(([name, value]) =>
    `| ${name} | ${value.cases} | ${value.pass} | ${value.fail} | ${value.xfail} | ${display(value.fieldPrecision)} | ${display(value.fieldRecall)} | ${value.wrongFieldCount} | ${value.hallucinationCount} | ${value.criticalHallucinationCount} |`);
  const failures = run.cases.filter((item) => item.status === "FAIL" || item.status === "ERROR" || item.status === "XPASS").sort((a, b) => severity(b) - severity(a));
  const critical = run.cases.flatMap((item) => item.hallucinatedFields.filter((delta) => CRITICAL.has(delta.field)).map((delta) => `${item.suite}/${item.caseId}: ${delta.field}=${JSON.stringify(delta.actual)}`));
  const failuresText = failures.length ? failures.map((item) => `- ${item.suite}/${item.caseId}: ${item.status}; hallucinated=${item.hallucinatedFields.map((delta) => delta.field).join(",") || "-"}; wrong=${item.wrongFields.map((delta) => delta.field).join(",") || "-"}; missing=${item.missingExpectedFields.map((delta) => delta.field).join(",") || "-"}`).join("\n") : "None.";
  return `# Nihao eval — ${run.runId}\n\nCommit: ${run.gitCommit}; branch: ${run.branch}; provider: ${run.provider}.\n\n| Suite | Cases | PASS | FAIL | XFAIL | Precision | Recall | Wrong | Hallucinations | Critical |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n${rows.join("\n")}\n\n## Critical hallucinations\n\n${critical.length ? critical.map((item) => `- ${item}`).join("\n") : "None observed."}\n\n## Failures and unexpected passes\n\n${failuresText}\n`;
}
export async function writeRun(run: EvalRun, privateRoot: string): Promise<string> {
  const directory = path.join(privateRoot, "eval-reports", run.runId);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "summary.json"), `${JSON.stringify({ ...run, cases: undefined }, null, 2)}\n`);
  await writeFile(path.join(directory, "cases.json"), `${JSON.stringify(run.cases, null, 2)}\n`);
  await writeFile(path.join(directory, "summary.md"), renderSummary(run));
  return directory;
}
