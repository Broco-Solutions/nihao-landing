import type { ExtractionCandidate } from "../../bot/types.ts";
import type { EvolutionMediaMessage } from "../evolution/client.ts";

export const BURST_QUIET_MS = 20_000;
export type BurstEnvelope = {
  instance: string; messageId: string; phone: string; type: "TEXT" | "IMAGE" | "AUDIO" | "DOCUMENT";
  text: string | null; media: EvolutionMediaMessage | null; sentAt: string | null; quotedMessageId?: string | null; selectionId?: string;
};
export type BurstReading = {
  validated?: boolean; ingestion?: import("./ingestion-types.ts").AssetIngestion; complete?: boolean; segmentationConfident?: boolean; storageKey?: string; mimeType?: string; transcript?: string; model?: string;
  ocr?: string; visual?: string; productImageVerified?: boolean; imageKind?: "BUSINESS_CARD" | "PRODUCT_IMAGE" | "DOCUMENT" | "OTHER";
  segments: Array<{ id: string; text: string; candidate?: ExtractionCandidate }>;
};
export type BurstMessage = { id: string; sequence: number; sentAt: Date | null; envelope: BurstEnvelope; reading: BurstReading | null };
export type BurstGroup = {
  id: string; name: string | null; refs: string[]; companyId: string | null;
  reason: string; certain: boolean; captureId?: string;
  kind?: "SUPPLIER_CAPTURE" | "PRODUCT";
  supplierQuery?: string | null; supplierId?: string | null;
  supplierOptions?: string[]; productName?: string | null; productId?: string; resourceStatus?: "DRAFT" | "CONFIRMED";
};
export type BurstState = { loadContexts?: Record<string, { tripId: string; companyId: string }>; operationalContext?: { tripId: string; companyId: string }; outboundReplies?: Array<{ revision: number; messageId: string }>;  ingestion?: import("./ingestion-types.ts").EvidenceGraph; tripId: string | null; groups: BurstGroup[]; question: string | null; controlIds: string[]; pendingRefs: string[]; order?: string[]; notice?: string | null; legacyBatchId?: string; evaluatedRevision?: number };
export type BurstSnapshot = {
  createdAt?: Date | string; recoveredLease?: boolean; version?: number;
  id: string; instance: string; phone: string; userId: string; revision: number;
  status: string; leaseId: string | null; state: BurstState; messages: BurstMessage[];
};
export type BurstSupplier = { id: string; name: string; companyId: string; captureId: string; city: string | null };
export type BurstCatalog = { trips: Array<{ id: string; name: string; status?: string; endDate?: Date | string | null; companies: Array<{ id: string; name: string }>; suppliers?: BurstSupplier[] }> };
export type BurstPlan = BurstState;
export interface BurstStore {
  receive(envelope: BurstEnvelope): Promise<boolean>;
  claim(limit: number): Promise<BurstSnapshot[]>;
  saveReading(messageId: string, reading: BurstReading, snapshot?: BurstSnapshot): Promise<void>;
  catalog(userId: string, includeSuppliers?: boolean): Promise<BurstCatalog>;
  reserve(snapshot: BurstSnapshot, state: BurstState): Promise<boolean>;
  finish(snapshot: BurstSnapshot, state: BurstState, text: string): Promise<void>;
  retry(snapshot: BurstSnapshot, checkpoint?: boolean): Promise<void>;
  flushReplies(send: (phone: string, text: string, context?: import("./supplier-picker.ts").ReplyContext) => Promise<void>): Promise<void>;
}

/** Stable labels use sender timestamps then durable receipt order, never download completion. */
export function orderedMessages(messages: BurstMessage[]): BurstMessage[] {
  return [...messages].sort((a, b) => (a.sentAt?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.sentAt?.getTime() ?? Number.MAX_SAFE_INTEGER) || a.sequence - b.sequence);
}

/** Once displayed, message positions remain stable even if an older delivery arrives late. */
export function orderedBurstMessages(snapshot: BurstSnapshot): BurstMessage[] {
  const frozen = snapshot.state.order ?? [];
  const byId = new Map(snapshot.messages.map((m) => [m.id, m]));
  return [...frozen.flatMap((id) => byId.has(id) ? [byId.get(id)!] : []), ...orderedMessages(snapshot.messages.filter((m) => !frozen.includes(m.id)))];
}
