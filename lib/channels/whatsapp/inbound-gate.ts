import { parseEvolutionWebhook } from "../evolution/webhook.ts";
import { resolveWhatsAppIdentity, type WhatsAppIdentity, type WhatsAppIdentityRepository } from "./identity.ts";
import { isWhatsAppGreeting } from "./help-reply.ts";
import type { IncomingWhatsAppMessage } from "../evolution/webhook.ts";

/** Verify the sender before selecting any processor, including smoke commands. */
export async function gateWhatsAppInbound(payload: unknown, instance: string, dependencies: {
  identities: WhatsAppIdentityRepository;
  helpReply(): string;
  send(phone: string, text: string): Promise<void>;
  defer(work: () => Promise<void>): void;
  persistAndReply?(message: IncomingWhatsAppMessage, text: string, reason: "GREETING" | "UNLINKED_ALLOWED"): Promise<void>;
  publicUnlinkedReply?(): string;
  persistPublicAndReply?(message: IncomingWhatsAppMessage, text: string): Promise<boolean>;
  personalizedWelcome?(identity: WhatsAppIdentity, message: IncomingWhatsAppMessage): Promise<boolean>;
  /** The staging/pilot allowlist may safely receive onboarding feedback before linking. */
  allowUnlinkedReply?: boolean;
}): Promise<Response | null> {
  const event = parseEvolutionWebhook(payload, instance);
  if (event.kind !== "message") return Response.json({ received: true });
  const resolution = await resolveWhatsAppIdentity(event.message.phone, dependencies.identities);
  if (resolution.kind === "unlinked") {
    if (dependencies.allowUnlinkedReply) {
      const text = "Recibí tu mensaje, pero este número todavía no está vinculado a un viajero autorizado. Pedile al administrador que complete tu invitación y asociación de WhatsApp; después podés enviarme la información sin iniciar sesión en la Web.";
      if (dependencies.persistAndReply) await dependencies.persistAndReply(event.message, text, "UNLINKED_ALLOWED");
      else dependencies.defer(async () => {
        try { await dependencies.send(event.message.phone, text); }
        catch (error) { console.error("WhatsApp unlinked sender reply failed", { error: error instanceof Error ? error.name : "UnknownError" }); }
      });
    } else if (dependencies.publicUnlinkedReply && dependencies.persistPublicAndReply) {
      await dependencies.persistPublicAndReply(event.message, dependencies.publicUnlinkedReply());
    }
    return Response.json({ received: true, unlinked: true });
  }
  const personalizedWelcomeQueued = resolution.kind === "resolved" && dependencies.personalizedWelcome
    ? await dependencies.personalizedWelcome(resolution.identity, event.message)
    : false;
  if (event.message.type === "TEXT" && isWhatsAppGreeting(event.message.text ?? "")) {
    if (personalizedWelcomeQueued) return Response.json({ received: true, personalizedWelcomeQueued: true });
    const text = dependencies.helpReply();
    if (dependencies.persistAndReply) await dependencies.persistAndReply(event.message, text, "GREETING");
    else dependencies.defer(async () => {
      try { await dependencies.send(event.message.phone, text); }
      catch (error) { console.error("WhatsApp greeting delivery failed", { error: error instanceof Error ? error.name : "UnknownError" }); }
    });
    return Response.json({ received: true });
  }
  return null;
}
