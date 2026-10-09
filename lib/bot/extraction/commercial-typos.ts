import type { ExtractionCandidate } from "../types.ts";

/** Interpret a misspelled commercial field label, never rewrite the literal source. */
export function commercialTypoFacts(text: string, candidate: ExtractionCandidate): ExtractionCandidate {
  // Restrict the correction to standalone field/value lines. Prose about a phone,
  // names, questions or multiple possible amounts must remain with the agent.
  const matches = [...text.matchAll(/^\s*fon\s*:?\s*(\d+(?:[.,]\d{1,2})?)\s*(USD|EUR|CNY)?\s*$/gimu)];
  if (matches.length !== 1 || /\bfob\b/iu.test(text)) return candidate;
  const match = matches[0];
  const amount = Number(match[1].replace(",", "."));
  if (!Number.isFinite(amount)) return candidate;
  const rawText = match[0].trim();
  return {
    ...candidate,
    extractedFields: { ...candidate.extractedFields, fob: { amount, currency: match[2]?.toUpperCase() ?? null, unit: null, rawText } },
    evidence: [...candidate.evidence.filter(e => e.field !== "fob"), { field: "fob", evidence: rawText, confidence: 1 }],
    reviewFields: candidate.reviewFields.filter(field => field !== "fob"),
  };
}
