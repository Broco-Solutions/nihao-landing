import type { Fob, LeadTime, Moq } from "../../lib/bot/types.ts";

export function normalizeString(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}
export function normalizeEmail(value: unknown): string { return normalizeString(value); }
export function normalizePhone(value: unknown): string { return String(value ?? "").replace(/[^\d+]/g, "").replace(/(?!^)\+/g, ""); }
export function normalizeUrl(value: unknown): string {
  return normalizeString(value).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}
function normalizeUnit(value: unknown): string {
  const unit = normalizeString(value).replace(/s$/, "");
  return unit === "unit" || unit === "unidad" || unit === "unidade" ? "unidad" : unit;
}
export function sameValue(field: string, expected: unknown, actual: unknown): boolean {
  if (expected === null || expected === undefined) return actual === null || actual === undefined || actual === "" || actual === "UNKNOWN";
  if (actual === null || actual === undefined || actual === "" || actual === "UNKNOWN") return false;
  if (field === "email") return normalizeEmail(expected) === normalizeEmail(actual);
  if (field === "phone" || field === "mobile") return (Array.isArray(expected) ? expected : [expected]).some((candidate) => normalizePhone(candidate) === normalizePhone(actual));
  if (field === "website" || field === "url") return normalizeUrl(expected) === normalizeUrl(actual);
  if (field === "contactName") {
    // Tier 1 stores the name together with contact details; require a whole-token prefix.
    const name = normalizeString(expected);
    const contact = normalizeString(actual);
    return contact === name || contact.startsWith(`${name} · `);
  }
  if (field === "fob") {
    const left = expected as Partial<Fob>; const right = actual as Partial<Fob>;
    return left.amount === right.amount && normalizeString(left.currency) === normalizeString(right.currency)
      && (!left.unit || normalizeUnit(left.unit) === normalizeUnit(right.unit));
  }
  if (field === "moq") {
    const left = expected as Partial<Moq>; const right = actual as Partial<Moq>;
    return left.quantity === right.quantity && (!left.unit || normalizeUnit(left.unit) === normalizeUnit(right.unit));
  }
  if (field === "leadTime") {
    const left = expected as Partial<LeadTime>; const right = actual as Partial<LeadTime>;
    return left.days != null && left.days === right.days;
  }
  if (typeof expected === "number") return Number(actual) === expected;
  return normalizeString(expected) === normalizeString(actual);
}
export function present(value: unknown): boolean {
  if (value === null || value === undefined || value === "" || value === "UNKNOWN") return false;
  if (typeof value === "object" && "amount" in value) return (value as Fob).amount !== null;
  if (typeof value === "object" && "quantity" in value) return (value as Moq).quantity !== null;
  if (typeof value === "object" && "days" in value) return (value as LeadTime).days !== null;
  return true;
}
