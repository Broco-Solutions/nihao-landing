import { FetchMistralHttpClient, MistralExtractionProvider, type MistralHttpClient } from "../../lib/bot/extraction/mistral-extraction-provider.ts";
import type { BusinessCardResolver } from "../../lib/bot/extraction/storage-business-card-resolver.ts";

/** Observes provider usage without changing the production model, prompt or timeout. */
export function observedMistralProvider(businessCards: BusinessCardResolver) {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_API_KEY is unavailable locally");
  const delegate = new FetchMistralHttpClient(apiKey);
  const usage: Array<Record<string, number>> = [];
  const client: MistralHttpClient = { async post(endpoint, body, signal) {
    const response = await delegate.post(endpoint, body, signal);
    const record = response && typeof response === "object" ? response as Record<string, unknown> : {};
    const raw = record.usage ?? record.usage_info;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const allowed = ["prompt_tokens", "completion_tokens", "total_tokens", "input_tokens", "output_tokens", "pages_processed"];
      const numeric = Object.fromEntries(allowed.flatMap((key) => typeof (raw as Record<string, unknown>)[key] === "number" ? [[key, (raw as Record<string, number>)[key]]] : []));
      if (Object.keys(numeric).length) usage.push(numeric);
    }
    return response;
  } };
  return { provider: new MistralExtractionProvider({ client, businessCards }), usage };
}
