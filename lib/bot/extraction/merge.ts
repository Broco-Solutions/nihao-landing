import { TIER_1_FIELDS, type ExtractionCandidate, type ExtractionConflict, type Tier1Data, type Tier1Field } from "../types.ts";

function meaningful(field: Tier1Field, value: Tier1Data[Tier1Field] | undefined): boolean {
  if (value === undefined || value === null || value === "") return false;
  return !(field === "supplierType" && value === "UNKNOWN");
}

function fingerprint(field: Tier1Field, value: Tier1Data[Tier1Field]): string {
  if (typeof value === "string") return value.trim().toLocaleLowerCase("es");
  if (field === "fob" && value) {
    const fob = value as Tier1Data["fob"];
    if (!fob) return "";
    return `${fob.amount}|${fob.currency?.trim().toUpperCase()}|${fob.unit?.trim().toLocaleLowerCase("es")}`;
  }
  if (field === "moq" && value) {
    const moq = value as Tier1Data["moq"];
    if (!moq) return "";
    return `${moq.quantity}|${moq.unit?.trim().toLocaleLowerCase("es")}|${moq.notes?.trim().toLocaleLowerCase("es")}`;
  }
  if (field === "leadTime" && value) {
    const leadTime = value as Tier1Data["leadTime"];
    if (!leadTime) return "";
    return leadTime.days === null ? leadTime.rawText.trim().toLocaleLowerCase("es") : String(leadTime.days);
  }
  return String(value);
}

type ContactPart = "name" | "email" | "phone" | "wechat";
type ParsedContact = Partial<Record<ContactPart, string>>;

function parseContact(value: string): ParsedContact | null {
  const result: ParsedContact = {};
  for (const rawPart of value.split(/\s*·\s*/u)) {
    const part = rawPart.trim();
    let field: ContactPart;
    let content = part;
    if (/^[^\s@·]+@[^\s@·]+\.[^\s@·]+$/u.test(part)) field = "email";
    else if (/^\+?[\d\s().-]+(?:\s*(?:ext\.?|interno|int\.?)\s*:?\s*\d+)?$/iu.test(part) && part.replace(/\D/g, "").length >= 7) field = "phone";
    else if (/^WeChat:\s*\S.*$/iu.test(part)) { field = "wechat"; content = part.replace(/^WeChat:\s*/iu, "").trim(); }
    else if (/^[\p{L}\p{M}][\p{L}\p{M}\s.'’\-]*$/u.test(part)) field = "name";
    else return null;
    if (result[field] || !content) return null;
    result[field] = content;
  }
  return Object.keys(result).length ? result : null;
}

function contactFingerprint(field: ContactPart, value: string): string {
  if (field === "phone") return value.replace(/\D/g, "");
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}

function mergeContact(values: string[]): { value: string } | { conflict: true } | null {
  const parsed = values.map(parseContact);
  // Opaque free-form contacts retain the prior whole-string conflict behavior.
  if (parsed.some((item) => item === null)) return null;
  const merged: ParsedContact = {};
  for (const field of ["name", "email", "phone", "wechat"] as const) {
    const pieces = parsed.flatMap((item) => item?.[field] ? [item[field]] : []);
    if (!pieces.length) continue;
    if (new Set(pieces.map((piece) => contactFingerprint(field, piece))).size > 1) return { conflict: true };
    const normalized = pieces.map((piece) => piece.trim().replace(/\s+/g, " "));
    merged[field] = field === "email" ? normalized[0].toLowerCase() : normalized.sort()[0];
  }
  const parts = [merged.name, merged.email, merged.phone, merged.wechat ? `WeChat: ${merged.wechat}` : null].filter((item): item is string => Boolean(item));
  return { value: parts.join(" · ") };
}

/**
 * Merges independent source candidates conservatively. Equal values reinforce
 * each other; different meaningful values are never selected automatically.
 */
export function mergeExtractionCandidates(candidates: ExtractionCandidate[]): ExtractionCandidate {
  if (candidates.length === 0) throw new Error("Se requiere al menos una extracción");
  const extractedFields: Partial<Tier1Data> = {};
  const conflicts: ExtractionConflict[] = [];

  for (const field of TIER_1_FIELDS) {
    const values = candidates.flatMap((candidate) => {
      const value = candidate.extractedFields[field];
      return meaningful(field, value) ? [{ source: candidate.rawSource, value: value as Tier1Data[typeof field] }] : [];
    });
    if (values.length === 0) continue;
    if (field === "contact" && values.length > 1) {
      const contact = mergeContact(values.map((entry) => entry.value as string));
      if (contact && "value" in contact) {
        extractedFields.contact = contact.value;
        continue;
      }
      if (contact && "conflict" in contact) {
        conflicts.push({ field, candidates: values });
        continue;
      }
    }
    if (new Set(values.map((entry) => fingerprint(field, entry.value))).size > 1) {
      conflicts.push({ field, candidates: values });
      continue;
    }
    extractedFields[field] = values[0].value as never;
  }

  return {
    extractedFields,
    reviewFields: [...new Set([...candidates.flatMap((candidate) => candidate.reviewFields), ...conflicts.map((conflict) => conflict.field)])],
    evidence: candidates.flatMap((candidate) => candidate.evidence),
    rawSource: candidates[0].rawSource,
    mergedSources: candidates.map((candidate) => candidate.rawSource),
    sourceConflicts: conflicts,
  };
}
