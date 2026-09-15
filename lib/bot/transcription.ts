import type { AttachmentRepository } from "./attachments.ts";
import type { StorageProvider } from "./storage/provider.ts";
import type { SupplierAttachmentRecord } from "./types.ts";

export const VOXTRAL_TRANSCRIPTION_MODEL = "voxtral-mini-latest";

export type TranscriptionResult = { text: string; model: string; language?: string; duration?: number };
export interface TranscriptionProvider { transcribe(input: { bytes: Uint8Array; mimeType: string; filename: string }): Promise<TranscriptionResult>; }
export class TranscriptionError extends Error {}
export class TranscriptionTimeoutError extends TranscriptionError {}
export class TranscriptionResponseError extends TranscriptionError {}

export class MistralTranscriptionProvider implements TranscriptionProvider {
  private readonly pending = new Map<string, Promise<TranscriptionResult>>();
  constructor(private readonly apiKey: string, private readonly timeoutMs = 30_000) {}

  async transcribe(input: { bytes: Uint8Array; mimeType: string; filename: string }): Promise<TranscriptionResult> {
    const key = `${input.filename}:${input.bytes.byteLength}`;
    const existing = this.pending.get(key); if (existing) return existing;
    const task = this.transcribeFresh(input); this.pending.set(key, task);
    try { return await task; } finally { if (this.pending.get(key) === task) this.pending.delete(key); }
  }

  private async transcribeFresh(input: { bytes: Uint8Array; mimeType: string; filename: string }): Promise<TranscriptionResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const form = new FormData();
      form.set("model", VOXTRAL_TRANSCRIPTION_MODEL);
      form.set("file", new Blob([Uint8Array.from(input.bytes)], { type: input.mimeType }), input.filename);
      const response = await fetch("https://api.mistral.ai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${this.apiKey}` }, body: form, signal: controller.signal });
      if (!response.ok) throw new TranscriptionResponseError(`Mistral respondió HTTP ${response.status}`);
      const result = await response.json() as { text?: unknown; model?: unknown; language?: unknown; duration?: unknown };
      if (typeof result.text !== "string" || !result.text.trim()) throw new TranscriptionResponseError("Mistral no devolvió una transcripción válida");
      return { text: result.text.trim(), model: typeof result.model === "string" ? result.model : VOXTRAL_TRANSCRIPTION_MODEL, language: typeof result.language === "string" ? result.language : undefined, duration: typeof result.duration === "number" ? result.duration : undefined };
    } catch (error) {
      if (controller.signal.aborted) throw new TranscriptionTimeoutError("La transcripción tardó demasiado en responder");
      throw error;
    } finally { clearTimeout(timer); }
  }
}

export function createMistralTranscriptionProviderFromEnvironment(apiKey = process.env.MISTRAL_API_KEY): MistralTranscriptionProvider {
  if (!apiKey) throw new TranscriptionError("Falta configurar MISTRAL_API_KEY");
  return new MistralTranscriptionProvider(apiKey);
}

/** Reads only an already-authorized private AUDIO object and persists its transcript. */
export class AttachmentTranscriptionService {
  private readonly pending = new Map<string, Promise<TranscriptionResult>>();
  constructor(private readonly attachments: Pick<AttachmentRepository, "get" | "saveTranscription">, private readonly storage: StorageProvider, private readonly provider: TranscriptionProvider) {}
  async transcribe(attachmentId: string): Promise<TranscriptionResult> {
    const attachment = await this.attachments.get(attachmentId);
    if (!attachment || attachment.type !== "AUDIO") throw new TranscriptionError("El adjunto de audio no existe");
    if (attachment.transcription?.trim() && attachment.transcriptionModel) return { text: attachment.transcription, model: attachment.transcriptionModel };
    const existing = this.pending.get(attachmentId); if (existing) return existing;
    const task = this.transcribeFresh(attachment); this.pending.set(attachmentId, task);
    try { return await task; } finally { if (this.pending.get(attachmentId) === task) this.pending.delete(attachmentId); }
  }
  private async transcribeFresh(attachment: SupplierAttachmentRecord): Promise<TranscriptionResult> {
    const object = await this.storage.get(attachment.storageKey);
    if (!object) throw new TranscriptionError("No se encontró el audio privado");
    const result = await this.provider.transcribe({ bytes: new Uint8Array(await new Response(object).arrayBuffer()), mimeType: attachment.mimeType, filename: `audio.${attachment.storageKey.split(".").pop() ?? "webm"}` });
    if (!this.attachments.saveTranscription) throw new TranscriptionError("El repositorio no permite guardar la transcripción");
    await this.attachments.saveTranscription(attachment.id, { text: result.text, model: result.model });
    return result;
  }
}
