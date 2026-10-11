import { isLowInformationText, persistedCatalogQuery, type PersistedCatalogQuery } from "./burst-routing.ts";
import { updateGraphSummary } from "./evidence-grouping.ts";
import type { AgentDomain, AgentRecord, AgentState } from "./agent-contract.ts";
import type { BurstCatalog, BurstSnapshot } from "./burst-types.ts";

const normalizeQuery = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const confirmed = (record: AgentRecord) => record.kind === "SUPPLIER" || record.status === "CONFIRMED";
const label = (record: AgentRecord) => record.name?.trim() || (record.kind === "PRODUCT" ? "Producto sin nombre" : "Proveedor sin identificar");

function section(title: string, records: AgentRecord[], empty: string): string {
  if (!records.length) return `*${title}*\n${empty}`;
  const ready = records.filter(confirmed);
  const review = records.filter((record) => !confirmed(record));
  return [
    `*${title}*`,
    ready.length ? `Confirmados (${ready.length}):\n${ready.map((record) => `• ${label(record)}`).join("\n")}` : null,
    review.length ? `Pendientes de revisión (${review.length}):\n${review.map((record) => `• ${label(record)}`).join("\n")}` : null,
    records.length === 20 ? "Se muestran hasta 20 resultados. Podés consultar el listado completo en la Web." : null,
  ].filter(Boolean).join("\n\n");
}

export function purePersistedCatalogQuery(snapshot: BurstSnapshot): PersistedCatalogQuery | null {
  const messages = snapshot.messages.filter((message) => message.sequence > (snapshot.state.evaluatedRevision ?? 0));
  if (!messages.length || messages.some((message) => message.envelope.type !== "TEXT" || message.envelope.quotedMessageId || message.envelope.selectionId)) return null;
  const queries = messages.flatMap((message) => {
    const query = persistedCatalogQuery(message.envelope.text);
    return query ? [query] : isLowInformationText(message.envelope.text) ? [] : [null];
  });
  if (!queries.length || queries.includes(null)) return null;
  if (queries.includes("SUMMARY") || new Set(queries).size > 1) return "SUMMARY";
  return queries[0];
}

export function purePendingEvidenceQuery(snapshot: BurstSnapshot): boolean {
  const messages = snapshot.messages.filter((message) => message.sequence > (snapshot.state.evaluatedRevision ?? 0));
  return messages.length > 0
    && messages.every((message) => message.envelope.type === "TEXT" && !message.envelope.selectionId && /^(?:(?:decime|mostrame|indicame)\s+(?:que\s+)?(?:evidencia|capturas?)\s+(?:esta|estan|sigue|siguen)\s+pendiente(?:s)?|(?:que\s+)?(?:evidencia|capturas?)\s+(?:esta|estan|sigue|siguen)\s+pendiente(?:s)?|que\s+falta\s+procesar|(?:que|cuales|cuantos)\s+faltan\s+procesar|estado\s+(?:de\s+)?(?:la\s+)?(?:evidencia|captura|procesamiento))\b/u.test(normalizeQuery(message.envelope.text ?? "")));
}

function completeQueryGraph(snapshot: BurstSnapshot, state: AgentState) {
  const graph = state.ingestion;
  if (!graph) return;
  const currentIds = new Set(snapshot.messages.filter((message) => message.sequence > (state.evaluatedRevision ?? 0)).map((message) => message.id));
  for (const load of graph.loads.filter((candidate) => candidate.type === "EVIDENCE" && candidate.assetIds.every((id) => currentIds.has(id)))) {
    load.status = "PROCESSED";
    load.error = undefined;
    load.reasons = [...new Set([...load.reasons, "PERSISTED_QUERY_COMPLETED"])];
  }
  updateGraphSummary(graph);
}

function olderPendingNotice(snapshot: BurstSnapshot, state: AgentState): string | null {
  const graph = state.ingestion;
  if (!graph) return null;
  const currentIds = new Set(snapshot.messages.filter((message) => message.sequence > (state.evaluatedRevision ?? 0)).map((message) => message.id));
  const pending = graph.loads.filter((load) => !load.resolution && !["PROCESSED", "NEEDS_REVIEW", "FAILED"].includes(load.status) && load.assetIds.some((id) => !currentIds.has(id))).length;
  if (!pending) return null;
  return `⚠️ Además, ${pending === 1 ? "hay 1 evidencia anterior pendiente" : `hay ${pending} evidencias anteriores pendientes`} de procesamiento. Este listado muestra solamente registros comerciales ya guardados.`;
}

export async function answerPersistedCatalogQuery(input: {
  snapshot: BurstSnapshot;
  state: AgentState;
  catalog: BurstCatalog;
  domain: AgentDomain;
}): Promise<string | null> {
  const { snapshot, state, catalog, domain } = input;
  if (purePendingEvidenceQuery(snapshot)) {
    const currentMessageIds = snapshot.messages.filter((message) => message.sequence > (state.evaluatedRevision ?? 0)).map((message) => message.id);
    const tripNames = new Map(catalog.trips.map((trip) => [trip.id, trip.name]));
    try {
      const authorizedTripIds = new Set(catalog.trips.map((trip) => trip.id));
      const quotedIds = new Set(snapshot.messages.filter((message) => message.sequence > (state.evaluatedRevision ?? 0)).map((message) => message.envelope.quotedMessageId).filter((id): id is string => Boolean(id)));
      if (!domain.pendingInbox) throw new Error("PendingInboxUnavailable");
      const pending = (await domain.pendingInbox(snapshot, catalog)).filter((item) => item.burstId !== snapshot.id && authorizedTripIds.has(item.tripId) && (!quotedIds.size || item.messageIds?.some((id) => quotedIds.has(id))));
      const text = pending.length
        ? "🧾 *Evidencias pendientes*\n\n" + pending.slice(0, 8).map((item, index) => `${index + 1}. *${item.reference}* — ${item.status}\n   Viaje: ${tripNames.get(item.tripId) ?? item.tripName}\n   ${item.summary}\n   ${item.failureCode ? `Código: ${item.failureCode}\n   ` : ""}Revisar en la Web: ${item.href}`).join("\n\n") + (pending.length > 8 ? `\n\nHay ${pending.length - 8} evidencias más. Consultá el viaje en la Web.` : "")
        : "✅ No hay evidencias pendientes de interpretación o revisión en tus viajes autorizados.";
      state.controlIds = [...new Set([...state.controlIds, ...currentMessageIds])];
      state.evaluatedRevision = snapshot.revision;
      state.agent.queryResponses = [...(state.agent.queryResponses ?? []).filter((item) => item.revision !== snapshot.revision), { revision: snapshot.revision, response: text }];
      state.agent.terminal = { revision: snapshot.revision, response: text };
      state.agent.termination = { reason: state.question ? "asked_clarification" : "completed", revision: snapshot.revision, rounds: 0 };
      return text;
    } catch (error) {
      console.error("WhatsApp pending evidence query failed", { burstId: snapshot.id, revision: snapshot.revision, error: error instanceof Error ? error.constructor.name : "UnknownError" });
      const text = "⚠️ No pude verificar tus evidencias pendientes ahora. No hice cambios ni inicié un reprocesamiento. Probá de nuevo en unos minutos.";
      state.controlIds = [...new Set([...state.controlIds, ...currentMessageIds])];
      state.evaluatedRevision = snapshot.revision;
      state.agent.terminal = { revision: snapshot.revision, response: text };
      state.agent.termination = { reason: "completed", revision: snapshot.revision, rounds: 0, errorCode: "PENDING_EVIDENCE_QUERY_FAILED" };
      return text;
    }
  }
  const query = purePersistedCatalogQuery(snapshot);
  if (!query) return null;
  const currentMessageIds = snapshot.messages.filter((message) => message.sequence > (state.evaluatedRevision ?? 0)).map((message) => message.id);
  const tripIds = [...new Set(catalog.trips.map((trip) => trip.id))];
  const tripId = state.tripId ?? state.operationalContext?.tripId ?? (tripIds.length === 1 ? tripIds[0] : null);
  if (!tripId) return null;

  try {
    const pendingNotice = olderPendingNotice(snapshot, state);
    const [suppliers, products] = await Promise.all([
      query === "PRODUCTS" ? Promise.resolve([]) : domain.search(snapshot, "SUPPLIER", tripId, ""),
      query === "SUPPLIERS" ? Promise.resolve([]) : domain.search(snapshot, "PRODUCT", tripId, ""),
    ]);
    const catalogText = query === "PRODUCTS"
      ? `📦 *Productos guardados*\n\n${section("Productos", products, "Todavía no hay productos registrados en este viaje.")}`
      : query === "SUPPLIERS"
        ? `🏭 *Proveedores guardados*\n\n${section("Proveedores", suppliers, "Todavía no hay proveedores registrados en este viaje.")}`
        : `📋 *Información registrada*\n\n${section("Proveedores", suppliers, "Todavía no hay proveedores registrados.")}\n\n${section("Productos", products, "Todavía no hay productos registrados.")}`;
    const text = [catalogText, pendingNotice].filter(Boolean).join("\n\n");
    completeQueryGraph(snapshot, state);
    state.controlIds = [...new Set([...state.controlIds, ...currentMessageIds])];
    state.evaluatedRevision = snapshot.revision;
    state.agent.queryResponses = [...(state.agent.queryResponses ?? []).filter((item) => item.revision !== snapshot.revision), { revision: snapshot.revision, response: text }];
    state.agent.terminal = { revision: snapshot.revision, response: text };
    state.agent.termination = { reason: state.question ? "asked_clarification" : "completed", revision: snapshot.revision, rounds: 0 };
    return text;
  } catch (error) {
    console.error("WhatsApp persisted query failed", { burstId: snapshot.id, revision: snapshot.revision, query, error: error instanceof Error ? error.constructor.name : "UnknownError" });
    const target = query === "PRODUCTS" ? "tus productos" : query === "SUPPLIERS" ? "tus proveedores" : "tu información registrada";
    const text = `⚠️ *No pude verificar ${target} ahora.*\n\nNo hice cambios ni inicié un reprocesamiento. Probá de nuevo en unos minutos.`;
    completeQueryGraph(snapshot, state);
    state.controlIds = [...new Set([...state.controlIds, ...currentMessageIds])];
    state.evaluatedRevision = snapshot.revision;
    state.agent.terminal = { revision: snapshot.revision, response: text };
    state.agent.termination = { reason: state.question ? "asked_clarification" : "completed", revision: snapshot.revision, rounds: 0, errorCode: "PERSISTED_QUERY_FAILED" };
    return text;
  }
}
