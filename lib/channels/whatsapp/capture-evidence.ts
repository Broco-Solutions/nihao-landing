import { cardCandidate } from "./multimodal-reading.ts";
import { canonicalEmail, canonicalPhone, canonicalDomain, canonicalOcrCard, compareCard } from "./card-reconciliation.ts";
import type { BurstMessage, BurstSnapshot } from "./burst-types.ts";
import type { Tier1Field } from "../../bot/types.ts";
import type { AgentEvidence } from "./agent-contract.ts";

/** Keep disputed alternatives in the reading; expose only supported fields as facts. */
export function captureEvidence(message: BurstMessage): AgentEvidence {
  const reading = message.reading;
  const meta = reading?.ingestion;
  const card = meta?.classification?.card;
  let candidate;
  if (card) {
    const comparisons = [meta?.reconciliation?.ocr, ...(meta?.error?.type === "AMBIGUOUS_CARD_READING" ? meta.independentReadings ?? [] : []).filter(v => v.card && v.card !== card).map(v => canonicalOcrCard(cardCandidate(v.card!).candidate, cardCandidate(v.card!).text))].filter(v => v !== undefined);
    const conflicts = [...new Set(comparisons.flatMap(ocr => compareCard(card, ocr).disagreements))];
    const uncertain = new Set(card.uncertainFields);
    const safe = { ...card, visibleText: [], personName: null, role: null, address: null };
    if (uncertain.has("companyName") || conflicts.includes("companyName")) safe.companyName = null;
    for (const [field, canonical, key] of [
      ["emails", canonicalEmail, "emails"],
      ["phones", canonicalPhone, "phones"],
      ["websites", canonicalDomain, "domains"],
    ] as const) safe[field] = uncertain.has(field) ? [] : card[field].filter(value => !conflicts.includes(field) || comparisons.every(ocr => !ocr[key].length || ocr[key].includes(canonical(value) ?? "")));
    candidate = cardCandidate(safe).candidate;
    const ocr = meta?.ocrCandidate;
    for (const field of ["city", "province", "category", "supplierType", "interestScore"] as const) {
      const value = ocr?.extractedFields[field];
      const proof = ocr?.evidence.filter(e => e.field === field && e.evidence.trim() && reading?.ocr?.includes(e.evidence)) ?? [];
      if (value != null && !ocr?.reviewFields.includes(field) && !uncertain.has(field) && proof.length) {
        (candidate.extractedFields as Record<Tier1Field, unknown>)[field] = value;
        candidate.evidence.push(...proof);
      }
    }
  } else if (message.envelope.type === "IMAGE") {
    // Unidentified supports have no trustworthy supplier identity. Preserve OCR as trace.
    candidate = { extractedFields: {}, evidence: [], reviewFields: [], rawSource: { type: "IMAGE_BUSINESS_CARD" as const, text: "" } };
  } else {
    candidate = reading?.segments[0]?.candidate ?? { extractedFields: {}, evidence: [], reviewFields: [], rawSource: { type: "TEXT" as const, text: message.envelope.text ?? reading?.transcript ?? "" } };
  }
  const text = candidate.rawSource.text ?? "";
  return { id: `${message.id}:capture`, messageId: message.id, start: 0, end: text.length, text, role: "FACTS", candidate };
}

export function captureTrace(snapshot: BurstSnapshot, loadId: string) {
  const graph = snapshot.state.ingestion!;
  const load = graph.loads.find(l => l.id === loadId)!;
  return { kind: "WHATSAPP_CAPTURE_PROVENANCE", burstId: snapshot.id, loadId, reviewReason: load.error, links: graph.links.filter(l => load.assetIds.includes(l.sourceAssetId)), sources: snapshot.messages.filter(m => load.assetIds.includes(m.id)).map(m => ({ messageId: m.id, envelope: m.envelope, reading: m.reading })) };
}

/** Additional literal card information without a structured supplier column. */
export function captureNotes(messages: BurstMessage[]): string | null {
  const notes = messages.flatMap(message => {
    const meta = message.reading?.ingestion, card = meta?.classification?.card;
    if (!card) return [];
    const independent = meta?.independentReadings?.filter(v => v.card) ?? [];
    return [card.personName, card.role, card.address, ...card.visibleText].filter((value): value is string => {
      if (!value?.trim()) return false;
      if (message.reading?.ocr?.includes(value)) return true;
      return independent.length > 1 && independent.every(v => [v.card?.personName, v.card?.role, v.card?.address, ...(v.card?.visibleText ?? [])].includes(value));
    });
  });
  return [...new Set(notes)].join("\n") || null;
}
