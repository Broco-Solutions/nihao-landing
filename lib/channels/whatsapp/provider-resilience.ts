import type { MistralHttpClient } from "../../bot/extraction/mistral-extraction-provider.ts";
import { backoff, controlError, envPositive, failure, Limiter, requireTime } from "./operational-runtime.ts";

export class CircuitOpenError extends Error {
  constructor(readonly retryAfterMs: number) { super("Provider circuit open"); this.name = "CircuitOpenError"; }
}
export class ProviderGate {
  private failures = 0; private openUntil = 0; private probe = false;
  constructor(private readonly threshold = envPositive("WHATSAPP_PROVIDER_CIRCUIT_FAILURES", 3), private readonly cooldown = envPositive("WHATSAPP_PROVIDER_CIRCUIT_COOLDOWN_MS", 30_000), private readonly now = Date.now) {}
  enter() {
    if (this.openUntil && (this.now() < this.openUntil || this.probe)) throw new CircuitOpenError(Math.max(1, this.openUntil - this.now()));
    if (this.openUntil) this.probe = true;
  }
  success() { this.failures = 0; this.openUntil = 0; this.probe = false; }
  fail(error: unknown) {
    this.probe = false;
    const f = failure(error);
    if (f.retryable && (f.status !== 401 && f.status !== 403)) {
      if (++this.failures >= this.threshold) this.openUntil = this.now() + Math.max(this.cooldown, f.retryAfterMs ?? 0);
    } else this.failures = 0;
  }
}
const gates = new Map<string, ProviderGate>();
const slots = new Map<string, Limiter>();
export function resilientClient(client: MistralHttpClient, provider: "OpenAI" | "Mistral", lane: "ocr" | "vision" | "text" | "transcription", options: { limiter?: Limiter; gate?: ProviderGate; attempts?: number; sleep?: (ms: number) => Promise<void>; random?: () => number } = {}): MistralHttpClient {
  const key = `${provider}:${lane}`;
  if (!gates.has(provider)) gates.set(provider, new ProviderGate());
  if (!slots.has(key)) slots.set(key, new Limiter(envPositive(`WHATSAPP_${lane.toUpperCase()}_CONCURRENCY`, 2)));
  const limiter = options.limiter ?? slots.get(key)!;
  const gate = options.gate ?? gates.get(provider)!;
  return { async post(path, body, signal) {
    return limiter.run(async () => {
      const attempts = options.attempts ?? envPositive("WHATSAPP_PROVIDER_REQUEST_ATTEMPTS", 2);
      for (let attempt = 1; ; attempt++) {
        requireTime(); signal.throwIfAborted(); gate.enter();
        const started = Date.now();
        console.info("WhatsApp provider call", { provider, lane, attempt, [`provider_calls_${provider.toLowerCase()}`]: 1, [`${lane}_concurrency_peak`]: limiter.peak });
        try { const result = await client.post(path, body, signal); gate.success(); return result; }
        catch (error) {
          if (controlError(error)) throw error;
          gate.fail(error);
          const f = failure(error);
          console.info("WhatsApp provider failure", { provider, lane, attempt, latency: Date.now() - started, status: f.status, reason: f.type, provider_429: Number(f.status === 429), provider_5xx: Number((f.status ?? 0) >= 500), provider_timeout: Number(f.type === "PROVIDER_TIMEOUT"), provider_network_error: Number(f.type === "PROVIDER_NETWORK_ERROR") });
          if (!f.retryable || attempt >= attempts || signal.aborted) throw error;
          const delay = backoff(attempt, f.retryAfterMs, options.random);
          try { requireTime(delay + 30_000); } catch (budgetError) {
            // Preserve provider Retry-After for the durable nextAttemptAt instead of losing it to a generic yield.
            if (controlError(budgetError)) throw error;
            throw budgetError;
          }
          console.info("WhatsApp provider backoff", { provider, attempt, delay, provider_retry_count: 1 });
          await (options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms))))(delay);
        }
      }
    });
  } };
}
