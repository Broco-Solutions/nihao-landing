import { cardCandidate } from "./multimodal-reading.ts";
import type { BurstMessage, BurstSnapshot } from "./burst-types.ts";
import type { Tier1Field } from "../../bot/types.ts";
import type { AgentEvidence } from "./agent-contract.ts";

/** Preserve read fields and retain disputed alternatives in provenance. */
export function captureEvidence(message: BurstMessage): AgentEvidence {
  const reading = message.reading;
  const meta = reading?.ingestion;
  const card = meta?.classification?.card;
  let candidate;
  if (card) {
    // Uncertainty is retained in provenance; it never discards the fields read from the card.
    const safe = { ...card };
    candidate = cardCandidate(safe).candidate;
    const ocr = meta?.ocrCandidate;
    for (const field of ["city", "province", "category", "supplierType", "interestScore"] as const) {
      const value = ocr?.extractedFields[field];
      const proof = ocr?.evidence.filter(e => e.field === field && e.evidence.trim() && reading?.ocr?.includes(e.evidence)) ?? [];
      if (value != null && proof.length) {
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
  const caption = meta?.caption;
  if (card && caption?.pendingFacts && !caption.products.length && !caption.supplierReference) {
    Object.assign(candidate.extractedFields, Object.fromEntries(["fob", "moq", "leadTime"].flatMap(key => {
      const value = caption.pendingFacts![key as "fob" | "moq" | "leadTime"];
      return value ? [[key, value]] : [];
    })));
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
    if (!card) {
      if (!["TEXT", "AUDIO"].includes(message.envelope.type)) return [];
      let text = message.envelope.text ?? message.reading?.transcript ?? "";
      const fields = message.reading?.segments[0]?.candidate?.extractedFields;
      for (const key of ["fob", "moq", "leadTime"] as const) if (fields?.[key]?.rawText) text = text.replace(fields[key]!.rawText, "");
      text = text.replace(/^[\s,;.]+|[\s,;.]+$/gu, "").trim();
      return text && !/^(?:y|listo|reintentar|\d+)$/iu.test(text) ? [text] : [];
    }
    const structured = new Set([card.companyName, ...card.emails, ...card.phones, ...card.websites].filter(Boolean).map(value => value!.trim().toLowerCase()));
    return [card.personName, card.role, card.address, ...card.visibleText].filter((value): value is string => {
      if (!value?.trim() || structured.has(value.trim().toLowerCase())) return false;
      if (card.visibleText.includes(value) || [card.personName, card.role, card.address].includes(value)) return true;
      if (message.reading?.ocr?.includes(value)) return true;
      return false;
    });
  });
  return [...new Set([...notes, ...messages.flatMap(message => !message.reading?.ingestion?.caption?.supplierReference && message.reading?.ingestion?.caption?.supplierNotes ? [message.reading.ingestion.caption.supplierNotes] : [])])].join("\n") || null;
}
