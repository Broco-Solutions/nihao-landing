import { safeDeadline } from "./operational-runtime.ts";
import { parseEvolutionWebhook } from "../evolution/webhook.ts";
import { BURST_QUIET_MS, type BurstEnvelope } from "./burst-types.ts";

type DurableReceiver = { receive(envelope: BurstEnvelope): Promise<boolean>; persistOriginal?(envelope: BurstEnvelope): Promise<void>; processDue(limit: number, deadline?: number): Promise<void> };

/** null delegates smoke commands, unsupported media and pending v1 captures to their legacy handler. */
export async function handleBurstWebhook(payload: unknown, instance: string, getService: () => DurableReceiver, defer: (work: () => Promise<void>) => void, wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))): Promise<Response | null> {
  const deadline = safeDeadline();
  const event = parseEvolutionWebhook(payload, instance);
  if (event.kind !== "message") return Response.json({ received: true });
  const message = event.message;
  if (message.text === "ping nihao" || (message.type !== "TEXT" && message.type !== "IMAGE" && message.type !== "AUDIO" && message.type !== "DOCUMENT")) return null;
  try {
    const service = getService();
    const envelope = { instance, messageId: message.id, phone: message.phone, type: message.type, text: message.text, media: message.media, sentAt: message.sentAt ?? null, quotedMessageId: message.quotedMessageId ?? null, ...(message.selectionId ? { selectionId: message.selectionId } : {}) };
    const accepted = await service.receive(envelope);
    if (!accepted) return null;
    if (message.type !== "TEXT") {
      if (!service.persistOriginal) throw new Error("La recepción de originales no está configurada");
      await service.persistOriginal(envelope);
    }
    defer(async () => {
      try {
        if (!/^listo[.!]?$/iu.test(message.text?.trim() ?? "")) await wait(BURST_QUIET_MS + 250);
        await service.processDue(1, deadline);
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
