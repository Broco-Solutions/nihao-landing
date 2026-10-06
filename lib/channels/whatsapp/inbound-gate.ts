import { parseEvolutionWebhook } from "../evolution/webhook.ts";
import { resolveWhatsAppIdentity, type WhatsAppIdentityRepository } from "./identity.ts";
import { isWhatsAppGreeting } from "./help-reply.ts";

/** Verify the sender before selecting any processor, including smoke commands. */
export async function gateWhatsAppInbound(payload: unknown, instance: string, dependencies: {
  identities: WhatsAppIdentityRepository;
  helpReply(): string;
  send(phone: string, text: string): Promise<void>;
  defer(work: () => Promise<void>): void;
}): Promise<Response | null> {
  const event = parseEvolutionWebhook(payload, instance);
  if (event.kind !== "message") return Response.json({ received: true });
  const resolution = await resolveWhatsAppIdentity(event.message.phone, dependencies.identities);
  if (resolution.kind === "unlinked") return Response.json({ received: true });
  if (event.message.type === "TEXT" && isWhatsAppGreeting(event.message.text ?? "")) {
    const text = dependencies.helpReply();
    dependencies.defer(async () => {
      try { await dependencies.send(event.message.phone, text); }
      catch (error) { console.error("WhatsApp greeting delivery failed", { error: error instanceof Error ? error.name : "UnknownError" }); }
    });
    return Response.json({ received: true });
  }
  return null;
}
