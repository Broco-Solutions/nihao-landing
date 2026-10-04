import type { AgentRecord, AgentState } from "./agent-contract.ts";
import type { BurstCatalog, BurstSnapshot } from "./burst-types.ts";
import { factualText, sourceText } from "./agent-tools.ts";

export const RECENT_CONVERSATION_LIMIT = 5;
export const RECENT_MEMORY_MS = 24 * 60 * 60 * 1000;
export type MemoryReference = Pick<AgentRecord, "id" | "kind" | "name" | "tripId" | "companyId" | "captureId" | "supplierId" | "companyLabel" | "city" | "status">;
export type RecentConversation = { conversationId: string; completedAt: string; references: MemoryReference[]; operations: Array<{ tool: string; status: string; id: string }> };
const normalize = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
export const memoryReference = (record: AgentRecord): MemoryReference => ({ id: record.id, kind: record.kind, name: record.name, tripId: record.tripId, companyId: record.companyId, captureId: record.captureId, supplierId: record.supplierId, companyLabel: record.companyLabel, city: record.city, status: record.status });

// Only selected/read records and completed writes become context; broad search results do not.
export function rememberedIds(state: Partial<AgentState>): Array<{ id: string; kind: "SUPPLIER" | "PRODUCT" }> {
  const ids = new Map<string, { id: string; kind: "SUPPLIER" | "PRODUCT" }>();
  const add = (id: unknown, kind: "SUPPLIER" | "PRODUCT") => { if (typeof id === "string") ids.set(`${kind}:${id}`, { id, kind }); };
  for (const call of state.agent?.calls ?? []) {
    const result = call.result as { id?: string; error?: unknown; records?: AgentRecord[] } | null;
    if (!result || result.error) continue;
    if (call.name === "get_supplier" || call.name === "get_product") add(result.id, call.name === "get_product" ? "PRODUCT" : "SUPPLIER");
    if ((call.name === "search_suppliers" || call.name === "search_products" || call.name === "resolve_recent_reference") && result.records?.length === 1) {
      const record = result.records[0]; add(record.id, record.kind === "PRODUCT" ? "PRODUCT" : "SUPPLIER");
    }
  }
  for (const receipt of state.agent?.receipts ?? []) if (receipt.status === "COMPLETED") add(receipt.id, receipt.tool.includes("product") ? "PRODUCT" : "SUPPLIER");
  return [...ids.values()].slice(-10);
}

export function hasRecentReference(snapshot: BurstSnapshot): boolean {
  const text = normalize(snapshot.messages.map((m) => factualText(sourceText(snapshot, m.id))).join("\n"));
  return /\b(?:agregale|sumale|anadile|agreguele|ese proveedor|este proveedor|mismo proveedor|proveedor (?:de recien|anterior)|(?:ultimo|ultima) (?:producto|proveedor)|(?:producto|proveedor) (?:anterior|de recien)|ese producto|este producto|corregilo|actualizalo)\b/u.test(text);
}

export function recentReferenceCandidates(memory: RecentConversation[], snapshot: BurstSnapshot, catalog: BurstCatalog, kind: "SUPPLIER" | "PRODUCT"): MemoryReference[] {
  const pending = (snapshot.state as Partial<AgentState>).agent?.pending;
  // A pending question owns the context; history cannot choose a different destination.
  if (pending) return [];
  const text = normalize(snapshot.messages.map((m) => factualText(sourceText(snapshot, m.id))).join("\n"));
  if (!hasRecentReference(snapshot)) return [];
  // An explicit destination takes precedence, including a supplier absent from memory.
  if (/\bproveedor\s+(?!(?:de recien|anterior|ultimo|mismo)\b)[\p{L}\p{N}]/u.test(text)) return [];
  const explicitDestination = text.match(/\b(?:para|al|a)\s+(?!(?:el|mismo|ese|este|ultimo|proveedor|producto|usd|eur|cny)\b)([\p{L}\p{N}]+)/u)?.[1];
  if (explicitDestination && !catalog.trips.some((t) => t.companies.some((c) => normalize(c.name).split(" ")[0] === explicitDestination))) return [];
  const companies = catalog.trips.flatMap((t) => t.companies).filter((c) => text.includes(normalize(c.name)) || new RegExp(`\\b${normalize(c.name).split(" ")[0]}\\b`, "u").test(text));
  const trips = catalog.trips.filter((t) => Boolean(t.name) && text.includes(normalize(t.name)));
  // "Último/de recién/anterior" explicitly narrows to the latest relevant conversation.
  const last = /\b(?:ultimo|ultima|de recien|anterior)\b/u.test(text);
  const candidates = new Map<string, MemoryReference>();
  for (const conversation of memory) {
    const refs = conversation.references.filter((r) => (kind === "PRODUCT" ? r.kind === "PRODUCT" : r.kind !== "PRODUCT") && (!companies.length || companies.some((c) => c.id === r.companyId)) && (!trips.length || trips.some((t) => t.id === r.tripId)));
    for (const r of refs) candidates.set(r.id, r);
    if (last && refs.length) break;
  }
  return [...candidates.values()];
}
