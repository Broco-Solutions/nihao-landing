import { normalizeWhatsAppPhone } from "../../bot/whatsapp-phone.ts";

export const WHATSAPP_PUBLIC_WELCOME = `¡Hola! 👋 Gracias por escribir a *Nihao Negocios*.

Este es nuestro asistente de WhatsApp, exclusivo para viajeros que tienen acceso habilitado.

Si ya participás de un viaje con nosotros, contactá al equipo de Nihao para activar este número.

🇨🇳 ¿Querés conocernos y descubrir nuestros servicios?

Te invitamos a visitar:
https://www.nihaonegocios.com/`;

export const PUBLIC_WELCOME_COOLDOWN_MS = 24 * 60 * 60 * 1_000;

export class WhatsAppPublicWelcomeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhatsAppPublicWelcomeConfigurationError";
  }
}

export function whatsappPublicWelcomeEnabled(raw = process.env.WHATSAPP_PUBLIC_WELCOME_ENABLED) {
  return /^(?:1|true|yes|on)$/iu.test(raw?.trim() ?? "");
}

export function whatsappBlockedPhones(raw = process.env.WHATSAPP_BLOCKED_PHONES): Set<string> {
  if (!raw?.trim()) return new Set();
  const values = raw.split(/[,;\n]+/u).map((value) => value.trim()).filter(Boolean);
  try {
    return new Set(values.map(normalizeWhatsAppPhone));
  } catch {
    throw new WhatsAppPublicWelcomeConfigurationError("WHATSAPP_BLOCKED_PHONES contiene un número inválido");
  }
}

export function isWhatsAppBlocked(phone: string, raw = process.env.WHATSAPP_BLOCKED_PHONES) {
  const blocked = whatsappBlockedPhones(raw);
  return blocked.size > 0 && blocked.has(normalizeWhatsAppPhone(phone));
}

export function shouldQueueWhatsAppPublicWelcome(input: { enabled: boolean; blocked: boolean; identityKind: "resolved" | "unlinked" | "ambiguous" }) {
  return input.enabled && !input.blocked && input.identityKind === "unlinked";
}
