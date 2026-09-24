import type { EvolutionClient } from "./client.ts";
import type { WhatsAppCaptureService } from "../whatsapp/whatsapp-capture-service.ts";

export type WhatsAppMessageType = "TEXT" | "IMAGE" | "AUDIO" | "BUSINESS_CARD" | "UNKNOWN";

export type IncomingWhatsAppMessage = {
  id: string;
  remoteJid: string;
  phone: string;
  pushName: string | null;
  type: WhatsAppMessageType;
  text: string | null;
};

export type EvolutionWebhookEvent =
  | { kind: "message"; instance: string; message: IncomingWhatsAppMessage }
  | { kind: "connection-update"; instance: string | null }
  | { kind: "ignored"; reason: "unknown-event" | "wrong-instance" | "from-me" | "group" | "status-or-broadcast" | "invalid-message" };

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function eventName(value: unknown) {
  return typeof value === "string" ? value.replaceAll(".", "_").toUpperCase() : null;
}

function messageType(message: RecordValue): WhatsAppMessageType {
  if (typeof message.conversation === "string" || asRecord(message.extendedTextMessage)) return "TEXT";
  if (asRecord(message.imageMessage)) return "IMAGE";
  if (asRecord(message.audioMessage)) return "AUDIO";
  if (asRecord(message.contactMessage) || asRecord(message.contactsArrayMessage)) return "BUSINESS_CARD";
  return "UNKNOWN";
}

function textFromMessage(message: RecordValue) {
  const conversation = asString(message.conversation);
  if (conversation !== null) return conversation;
  return asString(asRecord(message.extendedTextMessage)?.text);
}

/** Parses only the delivery envelope; future channel flows can consume message types unchanged. */
export function parseEvolutionWebhook(payload: unknown, configuredInstance: string): EvolutionWebhookEvent {
  const input = asRecord(payload);
  const name = eventName(input?.event);
  const instance = asString(input?.instance);

  if (name === "CONNECTION_UPDATE") return { kind: "connection-update", instance };
  if (name !== "MESSAGES_UPSERT") return { kind: "ignored", reason: "unknown-event" };
  if (!instance || instance !== configuredInstance) return { kind: "ignored", reason: "wrong-instance" };

  const data = asRecord(input?.data);
  const key = asRecord(data?.key);
  const remoteJid = asString(key?.remoteJid);
  if (!data || !key || !remoteJid || !asString(key.id)) return { kind: "ignored", reason: "invalid-message" };
  if (key.fromMe === true) return { kind: "ignored", reason: "from-me" };
  if (remoteJid.endsWith("@g.us")) return { kind: "ignored", reason: "group" };
  if (remoteJid === "status@broadcast" || remoteJid.endsWith("@broadcast")) return { kind: "ignored", reason: "status-or-broadcast" };

  const message = asRecord(data.message);
  if (!message) return { kind: "ignored", reason: "invalid-message" };
  const id = asString(key.id)!;
  const phone = remoteJid.split("@")[0].split(":")[0];
  if (!phone) return { kind: "ignored", reason: "invalid-message" };
  return {
    kind: "message",
    instance,
    message: { id, remoteJid, phone, pushName: asString(data.pushName), type: messageType(message), text: textFromMessage(message) },
  };
}

export type WhatsAppWebhookResult = { action: "ignored"; reason: EvolutionWebhookEvent["kind"] | "not-a-command" } | { action: "replied" };

/** Evolution adapter: product capture remains independent from the provider transport. */
export async function processWhatsAppWebhook(payload: unknown, configuredInstance: string, getClient: () => Pick<EvolutionClient, "sendText">, getCaptureService?: () => WhatsAppCaptureService): Promise<WhatsAppWebhookResult> {
  const event = parseEvolutionWebhook(payload, configuredInstance);
  if (event.kind !== "message") return { action: "ignored", reason: event.kind };
  if (event.message.type !== "TEXT" || !event.message.text) return { action: "ignored", reason: "not-a-command" };
  if (event.message.text === "ping nihao") {
    await getClient().sendText({ number: event.message.phone, text: "Nihao WhatsApp OK ✅" });
    return { action: "replied" };
  }
  if (!getCaptureService) return { action: "ignored", reason: "not-a-command" };
  const result = await getCaptureService().capture({ instance: event.instance, messageId: event.message.id, phone: event.message.phone, text: event.message.text });
  await getClient().sendText({ number: event.message.phone, text: result.text });
  return { action: "replied" };
}

/** Keeps webhook acknowledgement independent from Evolution's delivery outcome. */
export async function handleWhatsAppWebhookRequest(request: Pick<Request, "json">, configuredInstance: string, getClient: () => Pick<EvolutionClient, "sendText">, getCaptureService?: () => WhatsAppCaptureService): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ received: true });
  }

  try {
    await processWhatsAppWebhook(payload, configuredInstance, getClient, getCaptureService);
  } catch (error) {
    // Evolution retries webhook deliveries. Acknowledge the event without exposing provider details.
    console.error("WhatsApp webhook processing failed", { error: error instanceof Error ? error.name : "UnknownError" });
  }
  return Response.json({ received: true });
}
