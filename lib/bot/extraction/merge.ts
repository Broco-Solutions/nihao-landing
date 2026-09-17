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
