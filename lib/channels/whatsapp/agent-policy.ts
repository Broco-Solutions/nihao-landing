import { eligibleTrip } from "./trip-eligibility.ts";
import { AGENT_TOOLS, type AgentState } from "./agent-contract.ts";
import type { BurstCatalog, BurstSnapshot } from "./burst-types.ts";

export const AGENT_LOOP_LIMITS = { soft: 12, hard: 24, repeatedOperation: 2, stagnantRounds: 4, progressWindow: 2 } as const;
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => `${JSON.stringify(key)}:${canonicalJson(v)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function operationalContext(catalog: BurstCatalog, state: AgentState) {
  const trips = catalog.trips.filter(trip => eligibleTrip(trip)).map(({ id, name, companies }) => ({ id, name, companies }));
  const selected = trips.find((trip) => trip.id === state.tripId) ?? (trips.length === 1 ? trips[0] : undefined);
  return { trips, companies: trips.flatMap((trip) => trip.companies.map((company) => ({ ...company, tripId: trip.id }))), selectedTripId: selected?.id ?? null, selectedCompanyId: selected?.companies.find(c => state.operationalContext?.tripId === selected.id && c.id === state.operationalContext.companyId)?.id ?? (selected?.companies.length === 1 ? selected.companies[0].id : null) };
}

/** Only a single new, unquoted text can approve. Compound cancellation is safe;
 * compound approval still requires a separate affirmative answer to the sent proposal. */
export function pendingDecision(snapshot: BurstSnapshot, revision: number | null) {
  if (revision === null) return null;
  const messages = snapshot.messages.filter((message) => message.sequence > revision);
  const message = messages[0];
  if (messages.length !== 1 || message.envelope.type !== "TEXT" || message.envelope.quotedMessageId) return null;
  const text = (message.envelope.text ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
  const standalone = text.replace(/[.!]$/u, "");
  if (["si", "confirmar", "confirmo", "no", "cancelar"].includes(standalone)) return { id: message.id, cancel: ["no", "cancelar"].includes(standalone), standalone: true };
  const cancellation = /^(?:no confirmes (?:eso|el cambio|la propuesta)|cancel(?:a|ar) (?:eso|el cambio|la propuesta))(?=[.!;]|$)/u.exec(text);
  if (cancellation) return { id: message.id, cancel: true, standalone: !text.slice(cancellation[0].length).replace(/[.!;\s]/gu, "") };
  return null;
}

export function availableAgentTools(snapshot: BurstSnapshot, state: AgentState, catalog: BurstCatalog) {
  const proposal = state.agent.pending?.type === "APPROVAL" ? state.agent.pending : null;
  const decision = proposal ? pendingDecision(snapshot, proposal.revision) : null;
  const facts = state.agent.evidence.some((evidence) => evidence.role === "FACTS");
  const records = state.agent.resolvedRecords ?? [];
  const supplier = records.some((record) => record.kind !== "PRODUCT") || state.agent.receipts.some((r) => r.tool === "create_supplier_draft" && r.status === "COMPLETED");
  const product = records.some((record) => record.kind === "PRODUCT");
  const pending = Boolean(proposal || state.agent.receipts.some((r) => r.status === "PROPOSED"));
  return AGENT_TOOLS.filter((tool) => {
    const name = tool.function.name;
    if (decision?.standalone) return ["apply_pending_change", "cancel_pending_change", "finish_turn"].includes(name);
    if (name === "resolve_recent_reference") return true;
    if (name === "apply_pending_change" || name === "cancel_pending_change") return pending;
    if (name === "create_supplier_draft") return facts && catalog.trips.length > 0;
    if (name === "create_product_draft" || name === "update_supplier" || name === "preserve_product_facts") return facts && supplier;
    if (name === "update_product") return facts && product;
    return true;
  });
}

/** Only semantic state counts: resolved record versions count, history/call growth and rounds do not. */
export function progressState(state: AgentState): string {
  return canonicalJson({ tripId: state.tripId, evidence: state.agent.evidence.map((e) => e.id).sort(), records: [...(state.agent.resolvedRecords ?? [])].sort((a, b) => a.id.localeCompare(b.id)), receipts: state.agent.receipts.map((r) => ({ id: r.operationId, status: r.status, resourceStatus: r.resourceStatus })).sort((a, b) => a.id.localeCompare(b.id)), pending: state.agent.pending, terminal: state.agent.terminal });
}
export function trackProgress(state: AgentState, name: string, args: unknown, before: string) {
  const after = progressState(state);
  const operation = canonicalJson({ name, args });
  const previous = state.agent.watchdog;
  const changed = before !== after;
  state.agent.watchdog = {
    lastOperation: operation, lastState: after, lastErrorCode: previous?.lastErrorCode,
    repeats: changed ? 0 : previous?.lastOperation === operation && previous.lastState === after ? previous.repeats + 1 : 1,
    stagnantRounds: previous?.stagnantRounds ?? 0,
    lastProgressRound: changed ? state.agent.rounds : previous?.lastProgressRound ?? 0,
  };
  return changed;
}
