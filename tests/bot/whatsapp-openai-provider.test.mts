import test from "node:test";
import assert from "node:assert/strict";
import { FetchOpenAIHttpClient, OpenAIResponseError, createWhatsAppAIClient } from "../../lib/channels/whatsapp/agent-provider.ts";

test("OpenAI converts required tool calls, limits tokens and keeps context stateless", async () => {
  const original = globalThis.fetch; let actual: Record<string, unknown> | undefined;
  globalThis.fetch = async (url, options) => { assert.equal(url, "https://api.openai.com/v1/chat/completions"); actual = JSON.parse(String(options?.body)); return Response.json({ choices: [] }); };
  try {
    await new FetchOpenAIHttpClient("test-key", "gpt-5.6-luna").post("/chat/completions", { model: "mistral-small-2603", tool_choice: "any", max_tokens: 2048, temperature: 0, reasoning_effort: "none", messages: [{ role: "tool", tool_call_id: "x", content: "{}" }] }, AbortSignal.timeout(1000));
    assert.equal(actual?.model, "gpt-5.6-luna"); assert.equal(actual?.tool_choice, "required"); assert.equal(actual?.max_completion_tokens, 2048); assert.equal(actual?.store, false); assert.equal(actual?.reasoning_effort, "medium"); assert.equal(actual?.temperature, 0.2); assert.equal(actual?.max_tokens, undefined);
  } finally { globalThis.fetch = original; }
});
test("split provider routes OCR and image understanding to Mistral, tools and text to OpenAI", async () => {
  const original = globalThis.fetch; const prior = { openai: process.env.OPENAI_API_KEY, mistral: process.env.MISTRAL_API_KEY, model: process.env.WHATSAPP_AGENT_MODEL }; const urls: string[] = [];
  globalThis.fetch = async (url) => { urls.push(String(url)); return Response.json({}); };
  process.env.OPENAI_API_KEY = "test-openai"; process.env.MISTRAL_API_KEY = "test-mistral"; process.env.WHATSAPP_AGENT_MODEL = "gpt-5.6-luna";
  try {
    const client = createWhatsAppAIClient(); const signal = AbortSignal.timeout(1000);
    await client.post("/ocr", {}, signal); await client.post("/chat/completions", { messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,test" } }] }] }, signal);
    await client.post("/chat/completions", { messages: [{ role: "user", content: "OCR interpretation" }] }, signal);
    assert.deepEqual(urls, ["https://api.mistral.ai/v1/ocr", "https://api.mistral.ai/v1/chat/completions", "https://api.openai.com/v1/chat/completions"]);
  } finally { globalThis.fetch = original; for (const [key,value] of [["OPENAI_API_KEY",prior.openai],["MISTRAL_API_KEY",prior.mistral],["WHATSAPP_AGENT_MODEL",prior.model]]) { if (value === undefined) delete process.env[key!]; else process.env[key!] = value; } }
});
test("OpenAI errors contain status only and reject media endpoints and invalid models", async () => {
  const original = globalThis.fetch; globalThis.fetch = async () => new Response("private provider payload", { status: 429 });
  try { const client = new FetchOpenAIHttpClient("key", "gpt-5.6-luna"); await assert.rejects(() => client.post("/chat/completions", {}, AbortSignal.timeout(1000)), { message: "OpenAI respondió HTTP 429", constructor: OpenAIResponseError }); await assert.rejects(() => client.post("/ocr", {}, AbortSignal.timeout(1000))); assert.throws(() => new FetchOpenAIHttpClient("key", "mistral-small-2603")); } finally { globalThis.fetch = original; }
});
