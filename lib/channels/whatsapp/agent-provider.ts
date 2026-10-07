import { observeResponse } from "./operational-runtime.ts";
import { createHash } from "node:crypto";
import { resilientClient } from "./provider-resilience.ts";
import type { AgentChatMessage } from "./agent-contract.ts";
import { FetchMistralHttpClient, type MistralHttpClient } from "../../bot/extraction/mistral-extraction-provider.ts";

export const OPENAI_AGENT_MODEL = "gpt-5.6-luna";
export const OPENAI_AGENT_REASONING_EFFORT = "medium";
export class OpenAIResponseError extends Error {}

function supportsExplicitCache(model: string): boolean {
  const version = /^gpt-(\d+)(?:\.(\d+))?/u.exec(model);
  return Boolean(version && (Number(version[1]) > 5 || Number(version[1]) === 5 && Number(version[2] ?? 0) >= 6));
}

/** Chat history stays in our durable database; OpenAI receives the authorized context per call. */
export class FetchOpenAIHttpClient implements MistralHttpClient {
  constructor(private readonly apiKey: string, private readonly model = process.env.WHATSAPP_AGENT_MODEL ?? OPENAI_AGENT_MODEL) {
    if (!apiKey) throw new Error("Falta configurar OPENAI_API_KEY");
    if (!model.startsWith("gpt-")) throw new Error("WHATSAPP_AGENT_MODEL debe ser un modelo de OpenAI");
  }
  async post(path: string, body: unknown, signal: AbortSignal): Promise<unknown> {
    if (path !== "/chat/completions") throw new Error("OpenAI sólo recibe interpretación de texto y tools");
    const request = body as {
      max_tokens?: number; messages?: AgentChatMessage[]; parallel_tool_calls?: boolean;
      tool_choice?: string | { type: "function"; function: { name: string } };
      tools?: Array<{ type: "function"; function: Record<string, unknown> }>;
      response_format?: { type: string; json_schema?: Record<string, unknown> };
    };
    const systemMessages = (request.messages ?? []).filter((message) => message.role === "system" && message.content !== null);
    const cacheAgent = Boolean(request.tools?.length && systemMessages.length);
    const explicitCache = cacheAgent && supportsExplicitCache(this.model);
    const cacheSettings = explicitCache
      ? { prompt_cache_options: { mode: "implicit", ttl: "30m" } }
      : cacheAgent ? { prompt_cache_key: `nihao-wa-v1:${createHash("sha256").update(JSON.stringify({ model: this.model, system: systemMessages.map((message) => message.content), tools: request.tools, format: request.response_format })).digest("hex").slice(0, 48)}` } : {};
    const input: Record<string, unknown>[] = [];
    for (const message of request.messages ?? []) {
      if (message.role === "tool") {
        input.push({ type: "function_call_output", call_id: message.tool_call_id, output: message.content ?? "" });
      } else if (message.role === "assistant" && message.response_items?.length) {
        // Replay encrypted reasoning and the exact calls even after a durable worker restart.
        input.push(...message.response_items);
      } else {
        if (message.content != null) input.push({ role: message.role, content: explicitCache && message === systemMessages.at(-1)
          ? [{ type: "input_text", text: message.content, prompt_cache_breakpoint: { mode: "explicit" } }]
          : message.content });
        for (const call of message.tool_calls ?? []) input.push({ type: "function_call", call_id: call.id, name: call.function.name, arguments: call.function.arguments });
      }
    }
    const choice = request.tool_choice;
    const format = request.response_format;
    const started = Date.now();
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" }, signal,
      body: JSON.stringify({
        model: this.model, store: false, input,
        ...cacheSettings,
        reasoning: { effort: OPENAI_AGENT_REASONING_EFFORT },
        include: ["reasoning.encrypted_content"], max_output_tokens: request.max_tokens ?? 4096,
        ...(request.parallel_tool_calls !== undefined ? { parallel_tool_calls: request.parallel_tool_calls } : {}),
        ...(request.tools ? { tools: request.tools.map((tool) => ({ type: tool.type, ...tool.function, strict: tool.function.strict ?? true })) } : {}),
        ...(choice ? { tool_choice: typeof choice === "string" ? (choice === "any" ? "required" : choice) : { type: "function", name: choice.function.name } } : {}),
        ...(format ? { text: { format: format.type === "json_schema" ? { type: format.type, ...format.json_schema } : format } } : {}),
      }),
    });
    observeResponse("OpenAI", response, started, (status) => new OpenAIResponseError(`OpenAI respondió HTTP ${status}`));
    let result: { model?: string; status?: string; usage?: Record<string, unknown>; output?: Array<Record<string, unknown>> };
    try { result = await response.json(); } catch { throw new OpenAIResponseError("OpenAI no devolvió JSON"); }
    if (result.status === "failed" || result.status === "incomplete") throw new OpenAIResponseError("OpenAI no completó la respuesta");
    if (cacheAgent) {
      const details = result.usage?.input_tokens_details as Record<string, unknown> | undefined;
      console.info("WhatsApp OpenAI prompt cache", {
        model: this.model, latencyMs: Date.now() - started,
        inputTokens: result.usage?.input_tokens ?? null,
        cachedTokens: details?.cached_tokens ?? null,
        cacheWriteTokens: details?.cache_write_tokens ?? null,
      });
    }
    const items = result.output ?? [];
    const calls = items.filter((item) => item.type === "function_call").map((item) => ({ id: item.call_id, type: "function", function: { name: item.name, arguments: item.arguments } }));
    const content = items.filter((item) => item.type === "message").flatMap((item) => (item.content as Array<{ type: string; text?: string }> ?? []).filter((part) => part.type === "output_text").map((part) => part.text ?? "")).join("");
    return { model: result.model, usage: result.usage, choices: [{ finish_reason: calls.length ? "tool_calls" : "stop", message: { role: "assistant", content: content || null, ...(calls.length ? { tool_calls: calls } : {}), response_items: items } }] };
  }
}

/** Media never goes to OpenAI. Text, OCR interpretation, segmentation and tools do. */
export function createWhatsAppAIClient(): MistralHttpClient {
  const brain = resilientClient(new FetchOpenAIHttpClient(process.env.OPENAI_API_KEY!), "OpenAI", "text");
  if (!process.env.MISTRAL_API_KEY) throw new Error("Falta configurar MISTRAL_API_KEY");
  const media = new FetchMistralHttpClient(process.env.MISTRAL_API_KEY);
  const ocr = resilientClient(media, "Mistral", "ocr");
  const vision = resilientClient(media, "Mistral", "vision");
  return { post(path, body, signal) {
    const messages = (body as { messages?: Array<{ content?: unknown }> }).messages;
    const imageInput = messages?.some((message) => Array.isArray(message.content) && message.content.some((part: { type?: string }) => part.type === "image_url"));
    return (path === "/ocr" ? ocr : imageInput ? vision : brain).post(path, body, signal);
  } };
}
