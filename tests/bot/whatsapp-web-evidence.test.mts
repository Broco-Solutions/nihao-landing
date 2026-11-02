import assert from "node:assert/strict";
import test from "node:test";
import { burstBelongsToTrip, burstHasExplicitAssignment, canViewUnassignedEvidence, evidenceTravelerScope, whatsappEvidenceStatus } from "../../lib/channels/whatsapp/web-evidence.ts";
import { functionalToolErrorFinding } from "../../lib/channels/whatsapp/operational-monitor.ts";
import { processingOutcome } from "../../lib/channels/whatsapp/processing-outcome.ts";

test("la bandeja usa el viaje persistido y limita asociaciones a las empresas autorizadas", () => {
  const ops: Array<{ arguments: unknown }> = [];
  assert.equal(burstBelongsToTrip({ tripId: "trip-a", operationalContext: { tripId: "trip-a", companyId: "company-a" } }, ops, "trip-a", ["company-a"]), true);
  assert.equal(burstBelongsToTrip({ tripId: "trip-a", operationalContext: { tripId: "trip-a", companyId: "company-b" } }, ops, "trip-a", ["company-a"]), false);
  assert.equal(burstBelongsToTrip({ tripId: "trip-a", groups: [], agent: { receipts: [] } }, ops, "trip-a", []), true);
  assert.equal(burstBelongsToTrip({ tripId: "trip-b" }, ops, "trip-a", null), false);
  assert.equal(burstBelongsToTrip({}, [{ arguments: { tripId: "trip-a", companyId: "company-a" } }], "trip-a", ["company-a"]), true);
  assert.equal(burstBelongsToTrip({}, [{ arguments: { tripId: "trip-a", companyId: "company-b" } }], "trip-a", ["company-a"]), false);
  assert.equal(burstBelongsToTrip({ tripId: "trip-a", operationalContext: { tripId: "trip-a", companyId: "company-a" }, webReview: { tripId: "trip-a", companyId: "company-b" } }, [], "trip-a", ["company-a"]), false);
  assert.equal(burstBelongsToTrip({ tripId: "trip-a", operationalContext: { tripId: "trip-a", companyId: "company-a" }, webReview: { tripId: "trip-b", companyId: "company-a" } }, [], "trip-a", ["company-a"]), false);
});

test("los lotes sin empresa se muestran como evidencia pendiente, sin inferir proveedor", () => {
  assert.equal(burstBelongsToTrip({ tripId: "trip-a", operationalContext: { tripId: "trip-a" }, loadContexts: {} }, [], "trip-a", ["company-a"]), true);
  assert.equal(burstBelongsToTrip({ tripId: "trip-a", operationalContext: { tripId: "trip-a", companyId: "company-other" } }, [], "trip-a", ["company-a"]), false);
});

test("la evidencia todavía sin viaje aparece para revisión en el ámbito del viajero", () => {
  const state = { tripId: null, groups: [] };
  assert.equal(burstBelongsToTrip(state, [], "trip-a", ["company-a"]), true);
  assert.equal(burstBelongsToTrip(state, [], "trip-b", []), true);
  assert.equal(burstHasExplicitAssignment(state, []), false);
  assert.equal(canViewUnassignedEvidence("TRAVELER", "owner", "owner"), true);
  assert.equal(canViewUnassignedEvidence("ADMIN", "admin", "owner"), false);
  assert.equal(canViewUnassignedEvidence("TRAVELER", "other", "owner"), false);
  assert.equal(burstBelongsToTrip({ tripId: null, operationalContext: { companyId: "company-b" } }, [], "trip-a", ["company-a"]), false);
  assert.equal(burstBelongsToTrip({ tripId: null, operationalContext: { tripId: "trip-b" } }, [], "trip-a", ["company-a"]), false);
});

test("el filtro de actividad por viajero sólo amplía alcance para ADMIN del viaje", () => {
  assert.deepEqual(evidenceTravelerScope("ADMIN", "admin", ["traveler-a", "traveler-b"]), ["traveler-a", "traveler-b"]);
  assert.deepEqual(evidenceTravelerScope("ADMIN", "admin", ["traveler-a", "traveler-b"], "traveler-b"), ["traveler-b"]);
  assert.deepEqual(evidenceTravelerScope("TRAVELER", "traveler-a", [], "traveler-a"), ["traveler-a"]);
  assert.throws(() => evidenceTravelerScope("ADMIN", "admin", ["traveler-a"], "outsider"), /no pertenece/u);
  assert.throws(() => evidenceTravelerScope("TRAVELER", "traveler-a", [], "traveler-b"), /otro viajero/u);
});

function reconciledCandidate(): Parameters<typeof whatsappEvidenceStatus>[0] {
  const termination = { reason: "tool_error", revision: 3, failedTool: "ask_clarification", errorCode: "UNGROUNDED_NAME" };
  return {
    id: "review", status: "WAITING", createdAt: new Date("2026-11-01T06:00:00Z"), processingFinishedAt: null, lastErrorAt: null,
    state: {
      ingestion: { loads: [{ status: "NEEDS_REVIEW" }], summary: { needsReview: 1, pending: 0, failed: 0 } },
      agent: { termination, pending: { terminalFailure: true }, functionalRemediation: {
        status: "RESOLVED", resolution: "MANUAL_REVIEW", release: "9d3012cb502fea4b879c20a4358a3818d1c145aa", actor: "ops:authorized-review", resolvedAt: "2026-11-02T14:19:00Z",
        termination: { revision: 3, failedTool: "ask_clarification", errorCode: "UNGROUNDED_NAME" },
      } },
    },
    operations: [], replies: [{ status: "READ" }],
    messages: [{ id: "source", envelope: { type: "TEXT", text: "MOQ 300 unidades" }, reading: null, storageStatus: "NOT_REQUIRED", commercialDecisions: [] }],
  };
}

test("la Web muestra una conciliación técnica válida como revisión humana, sin afirmar aplicación comercial", () => {
  const candidate = reconciledCandidate();
  const outcome = processingOutcome(candidate.state as Parameters<typeof processingOutcome>[0]);
  assert.equal(functionalToolErrorFinding(candidate, new Date()), null);
  assert.deepEqual(whatsappEvidenceStatus(candidate, outcome), { code: "human", label: "Pendiente de revisión" });
  assert.equal(outcome.commercialStatus, "REVIEW_REQUIRED");
  assert.equal(outcome.productWrites, 0);
});

test("una marca de conciliación no oculta revisión distinta, fuentes inseguras, entrega pendiente ni trabajo activo", () => {
  const mutations = [
    (c: ReturnType<typeof reconciledCandidate>) => { (c.state as { agent: { termination: { revision: number } } }).agent.termination.revision++; },
    (c: ReturnType<typeof reconciledCandidate>) => { (c.state as { agent: { functionalRemediation: { actor: string } } }).agent.functionalRemediation.actor = ""; },
    (c: ReturnType<typeof reconciledCandidate>) => { c.messages![0].envelope = { type: "IMAGE" }; c.messages![0].storageStatus = "PENDING_STORAGE"; },
    (c: ReturnType<typeof reconciledCandidate>) => { c.replies.push({ status: "DELIVERY_UNKNOWN" }); },
    (c: ReturnType<typeof reconciledCandidate>) => { c.operations.push({ status: "WRITTEN" }); },
    (c: ReturnType<typeof reconciledCandidate>) => { (c.state as { ingestion: { loads: Array<{ status: string }> } }).ingestion.loads[0].status = "GROUPED"; },
  ];
  for (const mutate of mutations) {
    const candidate = reconciledCandidate(); mutate(candidate);
    assert.equal(functionalToolErrorFinding(candidate, new Date())?.severity, "CRITICAL");
    assert.equal(whatsappEvidenceStatus(candidate, processingOutcome(candidate.state as Parameters<typeof processingOutcome>[0])).code, "error");
  }
});

test("FAILED conserva el error visible aunque incluya metadatos de conciliación", () => {
  const candidate = reconciledCandidate(); candidate.status = "FAILED";
  assert.deepEqual(whatsappEvidenceStatus(candidate, processingOutcome(candidate.state as Parameters<typeof processingOutcome>[0])), { code: "error", label: "Error de procesamiento" });
});
