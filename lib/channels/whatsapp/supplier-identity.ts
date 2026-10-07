import { canonicalDomain, canonicalEmail, canonicalPhone, compareNames, canonicalOcrCard } from "./card-reconciliation.ts";
import type { AgentRecord } from "./agent-contract.ts";
import type { BurstSnapshot, BurstMessage } from "./burst-types.ts";
import type { LogicalLoad } from "./ingestion-types.ts";

export type SupplierIdentity = { names: string[]; emails: string[]; phones: string[]; domains: string[] };
const unique = (values: Array<string | null | undefined>) => [...new Set(values.filter((v): v is string => Boolean(v)))];
// Identity matching treats www as the same host; reconciliation's stricter representation stays unchanged.
export const identityDomain = (value: string) => canonicalDomain(value)?.replace(/^www\./u, "") ?? null;
export function messageIdentity(message: BurstMessage): SupplierIdentity {
  const meta = message.reading?.ingestion, card = meta?.classification?.card;
  if (!card) return { names: [], emails: [], phones: [], domains: [] };
  const grounded = meta?.ocrCandidate && canonicalOcrCard(meta.ocrCandidate, message.reading?.ocr ?? "").company;
  return { names: grounded ? [grounded] : [], emails: unique(card.uncertainFields.includes("emails") ? [] : card.emails.map(canonicalEmail)), phones: unique(card.uncertainFields.includes("phones") ? [] : card.phones.map(canonicalPhone)), domains: unique(card.uncertainFields.includes("websites") ? [] : card.websites.map(identityDomain)) };
}
export function loadIdentity(snapshot: BurstSnapshot, load: LogicalLoad): SupplierIdentity {
  const parts = snapshot.messages.filter(m => load.assetIds.includes(m.id)).map(messageIdentity);
  return { names: unique(parts.flatMap(p => p.names)), emails: unique(parts.flatMap(p => p.emails)), phones: unique(parts.flatMap(p => p.phones)), domains: unique(parts.flatMap(p => p.domains)) };
}
export function recordIdentity(record: AgentRecord): SupplierIdentity {
  const contacts = (record.data.contacts ?? record.data.contactMethods ?? []) as Array<{ type?: string | null; rawText: string }>;
  return { names: record.name ? [record.name] : [], emails: unique(contacts.filter(c => c.type === "EMAIL").map(c => canonicalEmail(c.rawText))), phones: unique(contacts.filter(c => c.type === "PHONE").map(c => canonicalPhone(c.rawText))), domains: typeof record.data.website === "string" ? unique([identityDomain(record.data.website)]) : [] };
}
export function strongSupplierIdentity(a: SupplierIdentity, b: SupplierIdentity): { matches: boolean; reasons: string[] } {
  const reasons: string[] = [];
  for (const field of ["emails", "domains", "phones"] as const) {
    if (a[field].length && b[field].length) {
      if (!a[field].some(v => b[field].includes(v))) return { matches: false, reasons: [`${field.toUpperCase()}_CONFLICT`] };
      reasons.push(`${field.toUpperCase()}_EXACT_MATCH`);
    }
  }
  if (a.names.length && b.names.length && a.names.some(n => !b.names.some(m => compareNames(n, m) !== "NAME_CONFLICT"))) return { matches: false, reasons: ["COMPANY_NAME_CONFLICT"] };
  const nameMatch = a.names.length && b.names.length && a.names.some(n => b.names.some(m => compareNames(n, m) !== "NAME_CONFLICT"));
  // No name-only resolution, no fuzzy aliases. A brand absent from OCR cannot contradict a legal name.
  const matches = reasons.length >= 2 || Boolean(nameMatch && reasons.includes("EMAILS_EXACT_MATCH"));
  if (nameMatch) reasons.push("COMPATIBLE_COMPANY_NAME");
  return { matches, reasons };
}
export function supplierSearchMatches(record: { companyName: string | null; website?: string | null; contacts?: Array<{ type?: string | null; rawText: string }>; contactMethods?: unknown }, query: string, nameMatch: boolean): boolean {
  if (nameMatch) return true;
  const email = canonicalEmail(query), domain = identityDomain(query), phone = canonicalPhone(query);
  const contacts = record.contacts ?? (Array.isArray(record.contactMethods) ? record.contactMethods as Array<{ type?: string | null; rawText: string }> : []);
  return Boolean(email && contacts.some(c => c.type === "EMAIL" && canonicalEmail(c.rawText) === email) || domain && record.website && identityDomain(record.website) === domain || phone && phone.length >= 6 && contacts.some(c => c.type === "PHONE" && canonicalPhone(c.rawText) === phone));
}
