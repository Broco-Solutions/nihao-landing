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

/**
 * Stored traveler numbers predate a single format. Match Argentine mobile
 * numbers entered with the international mobile `9` or the domestic `0/15`
 * prefixes while retaining every exact candidate. Callers must treat matches
 * to multiple people as ambiguous; this helper never chooses an identity.
 */
export function whatsappPhoneLookupCandidates(value: string): string[] {
  const normalized = normalizeWhatsAppPhone(value);
  const candidates = new Set([normalized]);

  const addArgentineInternationalAlias = (digits: string) => {
    if (/^549\d{10}$/u.test(digits)) candidates.add(`54${digits.slice(3)}`);
    else if (/^54\d{10}$/u.test(digits)) candidates.add(`549${digits.slice(2)}`);
  };

  addArgentineInternationalAlias(normalized);

  // Domestic forms such as 011 15 1234-5678, or +54 0 11 15 1234-5678.
  // Area-code lengths vary, so enumerate plausible splits and let exact DB
  // matches plus the identity resolver detect collisions safely.
  const domestic = normalized.startsWith("54") ? normalized.slice(2) : normalized;
  if (domestic.startsWith("0")) {
    const national = domestic.slice(1);
    for (let areaLength = 2; areaLength <= 4; areaLength++) {
      const area = national.slice(0, areaLength);
      const rest = national.slice(areaLength);
      if (!/^\d+$/u.test(area) || !rest.startsWith("15")) continue;
      const subscriber = rest.slice(2);
      if (subscriber.length >= 6 && subscriber.length <= 8) candidates.add(`549${area}${subscriber}`);
    }
  }

  return [...candidates];
}
