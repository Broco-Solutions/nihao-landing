import { FetchOpenAIHttpClient, OPENAI_AGENT_MODEL, OPENAI_AGENT_REASONING_EFFORT, OPENAI_AGENT_TEMPERATURE } from "../lib/channels/whatsapp/agent-provider.ts";

// No database writes or WhatsApp messages: validate real function calling before rollout.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  const response = await originalFetch(...args);
  if (!response.ok) {
    const body = await response.clone().json() as { error?: { message?: string; param?: string; code?: string } };
    console.error("OpenAI configuration rejected", { status: response.status, error: body.error });
  }
  return response;
};
const client = new FetchOpenAIHttpClient(process.env.OPENAI_API_KEY!);
console.info("Checking WhatsApp OpenAI configuration", { model: process.env.WHATSAPP_AGENT_MODEL ?? OPENAI_AGENT_MODEL, reasoningEffort: OPENAI_AGENT_REASONING_EFFORT, temperature: OPENAI_AGENT_TEMPERATURE });
const result = await client.post("/chat/completions", {
  temperature: OPENAI_AGENT_TEMPERATURE,
  max_tokens: 2048,
  parallel_tool_calls: false,
  messages: [{ role: "user", content: "Call verify_configuration with ok=true. This is a configuration check with no external action." }],
  tools: [{ type: "function", function: { name: "verify_configuration", description: "Verify API configuration without changing any data.", parameters: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false } } }],
  tool_choice: { type: "function", function: { name: "verify_configuration" } },
}, AbortSignal.timeout(30_000)) as { model?: string; choices?: Array<{ finish_reason?: string; message?: { tool_calls?: Array<{ function: { name: string; arguments: string } }> } }> };
const call = result.choices?.[0]?.message?.tool_calls?.[0];
if (result.choices?.[0]?.finish_reason !== "tool_calls" || call?.function.name !== "verify_configuration" || JSON.parse(call.function.arguments).ok !== true) {
  throw new Error("OpenAI configuration check did not return the expected tool call");
}
console.info("WhatsApp OpenAI configuration verified", { model: result.model ?? process.env.WHATSAPP_AGENT_MODEL ?? OPENAI_AGENT_MODEL, reasoningEffort: OPENAI_AGENT_REASONING_EFFORT, temperature: OPENAI_AGENT_TEMPERATURE });
