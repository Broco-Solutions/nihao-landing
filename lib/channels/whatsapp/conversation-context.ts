import type { AgentReceipt } from "./agent-contract.ts";
import type { BurstSnapshot } from "./burst-types.ts";
import type { MemoryReference } from "./agent-memory.ts";
import { sourceTime } from "./pending-commercial-evidence.ts";

export type ConversationFocus = {
  version: 1;
  revision?: number;
  cleared?: boolean;
  supplierIds: string[];
  productIds: string[];
  tripId?: string;
  companyId?: string;
  burstId?: string;
  operationIds: string[];
  sourceMessageIds: string[];
  sourceAt?: string;
};
export type ConversationContext = { focus: ConversationFocus; suppliers: MemoryReference[]; products: MemoryReference[] };
export const emptyFocus = (): ConversationFocus => ({ version: 1, supplierIds: [], productIds: [], operationIds: [], sourceMessageIds: [] });

/** Completing several creations in one turn retains all candidates, regardless of worker order. */
export function advanceFocus(focus: ConversationFocus, receipt: AgentReceipt, snapshot: BurstSnapshot, supplierId?: string): ConversationFocus {
  if (receipt.status !== "COMPLETED" || focus.operationIds.includes(receipt.operationId)) return focus;
  const product = receipt.tool.includes("product");
  const supplier = receipt.tool.includes("supplier") || receipt.tool === "resolve_existing_resource";
  if (!product && !supplier) return focus;
  const sameTurn = focus.burstId === snapshot.id && focus.revision === snapshot.revision && focus.tripId === receipt.tripId && focus.companyId === receipt.companyId;
  const sources = snapshot.messages.filter(m => receipt.evidenceIds?.some(id => id.startsWith(`${m.id}:`)) || receipt.logicalLoadIds?.some(id => snapshot.state.ingestion?.loads.find(l => l.id === id)?.assetIds.includes(m.id)));
  const sourceAt = sourceTime(snapshot, sources.at(-1) ?? snapshot.messages.at(-1)).toISOString();
  if (focus.sourceAt && sourceAt < focus.sourceAt && !(product && sameTurn && focus.supplierIds.includes(supplierId ?? ""))) return focus;
  const creating = receipt.tool.startsWith("create_");
  const next = { ...emptyFocus(), ...focus, burstId: snapshot.id, revision: snapshot.revision, cleared: false, tripId: receipt.tripId, companyId: receipt.companyId,
    operationIds: [...focus.operationIds, receipt.operationId].slice(-100),
    sourceMessageIds: sources.map(m => m.id), sourceAt: focus.sourceAt && focus.sourceAt > sourceAt ? focus.sourceAt : sourceAt,
  };
  if (product) {
    next.productIds = creating && sameTurn ? [...new Set([...focus.productIds, receipt.id])] : [receipt.id];
    next.supplierIds = supplierId ? [supplierId] : [];
  } else {
    next.supplierIds = [receipt.id];
    next.productIds = [];
  }
  return next;
}

export function conversationText(snapshot: BurstSnapshot): string {
  const pending = (snapshot.state as import("./agent-contract.ts").AgentState).agent?.pending;
  const messages = pending ? snapshot.messages.filter(m => m.sequence > pending.revision) : snapshot.messages;
  return messages.map(m => m.envelope.type === "AUDIO" ? m.reading?.transcript ?? "" : m.envelope.text ?? "").join("\n").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
export function resetsConversation(snapshot: BurstSnapshot): boolean {
  return /\b(?:empez(?:a|ar|amos|ar?emos) de (?:nuevo|cero)|reinici(?:a|ar) (?:la )?conversacion|olvid(?:a|ar) (?:el )?contexto|cambi(?:a|ar|amos) de tema)\b/u.test(conversationText(snapshot));
}
export function continuationIntent(snapshot: BurstSnapshot): boolean {
  const text = conversationText(snapshot);
  if (/\b(?:nuevo|otro|otra) (?:producto|proveedor)\b|\b(?:producto|proveedor) (?:nuevo|nueva)\b|\b(?:carga|agrega|tengo) (?:un|una)\b/u.test(text)) return false;
  return /^(?:fob|moq|precio|plazo|lead\s*time|usd|eur|cny|\d+\s+unidades)\b/u.test(text.trim()) || /\b(?:aclaro|aclaracion|me equivoque|corregi|corregilo|en realidad|tambien|ademas|agregale|sumale|ese producto|este producto|mismo producto|el moq|el precio|el plazo|son \d+|es de \d+)\b/u.test(text);
}

/** Explicit names, quotes and ordinals are resolved first; focus is only the implicit destination. */
export function focusCandidates(context: ConversationContext, snapshot: BurstSnapshot, kind: "SUPPLIER" | "PRODUCT"): MemoryReference[] {
  const scope = snapshot.state.operationalContext;
  const refs = (kind === "PRODUCT" ? context.products : context.suppliers).filter(r => (!scope || r.tripId === scope.tripId && r.companyId === scope.companyId) && (!snapshot.state.tripId || r.tripId === snapshot.state.tripId));
  const text = conversationText(snapshot);
  const named = refs.filter(r => r.name && text.includes(r.name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()));
  return named.length ? named : refs;
}

/** Inherit only a validated scope, and let explicit trip/company changes override it. */
export function inheritConversationScope(snapshot: BurstSnapshot, catalog: import("./burst-types.ts").BurstCatalog, context: ConversationContext): void {
  const focus = context.focus;
  if (snapshot.state.operationalContext || snapshot.state.tripId && snapshot.state.tripId !== focus.tripId || !focus.tripId || !focus.companyId || !context.suppliers.length && !context.products.length) return;
  const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const text = conversationText(snapshot);
  const namedTrip = catalog.trips.filter(t => text.includes(normalize(t.name)));
  const namedCompany = catalog.trips.flatMap(t => t.companies).filter(c => text.includes(normalize(c.name)));
  if (namedTrip.some(t => t.id !== focus.tripId) || namedCompany.some(c => c.id !== focus.companyId)) return;
  if (!catalog.trips.some(t => t.id === focus.tripId && t.companies.some(c => c.id === focus.companyId))) return;
  snapshot.state.tripId = focus.tripId;
  snapshot.state.operationalContext = { tripId: focus.tripId, companyId: focus.companyId };
}
