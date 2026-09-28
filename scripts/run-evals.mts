import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { runBusinessCards } from "../evals/business-cards/runner.ts";
import { runText } from "../evals/text/runner.ts";
import { runTranscripts, runRealAudio } from "../evals/audio/runner.ts";
import { runMerge } from "../evals/merge/runner.ts";
import { runChannel } from "../evals/channel/runner.ts";
import { summarize } from "../evals/core/scoring.ts";
import { writeRun } from "../evals/core/reporting.ts";
import { compareRuns, renderComparison } from "../evals/core/regression.ts";
import type { EvalCase, EvalRun, Suite } from "../evals/core/types.ts";

const privateRoot = path.resolve("test-data-private");
const args = process.argv.slice(2).filter((arg) => arg !== "--");
function option(name: string): string | undefined { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; }
function git(...input: string[]): string { return execFileSync("git", input, { encoding: "utf8" }).trim(); }
function safeRunId(value: string): string { if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value)) throw new Error("Invalid run ID"); return value; }
async function readRun(directory: string): Promise<EvalRun> {
  const summary = JSON.parse(await readFile(path.join(directory, "summary.json"), "utf8")) as EvalRun;
  summary.cases = JSON.parse(await readFile(path.join(directory, "cases.json"), "utf8")) as EvalCase[];
  return summary;
}
async function main() {
  if (args[0] === "compare") {
    const [baseline, candidate] = args.slice(1);
    if (!baseline || !candidate) throw new Error("Usage: pnpm eval:compare -- <baseline-dir> <candidate-dir>");
    console.log(renderComparison(compareRuns(await readRun(baseline), await readRun(candidate))));
    return;
  }
  const selected = option("--suite") ?? "all";
  const allowed = new Set(["all", "business-cards", "text", "transcript", "audio", "merge", "channel"]);
  if (!allowed.has(selected)) throw new Error(`Unknown suite: ${selected}`);
  const repetitions = Number(option("--runs") ?? "1");
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 20) throw new Error("--runs must be an integer from 1 to 20");
  const runId = safeRunId(option("--run-id") ?? `eval-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  const cases: EvalCase[] = []; const suites: Suite[] = selected === "all" ? ["business-cards", "text", "transcript", "audio", "merge", "channel"] : [selected as Suite];
  for (let index = 0; index < repetitions; index++) {
    for (const suite of suites) {
      try {
        const results = suite === "business-cards" ? await runBusinessCards(path.join(privateRoot, "business-cards"))
          : suite === "text" ? await runText() : suite === "transcript" ? await runTranscripts()
            : suite === "audio" ? await runRealAudio(path.join(privateRoot, "audio"))
              : suite === "merge" ? await runMerge() : await runChannel();
        cases.push(...results.map((item) => ({ ...item, metadata: { ...item.metadata, repetition: index + 1 } })));
        console.log(`${suite} run ${index + 1}: ${results.length} cases`);
      } catch (error) {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error";
        cases.push({ caseId: "suite-error", suite, status: "ERROR", correctFields: [], missingExpectedFields: [], wrongFields: [], hallucinatedFields: [], reviewExpected: [], reviewActual: [], reviewCorrect: null, latencyMs: 0, model: null, metadata: { repetition: index + 1, error: message } });
        console.error(`${suite} run ${index + 1}: ERROR (${message})`);
      }
    }
  }
  const hashes: Record<string, string> = {};
  for (const file of ["lib/bot/extraction/mistral-extraction-provider.ts", "lib/bot/extraction/merge.ts", "lib/bot/tier1.ts", "evals/core/scoring.ts", "evals/text/cases.ts", "evals/audio/transcript-cases.ts", "evals/merge/cases.ts", "evals/channel/runner.ts"]) {
    hashes[file] = createHash("sha256").update(await readFile(file)).digest("hex");
  }
  if (suites.includes("business-cards")) {
    const manifestFile = path.join(privateRoot, "business-cards", "manifest.json");
    const manifest = JSON.parse(await readFile(manifestFile, "utf8")) as { cases: Array<{ caseId: string }> };
    hashes["private-business-cards/manifest.json"] = createHash("sha256").update(await readFile(manifestFile)).digest("hex");
    for (const entry of manifest.cases) {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(entry.caseId)) throw new Error("Invalid private case ID");
      const expectedFile = path.join(privateRoot, "business-cards", entry.caseId, "expected.json");
      const expected = JSON.parse(await readFile(expectedFile, "utf8")) as { images: string[] };
      hashes[`private-business-cards/${entry.caseId}/expected.json`] = createHash("sha256").update(await readFile(expectedFile)).digest("hex");
      for (const image of expected.images) {
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(image) || image.includes("..")) throw new Error("Invalid image name");
        hashes[`private-business-cards/${entry.caseId}/${image}`] = createHash("sha256").update(await readFile(path.join(privateRoot, "business-cards", entry.caseId, image))).digest("hex");
      }
    }
  }
  const run: EvalRun = { runId, timestamp: new Date().toISOString(), gitCommit: git("rev-parse", "HEAD"), branch: git("branch", "--show-current"),
    provider: "Mistral (AI suites); production core with synthetic evidence (deterministic suites)",
    models: [...new Set(cases.map((item) => item.model).filter((model): model is string => Boolean(model)))],
    suiteVersions: Object.fromEntries(suites.map((suite) => [suite, 1])), sourceHashes: hashes, cases, summary: summarize(cases) };
  const directory = await writeRun(run, privateRoot);
  const totals = run.summary.global;
  console.log(`PASS=${totals.pass} FAIL=${totals.fail} XFAIL=${totals.xfail} XPASS=${totals.xpass} SKIPPED=${totals.skipped} ERROR=${totals.error} OBSERVATIONAL=${totals.observational}`);
  console.log(`Critical hallucinations=${totals.criticalHallucinationCount}; report=${directory}`);
  if (totals.error || totals.xpass) process.exitCode = 1;
}
await main();
