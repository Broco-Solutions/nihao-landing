import test from "node:test";
import assert from "node:assert/strict";
import { FetchOpenAIHttpClient } from "../../lib/channels/whatsapp/agent-provider.ts";

const tools = [{ type: "function", function: { name: "get_context", strict: true, parameters: { type: "object", properties: {}, required: [], additionalProperties: false } } }];
const request = (text: string) => ({ tools, messages: [{ role: "system", content: "Stable Nihao instructions" }, { role: "user", content: text }] });

test("modern agent requests cache the stable system boundary without changing content, tools or usage", async () => {
  const originalFetch = globalThis.fetch; const originalInfo = console.info;
  const sent: Array<Record<string, unknown>> = []; const logs: unknown[][] = [];
  const usage = { input_tokens: 2048, input_tokens_details: { cached_tokens: 1536, cache_write_tokens: 128 } };
  globalThis.fetch = async (_url, options) => { sent.push(JSON.parse(String(options?.body))); return Response.json({ status: "completed", output: [], usage }); };
  console.info = (...args) => { logs.push(args); };
  try {
    for (const model of ["gpt-5.6-luna", "gpt-6.1-sol"]) {
      const client = new FetchOpenAIHttpClient("test-key", model);
      const first = await client.post("/chat/completions", request("private first batch"), AbortSignal.timeout(1000)) as { usage: unknown };
      await client.post("/chat/completions", request("private second batch"), AbortSignal.timeout(1000));
      assert.deepEqual(first.usage, usage);
    }
    for (const body of sent) {
      assert.deepEqual(body.prompt_cache_options, { mode: "implicit", ttl: "30m" });
      assert.equal(body.prompt_cache_retention, undefined);
      assert.equal(body.prompt_cache_key, undefined);
      assert.equal(body.store, false);
      assert.deepEqual(body.tools, [{ type: "function", ...tools[0].function }]);
      const input = body.input as Array<{ role: string; content: unknown }>;
      assert.deepEqual(input[0], { role: "system", content: [{ type: "input_text", text: "Stable Nihao instructions", prompt_cache_breakpoint: { mode: "explicit" } }] });
      assert.equal(typeof input[1].content, "string");
    }
    assert.deepEqual((sent[0].input as unknown[])[0], (sent[1].input as unknown[])[0]);
    assert.notDeepEqual((sent[0].input as unknown[])[1], (sent[1].input as unknown[])[1]);
    const cacheLogs = logs.filter(([label]) => label === "WhatsApp OpenAI prompt cache");
    assert.equal(cacheLogs.length, 4);
    assert.equal((cacheLogs[0][1] as { cachedTokens: number }).cachedTokens, 1536);
    assert.equal((cacheLogs[0][1] as { cacheWriteTokens: number }).cacheWriteTokens, 128);
    assert.ok(!JSON.stringify(logs).includes("private"));
  } finally { globalThis.fetch = originalFetch; console.info = originalInfo; }
});

test("legacy models get stable prefix keys, never unsupported explicit caching options", async () => {
  const original = globalThis.fetch; const sent: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (_url, options) => { sent.push(JSON.parse(String(options?.body))); return Response.json({ status: "completed", output: [] }); };
  try {
    const client = new FetchOpenAIHttpClient("test-key", "gpt-4.1");
    await client.post("/chat/completions", request("one"), AbortSignal.timeout(1000));
    await client.post("/chat/completions", request("two"), AbortSignal.timeout(1000));
    await client.post("/chat/completions", { ...request("three"), tools: [{ ...tools[0], function: { ...tools[0].function, description: "changed" } }] }, AbortSignal.timeout(1000));
    assert.equal(sent[0].prompt_cache_key, sent[1].prompt_cache_key);
    assert.notEqual(sent[0].prompt_cache_key, sent[2].prompt_cache_key);
    assert.match(sent[0].prompt_cache_key as string, /^nihao-wa-v1:[a-f0-9]{48}$/u);
    assert.equal(sent[0].prompt_cache_options, undefined);
    assert.deepEqual((sent[0].input as unknown[])[0], { role: "system", content: "Stable Nihao instructions" });
  } finally { globalThis.fetch = original; }
});

test("extraction calls and agent calls without a system prefix keep their existing wire input", async () => {
  const original = globalThis.fetch; const sent: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (_url, options) => { sent.push(JSON.parse(String(options?.body))); return Response.json({ status: "completed", output: [] }); };
  try {
    const client = new FetchOpenAIHttpClient("test-key");
    await client.post("/chat/completions", { messages: request("extraction").messages }, AbortSignal.timeout(1000));
    await client.post("/chat/completions", { tools, messages: [{ role: "user", content: "tools" }] }, AbortSignal.timeout(1000));
    for (const body of sent) { assert.equal(body.prompt_cache_options, undefined); assert.equal(body.prompt_cache_key, undefined); }
    assert.deepEqual(sent[0].input, request("extraction").messages);
  } finally { globalThis.fetch = original; }
});
