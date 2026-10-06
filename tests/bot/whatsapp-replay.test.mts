import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, cp, writeFile, rm, mkdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { FetchOpenAIHttpClient } from "../../lib/channels/whatsapp/agent-provider.ts";
import { ValidationError } from "../../lib/bot/validation.ts";
import { join } from "node:path";
import { replay } from "../../evals/whatsapp-replay/runner.ts";
import { IdentityMap, ReplayTape, ReplayMismatch, privateWrite, readTape } from "../../evals/whatsapp-replay/tape.ts";
import { loadFixture } from "../../evals/whatsapp-replay/fixture.ts";
import { renderReport } from "../../evals/whatsapp-replay/report.ts";
const root = "fixtures/whatsapp-replay/public";
const cases = ["M-product-notes", "N-ambiguous-notes", "O-product-notes-target", "A-batch-one-failure", "B-batch-three-failures", "C-explicit-alfa", "D-ambiguous-audio", "E-front-back", "F-distinct-consecutive", "G-product-audio", "H-product-not-last", "I-second-read-resolved", "J-second-read-ambiguous", "K-document-reply"];
test("replay live requires explicit opt-in before database/provider access", async () => {
  const previous = process.env.LIVE_AI; delete process.env.LIVE_AI;
  try { await assert.rejects(replay("missing.json", { live: true }), /LIVE_AI=true/); } finally { if (previous !== undefined) process.env.LIVE_AI = previous; }
});
test("tape replays exact requests offline, rejects changed calls and detects unused responses", async () => {
  const first = new ReplayTape(new IdentityMap("run-a"), "deterministic", "config");
  assert.deepEqual(await first.call("agent", { id: "run-a-trip" }, async () => ({ id: "run-a-trip" })), { id: "run-a-trip" });
  const second = new ReplayTape(new IdentityMap("run-b"), "deterministic", "config", first.data());
  assert.deepEqual(await second.call("agent", { id: "run-b-trip" }, async () => { assert.fail("No external AI"); }), { id: "run-b-trip" }); second.finish(); assert.equal(second.mismatches.length, 0);
  const changed = new ReplayTape(new IdentityMap("run-b"), "deterministic", "config", first.data());
  await assert.rejects(changed.call("ocr", { id: "different" }, async () => null), ReplayMismatch); changed.finish(); assert.ok(changed.mismatches.length >= 2);
  assert.throws(() => new ReplayTape(new IdentityMap("x"), "deterministic", "new-config", first.data()), ReplayMismatch);
});
test("tapes retain sanitized errors and technical resource mapping", async () => {
  const ids = new IdentityMap("run"); ids.observe({ id: "db-123", version: "2026-01-01" });
  assert.deepEqual(ids.transform(ids.transform({ id: "db-123", version: "2026-01-01" }), true), { id: "db-123", version: "2026-01-01" });
  const tape = new ReplayTape(ids, "deterministic", "config");
  await assert.rejects(tape.call("vision", {}, async () => { throw new Error("secret document + Bearer private-token"); }));
  assert.equal(tape.entries[0].error?.message, "Error");
});
test("private reports refuse writes outside the gitignored directory", async () => { await assert.rejects(privateWrite("fixtures/whatsapp-replay/public/leak.json", {}), /replay-output/); });
test("fixture validation preserves reply metadata and rejects path escapes/duplicate IDs", async () => {
  const base = await loadFixture(`${root}/C-explicit-alfa.json`); assert.equal(base.messages[2].type, "AUDIO");
  const dir = await mkdtemp(join(tmpdir(), "nihao-replay-"));
  try { await cp(root, dir, { recursive: true }); const path = join(dir, "case.json"); base.messages[1].id = base.messages[0].id; await writeFile(path, JSON.stringify(base)); await assert.rejects(loadFixture(path), /duplicado/); base.messages[1].id = "beta"; base.messages[0].asset = "../outside.png"; await writeFile(path, JSON.stringify(base)); await assert.rejects(loadFixture(path)); } finally { await rm(dir, { recursive: true, force: true }); }
});
test("PostgreSQL replay: permanent regressions A–J and complete offline tape replay", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async (t) => {
  for (const name of cases) await t.test(name, async () => {
    const { report } = await replay(`${root}/${name}.json`);
    assert.equal(report.passed, true, renderReport(report)); assert.equal(report.assets[Object.keys(report.assets)[0]].originalType, name.startsWith("K-") ? "DOCUMENT" : "IMAGE");
    assert.equal(report.config.model, "gpt-5.6-luna"); assert.ok(report.checkpoints.length > 0);
  });
  await t.test("capture once, replay whole G fixture exactly without mock responses", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => assert.fail("El replay deterministic nunca debe llamar APIs externas");
    let first: Awaited<ReturnType<typeof replay>>, second: Awaited<ReturnType<typeof replay>>;
    try { first = await replay(`${root}/G-product-audio.json`); second = await replay(`${root}/G-product-audio.json`, { tape: first.tape }); }
    finally { globalThis.fetch = originalFetch; }
    assert.equal(second.report.passed, true, renderReport(second.report)); assert.deepEqual(second.report.counts, first.report.counts);
    assert.deepEqual(second.report.metrics, first.report.metrics); assert.deepEqual(second.report.associations, first.report.associations);
  });
  await t.test("expected/actual diff separates association from extraction/write accuracy", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nihao-replay-diff-"));
    try { await cp(root, dir, { recursive: true }); const fixture = JSON.parse(await readFile(join(dir, "C-explicit-alfa.json"), "utf8")); fixture.expected[0].equals = ["card_beta"]; await writeFile(join(dir, "wrong.json"), JSON.stringify(fixture)); const { report } = await replay(join(dir, "wrong.json")); assert.equal(report.passed, false); assert.match(renderReport(report), /Expected:.*card_beta/); assert.match(renderReport(report), /Actual:.*card_alfa/); assert.equal(report.metrics.write.accuracy, 1); assert.ok(report.metrics.association.accuracy! < 1); } finally { await rm(dir, { recursive: true, force: true }); }
  });
});


test("local fixtures, tapes and reports are ignored by git; reports sanitize credentials", async () => {
  const paths = ["fixtures/whatsapp-replay/local/private.json", "replay-output/tape.json"];
  const ignored = execFileSync("git", ["check-ignore", "--stdin"], { input: paths.join("\n"), encoding: "utf8" });
  for (const path of paths) assert.ok(ignored.includes(path));
  const path = `replay-output/privacy-test-${Date.now()}.json`;
  try { await privateWrite(path, { token: "sk-12345678901234567890", authorization: "Bearer private-token" }); const text = await readFile(path, "utf8"); assert.ok(!text.includes("sk-123")); assert.ok(!text.includes("private-token")); } finally { await rm(path, { force: true }); }
});
test("recorded deterministic validation errors retain their retry semantics", async () => {
  const tape = new ReplayTape(new IdentityMap("first"), "deterministic", "config");
  await assert.rejects(tape.call("vision", {}, async () => { throw new ValidationError("invalid card"); }), ValidationError);
  const replay = new ReplayTape(new IdentityMap("second"), "deterministic", "config", tape.data());
  await assert.rejects(replay.call("vision", {}, async () => assert.fail("offline only")), ValidationError);
});


test("malformed tape is rejected before replay", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nihao-tape-"));
  try { const path = join(dir, "tape.json"); await writeFile(path, JSON.stringify({ version: 1, configHash: "x", entries: [{ kind: "agent", requestHash: "not-a-hash", durationMs: 0 }] })); await assert.rejects(readTape(path), /Tape inválido/); } finally { await rm(dir, { recursive: true, force: true }); }
});
test("private writer rejects a symlink to an external directory", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nihao-output-")); const link = `replay-output/symlink-test-${Date.now()}`;
  try { await mkdir("replay-output", { recursive: true }); await symlink(dir, link); await assert.rejects(privateWrite(`${link}/secret.json`, {}), /fuera/); } finally { await rm(link, { force: true }); await rm(dir, { recursive: true, force: true }); }
});
test("Responses usage is available without changing Luna medium or adding temperature", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => { const body = JSON.parse(String(init?.body)); assert.equal(body.model, "gpt-5.6-luna"); assert.equal(body.reasoning.effort, "medium"); assert.equal(body.temperature, undefined); return Response.json({ model: body.model, status: "completed", output: [], usage: { input_tokens: 12, output_tokens: 4, total_tokens: 16 } }); };
  try { const result = await new FetchOpenAIHttpClient("test-key", "gpt-5.6-luna").post("/chat/completions", { messages: [{ role: "user", content: "demo" }] }, AbortSignal.timeout(1000)) as { usage: unknown }; assert.deepEqual(result.usage, { input_tokens: 12, output_tokens: 4, total_tokens: 16 }); } finally { globalThis.fetch = originalFetch; }
});

test("PostgreSQL replay: 34 images, multiple windows, OCR 503, durable recovery and offline tape", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async () => {
  const first = await replay(`${root}/L-operational-34.json`);
  assert.equal(first.report.passed, true, renderReport(first.report));
  assert.equal(first.report.counts.supplier_loads, 34);
  assert.ok(first.report.workerRuns >= 5);
  assert.equal(first.report.ai.visionCalls, 34);
  assert.equal(first.report.ai.ocrCalls, 35);
  assert.ok(first.report.checkpoints.length > 34);
  const second = await replay(`${root}/L-operational-34.json`, { tape: first.tape });
  assert.equal(second.report.passed, true, renderReport(second.report));
  assert.deepEqual(second.report.counts, first.report.counts);
});
