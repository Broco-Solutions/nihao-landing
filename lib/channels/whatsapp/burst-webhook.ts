import { parseEvolutionWebhook } from "../evolution/webhook.ts";
import type { BurstEnvelope } from "./burst-types.ts";

type DurableReceiver = { receive(envelope: BurstEnvelope): Promise<boolean>; processDue(limit: number): Promise<void> };

/** null delegates smoke commands, unsupported media and pending v1 captures to their legacy handler. */
export async function handleBurstWebhook(payload: unknown, instance: string, getService: () => DurableReceiver, defer: (work: () => Promise<void>) => void, wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))): Promise<Response | null> {
  const event = parseEvolutionWebhook(payload, instance);
  if (event.kind !== "message") return Response.json({ received: true });
  const message = event.message;
  if (message.text === "ping nihao" || (message.type !== "TEXT" && message.type !== "IMAGE" && message.type !== "AUDIO" && message.type !== "DOCUMENT")) return null;
  try {
    const service = getService();
    const accepted = await service.receive({ instance, messageId: message.id, phone: message.phone, type: message.type, text: message.text, media: message.media, sentAt: message.sentAt ?? null, quotedMessageId: message.quotedMessageId ?? null, ...(message.selectionId ? { selectionId: message.selectionId } : {}) });
    if (!accepted) return null;
    defer(async () => {
      try {
        if (!/^listo[.!]?$/iu.test(message.text?.trim() ?? "")) await wait(20_250);
        await service.processDue(1);
      } catch (error) {
        console.error("WhatsApp deferred burst failed", { error: error instanceof Error ? error.name : "UnknownError" });
      }
    });
    return Response.json({ received: true });
  } catch (error) {
    console.error("WhatsApp durable receipt failed", { error: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ received: false }, { status: 503 });
  }
}
