import { FetchMistralHttpClient, type MistralHttpClient } from "../../bot/extraction/mistral-extraction-provider.ts";

export const OPENAI_AGENT_MODEL = "gpt-5.6-luna";
export class OpenAIResponseError extends Error {}

/** Chat history stays in our durable database; OpenAI receives the authorized context per call. */
export class FetchOpenAIHttpClient implements MistralHttpClient {
  constructor(private readonly apiKey: string, private readonly model = process.env.WHATSAPP_AGENT_MODEL ?? OPENAI_AGENT_MODEL) {
    if (!apiKey) throw new Error("Falta configurar OPENAI_API_KEY");
    if (!model.startsWith("gpt-")) throw new Error("WHATSAPP_AGENT_MODEL debe ser un modelo de OpenAI");
  }
  async post(path: string, body: unknown, signal: AbortSignal): Promise<unknown> {
    if (path !== "/chat/completions") throw new Error("OpenAI sólo recibe interpretación de texto y tools");
    const { max_tokens, tool_choice, ...input } = body as Record<string, unknown>;
    const response = await fetch(`https://api.openai.com/v1${path}`, {
      method: "POST", headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" }, signal,
      body: JSON.stringify({ ...input, model: this.model, store: false, reasoning_effort: "none", max_completion_tokens: max_tokens ?? 4096, ...(tool_choice ? { tool_choice: tool_choice === "any" ? "required" : tool_choice } : {}) }),
    });
    if (!response.ok) throw new OpenAIResponseError(`OpenAI respondió HTTP ${response.status}`);
    try { return await response.json(); } catch { throw new OpenAIResponseError("OpenAI no devolvió JSON"); }
  }
}

/** Media never goes to OpenAI. Text, OCR interpretation, segmentation and tools do. */
export function createWhatsAppAIClient(): MistralHttpClient {
  const brain = new FetchOpenAIHttpClient(process.env.OPENAI_API_KEY!);
  if (!process.env.MISTRAL_API_KEY) throw new Error("Falta configurar MISTRAL_API_KEY");
  const media = new FetchMistralHttpClient(process.env.MISTRAL_API_KEY);
  return { post(path, body, signal) {
    const messages = (body as { messages?: Array<{ content?: unknown }> }).messages;
    const imageInput = messages?.some((message) => Array.isArray(message.content) && message.content.some((part: { type?: string }) => part.type === "image_url"));
    return (path === "/ocr" || imageInput ? media : brain).post(path, body, signal);
  } };
}
