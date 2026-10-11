import { MAX_AUDIO_ATTACHMENT_SIZE, MAX_IMAGE_ATTACHMENT_SIZE, validateAttachmentContent, validateAttachmentFile } from "../../bot/attachments.ts";

export type MediaIngressCode = "MEDIA_TOO_LARGE" | "MEDIA_UNSUPPORTED" | "MEDIA_INVALID" | "INGRESS_BUSY";
export class MediaIngressError extends Error {
  constructor(readonly code: MediaIngressCode, readonly status = code === "MEDIA_TOO_LARGE" ? 413 : code === "INGRESS_BUSY" ? 429 : 415) {
    super(code === "MEDIA_TOO_LARGE" ? "El archivo supera el tamaño permitido" : code === "INGRESS_BUSY" ? "La recepción está ocupada; el original queda pendiente para reintentar" : "No se pudo validar este formato de archivo");
    this.name = "MediaIngressError";
  }
}
export const isTerminalMediaError = (error: unknown): error is MediaIngressError => error instanceof MediaIngressError && error.code !== "INGRESS_BUSY";
export const mediaByteLimit = (type: string) => type === "AUDIO" ? MAX_AUDIO_ATTACHMENT_SIZE : MAX_IMAGE_ATTACHMENT_SIZE;

/** Size is checked before storage; physical content is checked before AI. */
export function validateOriginalMedia(type: string, mimeType: string, bytes: Uint8Array): void {
  if (!bytes.length || bytes.length > mediaByteLimit(type)) throw new MediaIngressError("MEDIA_TOO_LARGE");
  if (type === "VIDEO" || mimeType.startsWith("video/")) throw new MediaIngressError("MEDIA_UNSUPPORTED");
  if (type === "DOCUMENT") return;
  try { validateAttachmentContent(validateAttachmentFile(mimeType, bytes.length, type === "AUDIO" ? "AUDIO" : "PRODUCT_IMAGE"), bytes); }
  catch { throw new MediaIngressError("MEDIA_INVALID"); }
}

/** Do not trust Content-Length: stop a chunked body before retaining excess bytes. */
export async function readBoundedBytes(stream: ReadableStream<Uint8Array>, options: { maxBytes: number; timeoutMs?: number }): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => {
    reject(Object.assign(new Error("Media stream timeout"), { code: "ETIMEDOUT" }));
    void reader.cancel().catch(() => {});
  }, options.timeoutMs ?? 20_000); });
  const read = async () => {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > options.maxBytes) { void reader.cancel().catch(() => {}); throw new MediaIngressError("MEDIA_TOO_LARGE"); }
      chunks.push(part.value);
    }
    const result = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
    return result;
  };
  try { return await Promise.race([read(), timeout]); }
  finally { clearTimeout(timer); }
}

export async function boundedRequestBody(request: Request, maximum: number): Promise<Uint8Array> {
  if (Number(request.headers.get("content-length") ?? 0) > maximum) throw new MediaIngressError("MEDIA_TOO_LARGE");
  if (!request.body) return new Uint8Array();
  return readBoundedBytes(request.body, { maxBytes: maximum });
}

// These limits bound each process's memory; deployment-wide quotas remain an infrastructure gate.
let active = 0;
const waiting: Array<() => void> = [];
const budgets = new Map<string, { bytes: number; expires: number }>();
const perSender = new Map<string, number>();
export async function withMediaIngress<T extends { bytes: Uint8Array }>(phone: string, task: () => Promise<T>): Promise<T> {
  const capacity = positiveInteger("WHATSAPP_INGRESS_CONCURRENCY", 2);
  const senderInFlight = perSender.get(phone) ?? 0;
  if (senderInFlight >= positiveInteger("WHATSAPP_INGRESS_PER_SENDER", 4)) throw new MediaIngressError("INGRESS_BUSY");
  if (active >= capacity && waiting.length >= positiveInteger("WHATSAPP_INGRESS_QUEUE", 16)) throw new MediaIngressError("INGRESS_BUSY");
  perSender.set(phone, senderInFlight + 1);
  if (active >= capacity) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else active++;
  try {
    const now = Date.now();
    for (const [key, budget] of budgets) if (budget.expires <= now) budgets.delete(key);
    const budget = budgets.get(phone);
    const limit = positiveInteger("WHATSAPP_INGRESS_BYTES_PER_MINUTE", 256 * 1024 * 1024);
    if (budget && budget.bytes >= limit) throw new MediaIngressError("INGRESS_BUSY");
    const result = await task();
    const currentBudget = budgets.get(phone);
    const currentBytes = currentBudget && currentBudget.expires > Date.now() ? currentBudget.bytes : 0;
    if (currentBytes + result.bytes.length > limit) throw new MediaIngressError("INGRESS_BUSY");
    budgets.set(phone, { bytes: currentBytes + result.bytes.length, expires: currentBudget && currentBudget.expires > Date.now() ? currentBudget.expires : Date.now() + 60_000 });
    return result;
  } finally {
    const remaining = (perSender.get(phone) ?? 1) - 1;
    if (remaining) perSender.set(phone, remaining); else perSender.delete(phone);
    const next = waiting.shift(); if (next) next(); else active--;
  }
}
function positiveInteger(name: string, fallback: number) { const value = Number(process.env[name] ?? fallback); if (!Number.isInteger(value) || value < 1) throw new Error(`Invalid ${name}`); return value; }
