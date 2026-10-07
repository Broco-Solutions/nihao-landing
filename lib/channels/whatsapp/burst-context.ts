import type { AgentState } from "./agent-contract.ts";
import type { BurstCatalog, BurstSnapshot } from "./burst-types.ts";
import { operationalContext } from "./agent-policy.ts";
import { renderClarification } from "./clarification-rendering.ts";

export function contextOptions(catalog: BurstCatalog, state: AgentState) {
  const context = operationalContext(catalog, state);
  return context.trips.filter(t => !context.selectedTripId || t.id === context.selectedTripId).flatMap(t => t.companies.map(c => ({ id: c.id, label: `${t.name} — ${c.name}`, tripId: t.id, companyId: c.id })));
}
/** Resolve once for the operational burst. Never derive a choice from OCR or supplier names. */
export function resolveBurstContext(snapshot: BurstSnapshot, catalog: BurstCatalog, state: AgentState) {
  const eligible = operationalContext(catalog, { ...state, tripId: null, operationalContext: undefined });
  if (state.tripId && !eligible.trips.some(t => t.id === state.tripId)) state.tripId = null;
  if (state.operationalContext && !eligible.companies.some(c => c.tripId === state.operationalContext!.tripId && c.id === state.operationalContext!.companyId)) state.operationalContext = undefined;
  const legacy = state.agent.pending;
  if (legacy?.type === "CLARIFICATION" && !legacy.contextSelection && legacy.options.length && legacy.options.every(o => o.label.includes("—")) && /viaje|empresa|a qu[eé] opci[oó]n corresponde/iu.test(legacy.text)) legacy.contextSelection = true;
  const scopedPending = state.agent.pending;
  if (state.loadContexts && scopedPending?.contextSelection && scopedPending.loadId) {
    const answer = snapshot.messages.filter(m => m.sequence > scopedPending.revision && m.envelope.type === "TEXT").at(-1)?.envelope.text?.split(/[;\n]/u)[0].trim();
    const option = answer && /^\d+$/u.test(answer) ? scopedPending.options[Number(answer) - 1] : scopedPending.options.find(o => o.label.toLowerCase() === answer?.toLowerCase());
    const company = eligible.companies.find(c => c.id === option?.id);
    if (company) {
      state.loadContexts[scopedPending.loadId] = { tripId: company.tripId, companyId: company.id };
      const load = state.ingestion?.loads.find(l => l.id === scopedPending.loadId);
      if (load) { load.question = undefined; load.questionText = null; }
      state.agent.pending = null; state.question = null; state.agent.terminal = undefined;
    }
  }
  for (const [id, destination] of Object.entries(state.loadContexts ?? {})) if (!eligible.companies.some(c => c.id === destination.companyId && c.tripId === destination.tripId)) delete state.loadContexts![id];
  if (state.loadContexts && !Object.keys(state.loadContexts).length) state.loadContexts = undefined;
  const activeContext = state.ingestion?.activeLoadId ? state.loadContexts?.[state.ingestion.activeLoadId] : undefined;
  if (activeContext) { state.tripId = activeContext.tripId; state.operationalContext = activeContext; return activeContext; }
  if (state.loadContexts && !state.ingestion?.activeLoadId) { state.tripId = null; state.operationalContext = undefined; return null; }
  const context = operationalContext(catalog, state);
  const pending = state.agent.pending;
  const texts = snapshot.messages.filter(m => m.envelope.type === "TEXT" && (!pending || m.sequence > pending.revision)).map(m => m.envelope.text?.trim() ?? "");
  let selected = context.selectedTripId && context.selectedCompanyId ? { tripId: context.selectedTripId, companyId: context.selectedCompanyId } : null;
  const all = operationalContext(catalog, { ...state, tripId: null, operationalContext: undefined }).companies;
  if (pending?.contextSelection) {
    const answer = texts.at(-1)?.split(/[;\n]/u)[0].trim();
    const option = answer && /^\d+$/u.test(answer) ? pending.options[Number(answer) - 1] : pending.options.find(o => o.label.toLowerCase() === answer?.toLowerCase());
    const company = all.find(c => c.id === option?.id);
    if (company) selected = { tripId: company.tripId, companyId: company.id };
  }
  if (!selected) {
    const options = contextOptions(catalog, state);
    const explicit = options.filter(o => texts.some(text => text.toLowerCase() === o.label.toLowerCase()));
    if (explicit.length === 1) selected = explicit[0];
  }
  if (selected) {
    state.tripId = selected.tripId;
    state.operationalContext = { tripId: selected.tripId, companyId: selected.companyId };
    if (pending?.contextSelection) {
      state.agent.pending = pending.products?.length ? { ...pending, contextSelection: false, options: [], text: "Necesito confirmar las asociaciones pendientes." } : null;
      state.question = state.agent.pending ? renderClarification(state.agent.pending) : null; state.agent.terminal = undefined;
    }
  } else if (context.selectedTripId) state.tripId = context.selectedTripId;
  if (!selected && pending?.contextSelection && pending.options.some(o => !all.some(c => c.id === o.id))) askBurstContext(snapshot, catalog, state, pending.loadId);
  return selected;
}
export function askBurstContext(snapshot: BurstSnapshot, catalog: BurstCatalog, state: AgentState, loadId?: string) {
  const options = contextOptions(catalog, state).map(({ id, label }) => ({ id, label }));
  const load = state.ingestion?.loads.find(l => l.id === loadId);
  const products = state.agent.pending?.contextSelection ? state.agent.pending.products : undefined;
  state.agent.pending = { ...(loadId ? { loadId } : {}), type: "CLARIFICATION", contextSelection: true, ...(products?.length ? { products } : {}), text: load ? `¿En qué viaje y empresa querés cargar «${load.name ?? "esta evidencia"}»?` : "¿En qué viaje y empresa querés cargar esta ráfaga?", options, revision: snapshot.revision };
  state.question = renderClarification(state.agent.pending);
  state.agent.terminal = { revision: snapshot.revision, response: "" };
  state.agent.termination = { reason: "asked_clarification", rounds: 0, revision: snapshot.revision };
}

/** Exception to the burst default: explicit per-supplier user text, never temporal order/OCR.
 * Each line must name a load, the trip, and the internal company, uniquely. */
export function explicitLoadContexts(snapshot: BurstSnapshot, catalog: BurstCatalog) {
  const combinations = operationalContext(catalog, { ...snapshot.state as AgentState, tripId: null, operationalContext: undefined }).trips.flatMap(t => t.companies.map(c => ({ tripId: t.id, companyId: c.id, trip: t.name.toLowerCase(), company: c.name.toLowerCase() })));
  const destinationLine = (text: string) => text.trim().toLowerCase().replace(/\s*(?:—|→|->|\|)\s*/gu, " | ").replace(/\s+/gu, " ");
  const lines = snapshot.messages.filter(m => m.envelope.type === "TEXT").flatMap(m => (m.envelope.text ?? "").split(/[;\n]/u)).map(destinationLine);
  const destinations: Record<string, { tripId: string; companyId: string }> = {};
  for (const load of snapshot.state.ingestion?.loads.filter(l => l.type === "SUPPLIER" && l.name) ?? []) {
    const matches = combinations.filter(c => lines.some(line => line === destinationLine(`${load.name} | ${c.trip} | ${c.company}`)));
    if (matches.length === 1) destinations[load.id] = { tripId: matches[0].tripId, companyId: matches[0].companyId };
  }
  return new Set(Object.values(destinations).map(c => `${c.tripId}:${c.companyId}`)).size > 1 ? destinations : undefined;
}
