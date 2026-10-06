import test from "node:test";
import assert from "node:assert/strict";
import { FetchOpenAIHttpClient, OpenAIResponseError, createWhatsAppAIClient } from "../../lib/channels/whatsapp/agent-provider.ts";

test("OpenAI converts required tool calls, limits tokens and keeps context stateless", async () => {
  const original = globalThis.fetch; let actual: Record<string, unknown> | undefined;
  globalThis.fetch = async (url, options) => { assert.equal(url, "https://api.openai.com/v1/responses"); actual = JSON.parse(String(options?.body)); return Response.json({ choices: [] }); };
  try {
    await new FetchOpenAIHttpClient("test-key", "gpt-5.6-luna").post("/chat/completions", { model: "mistral-small-2603", tool_choice: "any", max_tokens: 2048, temperature: 0, reasoning_effort: "none", messages: [{ role: "tool", tool_call_id: "x", content: "{}" }] }, AbortSignal.timeout(1000));
    assert.equal(actual?.model, "gpt-5.6-luna"); assert.equal(actual?.tool_choice, "required"); assert.equal(actual?.max_output_tokens, 2048); assert.equal(actual?.store, false); assert.deepEqual(actual?.reasoning, { effort: "medium" }); assert.equal(actual?.temperature, undefined); assert.equal(actual?.max_tokens, undefined);
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
    assert.deepEqual(urls, ["https://api.mistral.ai/v1/ocr", "https://api.mistral.ai/v1/chat/completions", "https://api.openai.com/v1/responses"]);
  } finally { globalThis.fetch = original; for (const [key,value] of [["OPENAI_API_KEY",prior.openai],["MISTRAL_API_KEY",prior.mistral],["WHATSAPP_AGENT_MODEL",prior.model]]) { if (value === undefined) delete process.env[key!]; else process.env[key!] = value; } }
});
test("OpenAI errors contain status only and reject media endpoints and invalid models", async () => {
  const original = globalThis.fetch; globalThis.fetch = async () => new Response("private provider payload", { status: 429 });
  try { const client = new FetchOpenAIHttpClient("key", "gpt-5.6-luna"); await assert.rejects(() => client.post("/chat/completions", {}, AbortSignal.timeout(1000)), { message: "OpenAI respondió HTTP 429", constructor: OpenAIResponseError }); await assert.rejects(() => client.post("/ocr", {}, AbortSignal.timeout(1000))); assert.throws(() => new FetchOpenAIHttpClient("key", "mistral-small-2603")); } finally { globalThis.fetch = original; }
});

test("Responses preserves encrypted reasoning and call IDs across serialized checkpoints", async () => {
  const original = globalThis.fetch;
  const items = [{ type: "reasoning", id: "rs_1", summary: [], encrypted_content: "encrypted" }, { type: "function_call", id: "fc_1", call_id: "call_1", name: "get_context", arguments: "{}", status: "completed" }];
  let sent: Record<string, unknown> = {};
  globalThis.fetch = async (_url, options) => { sent = JSON.parse(String(options?.body)); return Response.json({ model: "gpt-5.6-luna", status: "completed", output: items }); };
  try {
    const client = new FetchOpenAIHttpClient("key");
    const first = await client.post("/chat/completions", { tools: [{ type: "function", function: { name: "get_context", parameters: { type: "object", properties: {} } } }], tool_choice: { type: "function", function: { name: "get_context" } }, messages: [{ role: "user", content: "Consulta" }] }, AbortSignal.timeout(1000)) as { choices: Array<{ message: Record<string, unknown>; finish_reason: string }> };
    assert.deepEqual(sent.tool_choice, { type: "function", name: "get_context" });
    assert.deepEqual(sent.tools, [{ type: "function", name: "get_context", parameters: { type: "object", properties: {} }, strict: false }]);
    assert.equal(first.choices[0].finish_reason, "tool_calls");
    assert.deepEqual(first.choices[0].message.tool_calls, [{ id: "call_1", type: "function", function: { name: "get_context", arguments: "{}" } }]);
    const checkpoint = JSON.parse(JSON.stringify(first.choices[0].message));
    await new FetchOpenAIHttpClient("key").post("/chat/completions", { messages: [{ role: "user", content: "Consulta" }, checkpoint, { role: "tool", tool_call_id: "call_1", content: '{"trips":[]}' }] }, AbortSignal.timeout(1000));
    assert.deepEqual(sent.input, [{ role: "user", content: "Consulta" }, ...items, { type: "function_call_output", call_id: "call_1", output: '{"trips":[]}' }]);
    assert.deepEqual(sent.include, ["reasoning.encrypted_content"]);
    assert.equal(sent.previous_response_id, undefined);
  } finally { globalThis.fetch = original; }
});

test("Responses maps JSON formats and text back to extraction contracts", async () => {
  const original = globalThis.fetch; let sent: Record<string, unknown> = {};
  globalThis.fetch = async (_url, options) => { sent = JSON.parse(String(options?.body)); return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: '{"name":"Alfa"}' }] }] }); };
  try {
    const client = new FetchOpenAIHttpClient("key");
    const response = await client.post("/chat/completions", { messages: [{ role: "user", content: "JSON" }], response_format: { type: "json_schema", json_schema: { name: "supplier", strict: true, schema: { type: "object" } } } }, AbortSignal.timeout(1000)) as { choices: Array<{ message: { content: string } }> };
    assert.deepEqual(sent.text, { format: { type: "json_schema", name: "supplier", strict: true, schema: { type: "object" } } });
    assert.equal(response.choices[0].message.content, '{"name":"Alfa"}');
    await client.post("/chat/completions", { response_format: { type: "json_object" } }, AbortSignal.timeout(1000));
    assert.deepEqual(sent.text, { format: { type: "json_object" } });
  } finally { globalThis.fetch = original; }
});

test("Responses refuses incomplete results before executing any tool", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ status: "incomplete", output: [{ type: "function_call", call_id: "call_1", name: "create_product_draft", arguments: "{}" }] });
  try { await assert.rejects(() => new FetchOpenAIHttpClient("key").post("/chat/completions", {}, AbortSignal.timeout(1000)), OpenAIResponseError); }
  finally { globalThis.fetch = original; }
});
