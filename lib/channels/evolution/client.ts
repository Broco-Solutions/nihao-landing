import { mediaByteLimit, readBoundedBytes, MediaIngressError, validateOriginalMedia, withMediaIngress } from "../whatsapp/media-ingress.ts";
import { requireTime } from "../whatsapp/operational-runtime.ts";
import { assertWhatsAppUatOutboundAllowed } from "../whatsapp/uat-access.ts";

export type EvolutionSendListInput = { onSentMessageId?: (id: string) => void;  number: string; title: string; description: string; buttonText: string; footerText: string; sections: Array<{ title: string; rows: Array<{ title: string; description: string; rowId: string }> }> };
export type EvolutionSendTextInput = {
  number: string;
  text: string;
  onSentMessageId?: (id: string) => void;
};

/** The small WebMessageInfo subset Evolution v2.3.7 needs to decrypt media. */
export type EvolutionMediaMessage = {
  key: { id: string; remoteJid: string; fromMe: boolean };
  message: Record<string, unknown>;
};

export type EvolutionGetMediaInput = { message: EvolutionMediaMessage };

export type EvolutionClient = {
  sendText(input: EvolutionSendTextInput): Promise<void>;
  sendList?(input: EvolutionSendListInput): Promise<void>;
  getMedia(input: EvolutionGetMediaInput): Promise<{ bytes: Uint8Array; mimeType: string }>;
};

export type EvolutionClientOptions = {
  apiUrl: string;
  apiKey: string;
  instance: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export class EvolutionConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvolutionConfigurationError";
  }
}

export class EvolutionRequestError extends Error {
  constructor(public readonly status: number) {
    super(`Evolution API respondió con estado ${status}`);
    this.name = "EvolutionRequestError";
  }
}

export class EvolutionTimeoutError extends Error {
  constructor() {
    super("Evolution API excedió el tiempo de espera");
    this.name = "EvolutionTimeoutError";
  }
}

function required(value: string | undefined, name: string) {
  const trimmed = value?.trim();
  if (!trimmed) throw new EvolutionConfigurationError(`${name} no está configurada`);
  return trimmed;
}

function endpoint(apiUrl: string, instance: string) {
  try {
    return new URL(`message/sendText/${encodeURIComponent(instance)}`, `${apiUrl.replace(/\/+$/, "")}/`).toString();
  } catch {
    throw new EvolutionConfigurationError("EVOLUTION_API_URL no es una URL válida");
  }
}

function mediaEndpoint(apiUrl: string, instance: string) {
  try {
    return new URL(`chat/getBase64FromMediaMessage/${encodeURIComponent(instance)}`, `${apiUrl.replace(/\/+$/, "")}/`).toString();
  } catch {
    throw new EvolutionConfigurationError("EVOLUTION_API_URL no es una URL válida");
  }
}

function mediaResponse(value: unknown, type: string): { bytes: Uint8Array; mimeType: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new EvolutionRequestError(502);
  const response = value as { base64?: unknown; mimetype?: unknown };
  if (typeof response.base64 !== "string" || !response.base64 || typeof response.mimetype !== "string" || !response.mimetype) {
    throw new EvolutionRequestError(502);
  }
  const encoded = response.base64.replace(/^data:[^,]+,/, "");
  const maximum = mediaByteLimit(type);
  if (encoded.length > 4 * Math.ceil(maximum / 3)) throw new MediaIngressError("MEDIA_TOO_LARGE");
  if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded) || encoded.length % 4 === 1) throw new MediaIngressError("MEDIA_INVALID");
  try {
    const bytes = new Uint8Array(Buffer.from(encoded, "base64"));
    if (!bytes.byteLength) throw new Error("empty");
    const mimeType = response.mimetype.split(";", 1)[0].trim().toLowerCase();
    validateOriginalMedia(type, mimeType, bytes);
    return { bytes, mimeType: response.mimetype };
  } catch (error) {
    if (error instanceof MediaIngressError) throw error;
    throw new EvolutionRequestError(502);
  }
}

export function createEvolutionClient(options: EvolutionClientOptions): EvolutionClient {
  const apiUrl = required(options.apiUrl, "EVOLUTION_API_URL");
  const apiKey = required(options.apiKey, "EVOLUTION_API_KEY");
  const instance = required(options.instance, "EVOLUTION_INSTANCE");
  const request = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 8_000;

  return {
    async sendText({ number, text, onSentMessageId }) {
      assertWhatsAppUatOutboundAllowed(number);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await request(endpoint(apiUrl, instance), {
          method: "POST",
          headers: { apikey: apiKey, "content-type": "application/json" },
          body: JSON.stringify({ number, text }),
          signal: controller.signal,
        });
        if (!response.ok) throw new EvolutionRequestError(response.status);
        if (onSentMessageId) {
          const delivery = await response.json().catch(() => null) as { key?: { id?: unknown } } | null;
          if (typeof delivery?.key?.id === "string") onSentMessageId(delivery.key.id);
        }
      } catch (error) {
        if (controller.signal.aborted) throw new EvolutionTimeoutError();
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
    async sendList(input) {
      assertWhatsAppUatOutboundAllowed(input.number);
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const url = new URL(`message/sendList/${encodeURIComponent(instance)}`, `${apiUrl.replace(/\/+$/, "")}/`);
        const response = await request(url.toString(), { method: "POST", headers: { apikey: apiKey, "content-type": "application/json" }, body: JSON.stringify(input), signal: controller.signal });
        if (!response.ok) throw new EvolutionRequestError(response.status);
        if (input.onSentMessageId) {
          const delivery = await response.json().catch(() => null) as { key?: { id?: unknown } } | null;
          if (typeof delivery?.key?.id === "string") input.onSentMessageId(delivery.key.id);
        }
      } catch (error) { if (controller.signal.aborted) throw new EvolutionTimeoutError(); throw error; }
      finally { clearTimeout(timer); }
    },
    async getMedia({ message }) {
      return withMediaIngress(message.key.remoteJid, async () => {
      requireTime(timeoutMs);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        // Evolution v2.3.7 expects { message: WebMessageInfo, convertToMp4 } and
        // returns { base64, mimetype, ... }. Keep original OGG/Opus for Voxtral.
        const response = await request(mediaEndpoint(apiUrl, instance), {
          method: "POST",
          headers: { apikey: apiKey, "content-type": "application/json" },
          body: JSON.stringify({ message, convertToMp4: false }),
          signal: controller.signal,
        });
        if (!response.ok) throw new EvolutionRequestError(response.status);
        const type = message.message.audioMessage ? "AUDIO" : message.message.documentMessage ? "DOCUMENT" : "IMAGE";
          const maximum = 4 * Math.ceil(mediaByteLimit(type) / 3) + 1024 * 1024;
          if (Number(response.headers.get("content-length") ?? 0) > maximum) { void response.body?.cancel().catch(() => {}); throw new MediaIngressError("MEDIA_TOO_LARGE"); }
          const body = response.body ? await readBoundedBytes(response.body, { maxBytes: maximum, timeoutMs }) : new Uint8Array();
          try { return mediaResponse(JSON.parse(new TextDecoder().decode(body)), type); }
          catch (error) { if (error instanceof MediaIngressError) throw error; throw new EvolutionRequestError(502); }
      } catch (error) {
        if (controller.signal.aborted) throw new EvolutionTimeoutError();
        throw error;
      } finally {
        clearTimeout(timer);
      }
      });
    },
  };
}

export function createEvolutionClientFromEnvironment(): EvolutionClient {
  return createEvolutionClient({
    apiUrl: process.env.EVOLUTION_API_URL ?? "",
    apiKey: process.env.EVOLUTION_API_KEY ?? "",
    instance: process.env.EVOLUTION_INSTANCE ?? "",
  });
}
