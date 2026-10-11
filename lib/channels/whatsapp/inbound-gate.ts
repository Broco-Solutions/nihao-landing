import { parseEvolutionWebhook } from "../evolution/webhook.ts";
import { resolveWhatsAppIdentity, type WhatsAppIdentityRepository } from "./identity.ts";
import { isWhatsAppGreeting } from "./help-reply.ts";

/** Verify the sender before selecting any processor, including smoke commands. */
export async function gateWhatsAppInbound(payload: unknown, instance: string, dependencies: {
  identities: WhatsAppIdentityRepository;
  helpReply(): string;
  send(phone: string, text: string): Promise<void>;
  defer(work: () => Promise<void>): void;
  /** The staging/pilot allowlist may safely receive onboarding feedback before linking. */
  allowUnlinkedReply?: boolean;
}): Promise<Response | null> {
  const event = parseEvolutionWebhook(payload, instance);
  if (event.kind !== "message") return Response.json({ received: true });
  const resolution = await resolveWhatsAppIdentity(event.message.phone, dependencies.identities);
  if (resolution.kind === "unlinked") {
    if (dependencies.allowUnlinkedReply) {
      dependencies.defer(async () => {
        try { await dependencies.send(event.message.phone, "Recibí tu mensaje, pero este número todavía no está vinculado a un viajero autorizado. Pedile al administrador que complete tu invitación y asociación de WhatsApp; después podés enviarme la información sin iniciar sesión en la Web."); }
        catch (error) { console.error("WhatsApp unlinked sender reply failed", { error: error instanceof Error ? error.name : "UnknownError" }); }
      });
    }
    return Response.json({ received: true, unlinked: true });
  }
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
