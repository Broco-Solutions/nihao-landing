import type { ExtractionCandidate } from "../../bot/types.ts";
import type { CardReading } from "./ingestion-types.ts";

export type ReconciliationSignal = { field: string; reason: string; ocrRaw: string[]; ocrCanonical: string[]; visionRaw: string[]; visionCanonical: string[] };
export type CanonicalOcrCard = { company: string | null; emails: string[]; phones: string[]; domains: string[]; rawEmails: string[]; rawPhones: string[]; rawDomains: string[] };
export type CardComparison = { disagreements: string[]; signals: ReconciliationSignal[] };

/** Comparison only: never replace the source evidence with these values. */
export function canonicalEmail(raw: string): string | null {
  const unwrap = (text: string) => {
    let value = text.trim().replace(/[.,;。]+$/gu, "");
    for (const [left, right] of [["<", ">"], ["(", ")"], ["[", "]"], ["{", "}"], ['"', '"'], ["“", "”"]]) {
      if (value.startsWith(left) && value.endsWith(right)) value = value.slice(left.length, -right.length).trim();
    }
    return value;
  };
  const value = unwrap(unwrap(raw).replace(/^(?:e\s*-?\s*mail|mail|correo)\s*[:：]\s*/iu, "")).toLowerCase();
  const parts = value.split("@");
  if (parts.length !== 2 || !parts[0] || parts[0].startsWith(".") || parts[0].endsWith(".") || parts[0].includes("..")) return null;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/u.test(parts[0]) || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/u.test(parts[1])) return null;
  return value;
}
function ocrEmailTokens(ocr: string): string[] {
  // Retain the labelled source span in tracing, canonicalize before comparison.
  return ocr.match(/(?:\b(?:e\s*-?\s*mail|mail|correo)\s*[:：]\s*)?[^\s<>(),;"]+@[^\s<>(),;"]+/giu) ?? [];
}
export function extractOcrEmails(ocr: string): string[] { return compact(ocrEmailTokens(ocr).map(canonicalEmail)); }
export function hasCjk(text: string): boolean { return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text); }
export function canonicalName(raw: string): string { return raw.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}\p{M}&+]/gu, ""); }
export function nameVariants(raw: string): string[] {
  // Script boundaries expose bilingual blocks without translating or fuzzy matching.
  return raw.replace(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])\s*(?=\p{Script=Latin})/gu, "$1\n")
    .replace(/(\p{Script=Latin})\s*(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])/gu, "$1\n")
    .split(/[/|\n]+/u).map((s) => s.trim()).filter(Boolean);
}
function scripts(text: string): string[] {
  return ["Latin", "Han", "Hiragana", "Katakana", "Hangul", "Cyrillic", "Greek", "Arabic", "Hebrew", "Devanagari", "Thai"]
    .filter((script) => new RegExp(`\\p{Script=${script}}`, "u").test(text));
}
function disjointScripts(a: string, b: string): boolean { const sa = scripts(a), sb = scripts(b); return sa.length > 0 && sb.length > 0 && !sa.some((s) => sb.includes(s)); }
export function compareNames(a: string, b: string): "EXACT_NAME_MATCH" | "BILINGUAL_VARIANT_MATCH" | "NAME_CONFLICT" {
  if (!canonicalName(a) || !canonicalName(b)) return "NAME_CONFLICT";
  if (canonicalName(a) === canonicalName(b)) return "EXACT_NAME_MATCH";
  const av = nameVariants(a), bv = nameVariants(b);
  const matches = av.filter((v) => bv.some((w) => canonicalName(v) === canonicalName(w)));
  // A shared component cannot excuse a second distinct company in the same script.
  const unmatched = [...new Set([...av, ...bv].filter(v => !matches.some(m => canonicalName(v) === canonicalName(m))))];
  if (unmatched.some((v, i) => unmatched.slice(i + 1).some(w => !disjointScripts(v, w) && canonicalName(v) !== canonicalName(w)))) return "NAME_CONFLICT";
  if (matches.length && [...av, ...bv].every((v) => matches.some((m) => canonicalName(v) === canonicalName(m) || disjointScripts(v, m)))) return "BILINGUAL_VARIANT_MATCH";
  return "NAME_CONFLICT";
}
export function canonicalPhone(raw: string): string | null { const compact = raw.trim().replace(/[\s().-]/gu, ""); return /^\+?\d+$/u.test(compact) ? compact.replace(/^\+/u, "") : null; }
export function canonicalDomain(raw: string): string | null {
  const value = raw.trim().replace(/[),;。]+$/gu, "");
  try { const url = new URL(/^https?:\/\//iu.test(value) ? value : `https://${value}`); return !url.username && !url.password && !/\s/u.test(value) && url.hostname.includes(".") && ["http:", "https:"].includes(url.protocol) ? url.hostname.toLowerCase().replace(/\.$/u, "") : null; } catch { return null; }
}
const compact = (values: Array<string | null>) => [...new Set(values.filter((s): s is string => s !== null))];
export function canonicalOcrCard(candidate: ExtractionCandidate, ocr: string): CanonicalOcrCard {
  const name = candidate.extractedFields.companyName ?? null;
  const rawEmails = ocrEmailTokens(ocr);
  const rawPhones = (candidate.contactMethods ?? []).filter((c) => c.type === "PHONE").map((c) => c.rawText);
  const rawDomains = candidate.website && ocr.toLowerCase().includes(candidate.website.replace(/^https?:\/\//iu, "").toLowerCase()) ? [candidate.website] : [];
  const letters = (s: string) => s.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  return { company: name && letters(ocr).includes(letters(name)) ? name : null, rawEmails, rawPhones, rawDomains, emails: compact(rawEmails.map(canonicalEmail)), phones: compact(rawPhones.map(canonicalPhone)), domains: compact(rawDomains.map(canonicalDomain)) };
}
export function compareCard(card: CardReading, ocr: CanonicalOcrCard): CardComparison {
  const disagreements: string[] = [], signals: ReconciliationSignal[] = [];
  let sharedContacts = 0;
  for (const [field, raw, expected, visual, canonical, match, conflict] of [
    ["emails", ocr.rawEmails, ocr.emails, card.emails, canonicalEmail, "EMAIL_CANONICAL_MATCH", "REAL_EMAIL_CONFLICT"],
    ["phones", ocr.rawPhones, ocr.phones, card.phones, canonicalPhone, "PHONE_MATCH", "REAL_PHONE_CONFLICT"],
    ["websites", ocr.rawDomains, ocr.domains, card.websites, canonicalDomain, "DOMAIN_MATCH", "REAL_DOMAIN_CONFLICT"],
  ] as const) {
    const actual = compact(visual.map(canonical));
    const invalid = raw.some((v) => canonical(v) === null);
    const mismatched = invalid || expected.some((v) => !actual.includes(v));
    const shared = expected.some((v) => actual.includes(v));
    if (shared) sharedContacts++;
    if (raw.length) {
      if (mismatched) disagreements.push(field);
      signals.push({ field, reason: invalid ? `INVALID_OCR_${field === "emails" ? "EMAIL" : field === "phones" ? "PHONE" : "DOMAIN"}` : mismatched ? conflict : match, ocrRaw: [...raw], ocrCanonical: [...expected], visionRaw: [...visual], visionCanonical: actual });
    }
  }
  if (ocr.company) {
    let reason: string = card.companyName ? compareNames(ocr.company, card.companyName) : "NAME_CONFLICT";
    // Cross-script readings have no name equality evidence: require two independent exact contacts.
    if (reason === "NAME_CONFLICT" && card.companyName && disjointScripts(ocr.company, card.companyName) && sharedContacts >= 2 && !disagreements.length) reason = "CROSS_SCRIPT_CONTACT_MATCH";
    if (reason === "NAME_CONFLICT") { disagreements.push("companyName"); reason = "COMPANY_NAME_CONFLICT"; }
    signals.push({ field: "companyName", reason, ocrRaw: [ocr.company], ocrCanonical: nameVariants(ocr.company).map(canonicalName), visionRaw: card.companyName ? [card.companyName] : [], visionCanonical: card.companyName ? nameVariants(card.companyName).map(canonicalName) : [] });
  }
  return { disagreements, signals };
}
