import { parsePhoneNumberFromString, type CountryCode, type PhoneNumber } from "libphonenumber-js/max";
import { ValidationError } from "./validation.ts";

export type WhatsAppPhoneDetails = {
  country: CountryCode | null;
  countryCallingCode: string;
  e164: string;
  international: string;
  national: string;
  storage: string;
};

function normalizedInput(value: string): string {
  if (typeof value !== "string") throw new ValidationError("whatsappPhone no es válido");
  return value.trim();
}

function parseInternational(value: string): PhoneNumber | undefined {
  const compact = value.replace(/[\s().-]/gu, "");
  if (compact.startsWith("+")) return parsePhoneNumberFromString(value, { extract: false });
  if (compact.startsWith("00")) return parsePhoneNumberFromString(`+${compact.slice(2)}`, { extract: false });
  if (/^\d+$/u.test(compact)) return parsePhoneNumberFromString(`+${compact}`, { extract: false });
  return undefined;
}

function parseCandidate(value: string, defaultCountry?: CountryCode): PhoneNumber | undefined {
  const input = normalizedInput(value);
  if (!input) return undefined;
  const digits = input.replace(/\D/gu, "");
  // Historical imports sometimes kept Argentina's domestic 0/15 prefixes
  // after +54. Let libphonenumber remove them using the AR numbering plan.
  if (digits.startsWith("540")) return parsePhoneNumberFromString(digits.slice(2), { defaultCountry: "AR", extract: false });
  if (input.startsWith("+") || input.replace(/[\s().-]/gu, "").startsWith("00")) return parseInternational(input);
  if (defaultCountry) return parsePhoneNumberFromString(input, { defaultCountry, extract: false });

  // Evolution and the historical database use international digits without
  // the leading `+`. Domestic Argentine forms are accepted only when their
  // explicit 0/15 prefixes make that interpretation unambiguous.
  const compact = input.replace(/[\s().-]/gu, "");
  if (/^0\d+$/u.test(compact)) return parsePhoneNumberFromString(input, { defaultCountry: "AR", extract: false });
  return parseInternational(input);
}

export function inspectWhatsAppPhone(value: string, defaultCountry?: CountryCode): WhatsAppPhoneDetails | null {
  const phone = parseCandidate(value, defaultCountry);
  if (!phone?.isValid()) return null;
  return {
    country: phone.country ?? null,
    countryCallingCode: phone.countryCallingCode,
    e164: phone.number,
    international: phone.formatInternational(),
    national: phone.formatNational(),
    storage: phone.number.slice(1),
  };
}

/**
 * Canonical persistence keeps the existing Evolution-compatible contract:
 * complete E.164 digits without the leading `+`.
 */
export function normalizeWhatsAppPhone(value: string, defaultCountry?: CountryCode): string {
  const input = normalizedInput(value);
  const details = inspectWhatsAppPhone(input, defaultCountry);
  if (!details) throw new ValidationError("Ingresá un número de WhatsApp internacional válido");
  return details.storage;
}

export function formatWhatsAppPhone(value: string): string {
  if (!value.trim()) return "";
  return inspectWhatsAppPhone(value)?.international ?? value.trim();
}

export function whatsappPhonesEquivalent(left: string, right: string): boolean {
  const leftCandidates = new Set(whatsappPhoneLookupCandidates(left));
  return whatsappPhoneLookupCandidates(right).some((candidate) => leftCandidates.has(candidate));
}

/**
 * Stored traveler numbers predate a single format. Match Argentine mobile
 * numbers entered with the international mobile `9` or without it while
 * retaining every exact candidate. Callers must treat matches to multiple
 * people as ambiguous; this helper never chooses an identity.
 */
export function whatsappPhoneLookupCandidates(value: string): string[] {
  const normalized = normalizeWhatsAppPhone(value);
  const candidates = new Set([normalized]);

  if (/^549\d{10}$/u.test(normalized)) candidates.add(`54${normalized.slice(3)}`);
  else if (/^54\d{10}$/u.test(normalized)) candidates.add(`549${normalized.slice(2)}`);

  return [...candidates];
}
