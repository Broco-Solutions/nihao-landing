import { AsyncLocalStorage } from "node:async_hooks";
import { AgentCheckpoint, AgentSuperseded } from "./agent-contract.ts";

export function envPositive(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid ${name}`);
  return value;
}
export const operationContext = new AsyncLocalStorage<{ deadline: number }>();
export function safeDeadline(runtimeMs = envPositive("WHATSAPP_WORKER_RUNTIME_MS", 300_000), started = Date.now()) {
  const buffer = envPositive("WHATSAPP_SHUTDOWN_BUFFER_MS", 80_000);
  if (buffer >= runtimeMs) throw new Error("Shutdown buffer must be smaller than worker runtime");
  return started + runtimeMs - buffer;
}
export function requireTime(ms = 30_000, deadline = operationContext.getStore()?.deadline) {
  if (deadline !== undefined && Date.now() + ms >= deadline) throw new AgentCheckpoint();
}
export function controlError(error: unknown) { return error instanceof AgentCheckpoint || error instanceof AgentSuperseded; }
export type Failure = { type: string; retryable: boolean; status?: number; retryAfterMs?: number };
export function failure(error: unknown): Failure {
  const e = error as { name?: string; message?: string; code?: string; status?: number; retryAfterMs?: number; cause?: { code?: string } };
  const status = e?.status ?? Number(e?.message?.match(/HTTP (\d{3})/u)?.[1] ?? 0);
  const code = e?.code ?? e?.cause?.code;
  if (status === 429) return { type: "PROVIDER_RATE_LIMIT", retryable: true, status, retryAfterMs: e.retryAfterMs };
  if (status === 408) return { type: "PROVIDER_TIMEOUT", retryable: true, status };
  if (status >= 500) return { type: "PROVIDER_UNAVAILABLE", retryable: true, status, retryAfterMs: e.retryAfterMs };
  if (/timeout|timedout|abort/iu.test(`${e?.name} ${e?.message} ${code}`)) return { type: "PROVIDER_TIMEOUT", retryable: true };
  if (["ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "EPIPE", "UND_ERR_SOCKET"].includes(code ?? "") || /fetch failed|connection closed|network/iu.test(e?.message ?? "")) return { type: "PROVIDER_NETWORK_ERROR", retryable: true };
  if (e?.name === "CircuitOpenError") return { type: "PROVIDER_CIRCUIT_OPEN", retryable: true, retryAfterMs: e.retryAfterMs };
  if (status === 401 || status === 403) return { type: "PROVIDER_CONFIGURATION", retryable: true, status };
  if (status >= 400 || /Validation|Syntax/iu.test(e?.name ?? "")) return { type: "INVALID_ASSET_OR_RESPONSE", retryable: false, status: status || undefined };
  // Unknown failures remain recoverable for a bounded number of worker runs.
  return { type: e?.name || "UNKNOWN_INFRASTRUCTURE_ERROR", retryable: true };
}
export function backoff(attempt: number, retryAfterMs = 0, random = Math.random) {
  return Math.max(retryAfterMs, Math.min(30_000, 500 * 2 ** Math.min(attempt - 1, 6)) * (0.5 + random()));
}
export class ProviderHttpError extends Error {
  constructor(readonly provider: string, readonly status: number, readonly retryAfterMs?: number) { super(`${provider} respondió HTTP ${status}`); }
}
export function observeResponse(provider: string, response: Response, started: number, makeError?: (status: number) => Error) {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => { if (/^(?:retry-after|x-ratelimit-[a-z-]+|ratelimit-[a-z-]+)$/u.test(key)) headers[key] = value; });
  console.info("WhatsApp provider response", { provider, status: response.status, latency: Date.now() - started, headers });
  const retry = response.headers.get("retry-after");
  const parsedRetry = retry ? Math.max(0, Number.isFinite(Number(retry)) ? Number(retry) * 1000 : Date.parse(retry) - Date.now()) : undefined;
  const retryAfterMs = parsedRetry !== undefined && Number.isFinite(parsedRetry) ? parsedRetry : undefined;
  if (!response.ok) throw makeError ? Object.assign(makeError(response.status), { status: response.status, retryAfterMs }) : new ProviderHttpError(provider, response.status, retryAfterMs);
}

/** Process-wide slots. Waiters are bounded by the worker's persistent asset queue. */
export class Limiter {
  active = 0; peak = 0;
  private waiting: Array<() => void> = [];
  constructor(readonly capacity: number) { if (!Number.isInteger(capacity) || capacity < 1) throw new Error("Invalid concurrency"); }
  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.capacity) await new Promise<void>((resolve) => this.waiting.push(resolve));
    else this.active++;
    this.peak = Math.max(this.peak, this.active);
    try { return await task(); }
    finally { const next = this.waiting.shift(); if (next) next(); else this.active--; }
  }
}

/** Bound original-object streaming; cancellation has no business side effects. */
export async function originalBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  requireTime();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => {
    reject(Object.assign(new Error("Original storage stream timeout"), { code: "ETIMEDOUT" }));
    void reader.cancel().catch(() => {});
  }, 20_000); });
  const read = async () => {
    for (;;) { const part = await reader.read(); if (part.done) break; chunks.push(part.value); length += part.value.byteLength; }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  };
  try { return await Promise.race([read(), timeout]); }
  finally { clearTimeout(timer); }
}
