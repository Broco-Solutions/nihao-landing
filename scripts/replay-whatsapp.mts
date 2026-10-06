import { replay } from "../evals/whatsapp-replay/runner.ts";
import { privateWrite, readTape, redactSecrets } from "../evals/whatsapp-replay/tape.ts";
import { renderReport } from "../evals/whatsapp-replay/report.ts";
const args = process.argv.slice(2);
const path = args.shift();
function option(name: string) { const index = args.indexOf(name); if (index < 0) return undefined; const value = args[index + 1]; if (!value || value.startsWith("--")) throw new Error(`${name} requiere un valor`); args.splice(index, 2); return value; }
async function main() {
  if (!path) throw new Error("Uso: npm run replay -- fixture.json [--tape tape.json] [--record replay-output/tape.json] [--report replay-output/report.json] [--verbose] [--live]");
  const tapePath = option("--tape"); const recordPath = option("--record"); const reportPath = option("--report");
  if (args.some((a) => !["--live", "--verbose"].includes(a))) throw new Error("Opción desconocida");
  const { report, tape } = await replay(path, { live: args.includes("--live"), tape: tapePath ? await readTape(tapePath) : undefined });
  const target = reportPath ?? `replay-output/${report.fixtureId.replace(/[^a-zA-Z0-9_-]/gu, "-")}-${Date.now()}.json`;
  await privateWrite(target, report); if (recordPath) await privateWrite(recordPath, tape);
  console.log(redactSecrets(renderReport(report, args.includes("--verbose")))); console.log(`Reporte privado: ${target}`);
  process.exitCode = report.passed ? 0 : 1;
}
main().catch((error: unknown) => { console.error(redactSecrets(error instanceof Error ? error.message : "Replay failed")); process.exitCode = 1; });
