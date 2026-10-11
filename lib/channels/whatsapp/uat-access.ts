import { normalizeWhatsAppPhone } from "../../bot/whatsapp-phone.ts";

export class WhatsAppUatConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhatsAppUatConfigurationError";
  }
}

export function whatsappUatAllowedPhones(raw = process.env.WHATSAPP_UAT_ALLOWED_PHONES): Set<string> | null {
  if (raw === undefined) return null;
  const values = raw.split(/[,;\n]+/u).map((value) => value.trim()).filter(Boolean);
  if (!values.length) throw new WhatsAppUatConfigurationError("WHATSAPP_UAT_ALLOWED_PHONES no contiene remitentes");
  try {
    return new Set(values.map((value) => normalizeWhatsAppPhone(value)));
  } catch {
    throw new WhatsAppUatConfigurationError("WHATSAPP_UAT_ALLOWED_PHONES contiene un número inválido");
  }
}

export function isWhatsAppUatSenderAllowed(phone: string, raw = process.env.WHATSAPP_UAT_ALLOWED_PHONES) {
  const allowed = whatsappUatAllowedPhones(raw);
  if (allowed === null) return true;
  try {
    return allowed.has(normalizeWhatsAppPhone(phone));
  } catch {
    return false;
  }
}

export function assertWhatsAppUatOutboundAllowed(phone: string, raw = process.env.WHATSAPP_UAT_ALLOWED_PHONES) {
  if (!isWhatsAppUatSenderAllowed(phone, raw)) {
    throw new WhatsAppUatConfigurationError("El destinatario no está autorizado durante la ventana UAT");
  }
}
