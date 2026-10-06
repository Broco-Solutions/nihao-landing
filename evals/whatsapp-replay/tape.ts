import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile, realpath } from "node:fs/promises";
import { IngestionValidationError } from "../../lib/channels/whatsapp/multimodal-reading.ts";
import { ValidationError } from "../../lib/bot/validation.ts";
import { resolve, relative, dirname } from "node:path";

export const hash = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export type TapeEntry = { kind: string; requestHash: string; response?: unknown; error?: { name: string; message: string }; durationMs: number };
export type TapeData = { version: 1; configHash: string; entries: TapeEntry[]; providerCalls?: Array<{ kind: string; durationMs: number; usage?: unknown }> };
export class ReplayMismatch extends Error {}
export class IdentityMap {
  private entries = new Map<string, string>();
  constructor(private prefix: string) {}
  observe(value: unknown) {
    if (Array.isArray(value)) { value.forEach((v) => this.observe(v)); return; }
    if (!value || typeof value !== "object") return;
    for (const [key, v] of Object.entries(value)) {
      if (["id", "captureId", "supplierId", "operationId", "version"].includes(key) && typeof v === "string" && !v.includes(this.prefix) && !this.entries.has(v)) this.entries.set(v, `__REPLAY_ID_${this.entries.size}__`);
      else if (typeof v === "object") this.observe(v);
    }
  }
  transform(value: unknown, restore = false): unknown {
    if (typeof value === "string") {
      let result = value.split(restore ? "__RUN__" : this.prefix).join(restore ? this.prefix : "__RUN__");
      for (const [actual, token] of [...this.entries].sort(([a], [b]) => b.length - a.length)) result = result.split(restore ? token : actual).join(restore ? actual : token);
      return result;
    }
    if (Array.isArray(value)) return value.map((v) => this.transform(v, restore));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, this.transform(v, restore)]));
    return value;
  }
}
export class ReplayTape {
  entries: TapeEntry[] = []; mismatches: string[] = []; private index = 0;
  constructor(readonly identities: IdentityMap, private mode: "deterministic" | "live", readonly configHash: string, private recorded?: TapeData) {
    if (recorded && (recorded.version !== 1 || recorded.configHash !== configHash)) throw new ReplayMismatch("La configuración/prompt/schema difiere del tape grabado");
  }
  async call<T>(kind: string, request: unknown, live: () => Promise<T>): Promise<T> {
    const requestHash = hash(this.identities.transform(request)); const start = performance.now();
    if (this.recorded) {
      const entry = this.recorded.entries[this.index];
      if (!entry || entry.kind !== kind || entry.requestHash !== requestHash) {
        const message = `AI call ${this.index + 1}: expected ${entry?.kind ?? "end"}/${entry?.requestHash ?? "none"}; actual ${kind}/${requestHash}`;
        this.mismatches.push(message); throw new ReplayMismatch(message);
      }
      this.index++; this.entries.push(entry);
      if (entry.error) {
        if (entry.error.name === "ValidationError") throw new ValidationError(entry.error.message);
        if (entry.error.name === "IngestionValidationError") throw new IngestionValidationError(entry.error.message);
        const RecordedError = class extends Error {}; Object.defineProperty(RecordedError, "name", { value: entry.error.name }); throw new RecordedError(entry.error.message);
      }
      return this.identities.transform(entry.response, true) as T;
    }
    try {
      const response = await live();
      this.entries.push({ kind, requestHash, response: this.identities.transform(response), durationMs: performance.now() - start }); return response;
    } catch (error) {
      if (error instanceof ReplayMismatch) this.mismatches.push(error.message);
      // Keep only error category/status: SDK errors can contain credentials or document text.
      const name = error instanceof Error ? error.constructor.name : "Error";
      const message = error instanceof Error && /HTTP \d{3}/u.test(error.message) ? error.message.match(/HTTP \d{3}/u)![0] : name;
      this.entries.push({ kind, requestHash, error: { name, message }, durationMs: performance.now() - start }); throw error;
    }
  }
  finish() { if (this.recorded && this.index !== this.recorded.entries.length) this.mismatches.push(`Tape tiene ${this.recorded.entries.length - this.index} llamadas sin consumir`); }
  data(): TapeData { return { version: 1, configHash: this.configHash, entries: this.entries }; }
}
export function redactSecrets(value: string) {
  let clean = value.replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|Bearer\s+\S+)/gu, "[REDACTED_SECRET]");
  for (const key of [process.env.OPENAI_API_KEY, process.env.MISTRAL_API_KEY]) if (key && key.length >= 8) clean = clean.split(key).join("[REDACTED_SECRET]");
  return clean;
}
export async function privateWrite(path: string, value: unknown) {
  const root = resolve("replay-output"); const target = resolve(path);
  if (relative(root, target).startsWith("..") || target === root) throw new Error("Los reportes/tapes deben guardarse dentro de replay-output (ignorado por Git)");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const actualRoot = await realpath(root); if (actualRoot !== root) throw new Error("El directorio privado no puede ser un symlink");
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  if (relative(actualRoot, await realpath(dirname(target))).startsWith("..")) throw new Error("Directorio de salida enlazado fuera del área privada");
  await writeFile(target, JSON.stringify(value, (_key, v) => typeof v === "string" ? redactSecrets(v) : v, 2) + "\n", { mode: 0o600, flag: "wx" });
}
export async function readTape(path: string) {
  const data = JSON.parse(await readFile(path, "utf8")) as TapeData;
  if (data.version !== 1 || typeof data.configHash !== "string" || !Array.isArray(data.entries) || data.entries.some((entry) => !entry || typeof entry.kind !== "string" || !/^[a-f0-9]{64}$/u.test(entry.requestHash) || !Number.isFinite(entry.durationMs) || entry.error && (typeof entry.error.name !== "string" || typeof entry.error.message !== "string"))) throw new ReplayMismatch("Tape inválido");
  return data;
}
