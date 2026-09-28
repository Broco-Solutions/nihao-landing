import { ValidationError } from "./validation.ts";

/** Normalizes an international WhatsApp number without guessing a country code. */
export function normalizeWhatsAppPhone(value: string): string {
  if (typeof value !== "string") throw new ValidationError("whatsappPhone no es válido");
  const normalized = value.replace(/[+\s\-()]/g, "");
  if (!/^\d{8,15}$/.test(normalized)) {
    throw new ValidationError("Ingresá un número de WhatsApp internacional válido, con código de país");
  }
  return normalized;
}
