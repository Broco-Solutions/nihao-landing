import { whatsappInboundLookupCandidates } from "../../bot/whatsapp-phone.ts";

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
  const normalized = values.map((value) => whatsappInboundLookupCandidates(value)[0]).filter((value): value is string => Boolean(value));
  if (normalized.length !== values.length) throw new WhatsAppUatConfigurationError("WHATSAPP_UAT_ALLOWED_PHONES contiene un número inválido");
  return new Set(normalized);
}

export function isWhatsAppUatSenderAllowed(phone: string, raw = process.env.WHATSAPP_UAT_ALLOWED_PHONES) {
  const allowed = whatsappUatAllowedPhones(raw);
  if (allowed === null) return true;
  return whatsappInboundLookupCandidates(phone).some((candidate) => allowed.has(candidate));
}

export function assertWhatsAppUatOutboundAllowed(phone: string, raw = process.env.WHATSAPP_UAT_ALLOWED_PHONES) {
  if (!isWhatsAppUatSenderAllowed(phone, raw)) {
    throw new WhatsAppUatConfigurationError("El destinatario no está autorizado durante la ventana UAT");
  }
}
