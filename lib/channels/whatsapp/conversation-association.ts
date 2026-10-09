import { orderedBurstMessages, type BurstSnapshot } from "./burst-types.ts";

export type SupplierConversationReference = { id: string; name: string | null; messageIds: string[]; tripId?: string; companyId?: string };
export type SupplierAssociation = { id?: string; reason: string; ambiguous?: boolean };
const normalize = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const ordinalWords = ["primer", "primero", "primera", "segundo", "segunda", "tercer", "tercero", "tercera", "cuarto", "cuarta", "quinto", "quinta"];
export function hasExplicitSupplierName(text: string) {
  if (/\bproveedor \d+\b/u.test(normalize(text))) return false;
  return /\bproveedor\s+(?!(?:nos|vende|ofrece|tiene|trabaja|maneja|acepta|requiere|es|del|de|anterior|ultimo|mismo|primero|primera|segundo|segunda|tercero|tercera|cuarto|cuarta|quinto|quinta)\b)[\p{L}\p{N}]/u.test(normalize(text));
}

/** Resolve against original message order. A failed explicit reference never falls back. */
export function resolveConversationSupplier(snapshot: BurstSnapshot, messageId: string, text: string, references: SupplierConversationReference[]): SupplierAssociation {
  const messages = orderedBurstMessages(snapshot);
  const positions = new Map(messages.map((message, index) => [message.id, index]));
  const source = positions.get(messageId);
  if (source === undefined) return { reason: "NO_PREVIOUS_SUPPLIER" };
  const previous = references.map((reference) => ({ ...reference, positions: reference.messageIds.map((id) => positions.get(id)).filter((index): index is number => index !== undefined && index < source) })).filter((reference) => reference.positions.length);
  const normalized = ` ${normalize(text)} `;
  const named = previous.filter((reference) => reference.name && normalized.includes(` ${normalize(reference.name)} `));
  if (named.length) {
    const unique = [...new Set(named.map((reference) => reference.id))];
    return unique.length === 1 ? { id: unique[0], reason: "EXPLICIT_SUPPLIER_NAME" } : { reason: "AMBIGUOUS_SUPPLIER_NAME", ambiguous: true };
  }
  const ordinal = normalize(text).match(new RegExp(`\\b(${ordinalWords.join("|")}|[1-9]) proveedor\\b|\\bproveedor (\\d+)\\b`, "u"));
  if (ordinal) {
    const word = ordinal[1] ?? ordinal[2];
    const number = /^\d+$/u.test(word) ? Number(word) : /^(?:primer|primero|primera)$/u.test(word) ? 1 : /^segund/u.test(word) ? 2 : /^tercer/u.test(word) ? 3 : /^cuart/u.test(word) ? 4 : 5;
    const unique = [...new Map(previous.sort((a, b) => Math.min(...a.positions) - Math.min(...b.positions)).map((reference) => [reference.id, reference])).values()];
    return unique[number - 1] ? { id: unique[number - 1].id, reason: "ORDINAL_SUPPLIER_REFERENCE" } : { reason: "UNRESOLVED_ORDINAL_REFERENCE", ambiguous: true };
  }
  const quote = messages[source].envelope.quotedMessageId;
  if (quote) {
    const quoted = messages.find((message) => message.envelope.messageId === quote);
    const candidates = previous.filter((reference) => quoted && reference.messageIds.includes(quoted.id));
    const ids = [...new Set(candidates.map((reference) => reference.id))];
    return ids.length === 1 ? { id: ids[0], reason: "QUOTED_SUPPLIER_REFERENCE" } : { reason: "UNRESOLVED_QUOTED_REFERENCE", ambiguous: true };
  }
  if (hasExplicitSupplierName(text)) return { reason: "UNRESOLVED_EXPLICIT_SUPPLIER", ambiguous: true };
  const context = snapshot.state.operationalContext;
  const scoped = previous.filter((reference) => (!context?.tripId || !reference.tripId || reference.tripId === context.tripId) && (!context?.companyId || !reference.companyId || reference.companyId === context.companyId));
  const nearest = scoped.sort((a, b) => Math.max(...b.positions) - Math.max(...a.positions));
  if (!nearest.length) return { reason: "NO_PREVIOUS_SUPPLIER" };
  const position = Math.max(...nearest[0].positions);
  const ids = [...new Set(nearest.filter((reference) => Math.max(...reference.positions) === position).map((reference) => reference.id))];
  return ids.length === 1 ? { id: ids[0], reason: /\b(?:este|ese|mismo|anterior|ultimo)\b/u.test(normalize(text)) ? "CONTEXTUAL_SUPPLIER_REFERENCE" : "NEAREST_PREVIOUS_SUPPLIER" } : { reason: "AMBIGUOUS_PREVIOUS_SUPPLIER", ambiguous: true };
}
