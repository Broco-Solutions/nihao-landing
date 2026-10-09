import type { AgentEvidence } from "./agent-contract.ts";
import type { CaptionFacts } from "./reading-enrichment.ts";
import type { BurstMessage, BurstSnapshot } from "./burst-types.ts";

export const commercialKeys = ["fob", "moq", "leadTime"] as const;

/** Physical support never supplies scope. Require literal, explicit generality in
 * the clause containing this fact; another product's clause cannot borrow it. */
export function explicitlySupplierGeneral(text: string, rawText?: string): boolean {
  if (!rawText || !text.includes(rawText) || text.indexOf(rawText) !== text.lastIndexOf(rawText)) return false;
  const clause = text.split(/\.(?!\d)|(?<!\d)\.|[!?;\n]/u).find(part => part.includes(rawText));
  if (!clause) return false;
  const literal = clause.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (/\b(?:para|en|de) todos (?:sus |los )?productos\b|\b(?:condicion(?:es)?|terminos)\s+(?:comercial(?:es)?\s+)?general(?:es)?\s+(?:del? |para (?:el |este )?)proveedor\b/u.test(literal)) return true;
  const field = rawText.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().match(/\b(?:moq|fob|plazo|lead\s*time|entrega)\b/u)?.[0];
  // A general FOB must not globalize a MOQ in the same sentence.
  return Boolean(field && new RegExp(`\\b${field}\\s+general(?:es)?\\s+(?:del? |para (?:el |este )?)proveedor\\b`, "u").test(literal));
}

export function sourceTime(snapshot: BurstSnapshot, message?: BurstMessage): Date {
  const value = message?.sentAt ?? message?.envelope.sentAt ?? snapshot.createdAt;
  const date = value ? new Date(value) : new Date();
  return Number.isFinite(date.getTime()) ? date : new Date();
}

export function commercialEvidence(row: { id: string; sourceMessageId: string; text: string; facts: unknown }): AgentEvidence {
  const facts = row.facts as CaptionFacts;
  return { id: row.id, pendingId: row.id, messageId: row.sourceMessageId, start: 0, end: row.text.length, text: row.text, role: "FACTS", candidate: {
    extractedFields: { ...(facts.fob ? { fob: facts.fob } : {}), ...(facts.moq ? { moq: facts.moq } : {}), ...(facts.leadTime ? { leadTime: facts.leadTime } : {}) },
    rawSource: { type: "TEXT", text: row.text }, reviewFields: [], evidence: [],
  } };
}

/** Order is provenance chronology, not model argument order. Later components win. */
export function mergeCommercialFacts(evidence: AgentEvidence[]) {
  const fields: Record<string, unknown> = {};
  for (const source of evidence.filter(e => e.role === "FACTS")) {
    for (const key of ["fob", "moq", "leadTime"] as const) {
      const next = source.candidate.extractedFields[key];
      const defaults = key === "fob" ? { amount: null, currency: null, unit: null, rawText: "" } : key === "moq" ? { quantity: null, unit: null, notes: null, rawText: "" } : { days: null, rawText: "" };
      if (next && typeof next === "object") fields[key] = { ...defaults, ...(fields[key] as object | undefined), ...Object.fromEntries(Object.entries(next).filter(([, value]) => value != null)) };
    }
  }
  return fields;
}
