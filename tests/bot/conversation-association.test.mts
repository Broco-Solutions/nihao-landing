import assert from "node:assert/strict";
import test from "node:test";
import { resolveConversationSupplier } from "../../lib/channels/whatsapp/conversation-association.ts";
import type { BurstSnapshot } from "../../lib/channels/whatsapp/burst-types.ts";
const snapshot: BurstSnapshot = { id: "burst", instance: "test", phone: "phone", userId: "user", revision: 4, status: "PROCESSING", leaseId: "lease", state: { tripId: "trip", groups: [], question: null, pendingRefs: [], controlIds: [], operationalContext: { tripId: "trip", companyId: "company" } }, messages: ["a", "b", "product", "next"].map((id, index) => ({ id, sequence: index + 1, sentAt: null, reading: null, envelope: { type: "TEXT", text: "", instance: "test", phone: "phone", messageId: id, media: null, sentAt: null } })) };
const refs = [{ id: "alpha", name: "Alfa Tools", messageIds: ["a"], tripId: "trip", companyId: "company" }, { id: "beta", name: "Beta Tools", messageIds: ["b"], tripId: "trip", companyId: "company" }];
test("nombre y ordinal prevalecen sobre proximidad; este proveedor resuelve al anterior", () => {
  assert.equal(resolveConversationSupplier(snapshot, "product", "Alfa Tools vende Taladro", refs).id, "alpha");
  assert.equal(resolveConversationSupplier(snapshot, "product", "El primer proveedor nos vende taladros", refs).id, "alpha");
  assert.equal(resolveConversationSupplier(snapshot, "product", "El segundo proveedor", refs).id, "beta");
  assert.equal(resolveConversationSupplier(snapshot, "product", "Este proveedor nos vende taladros", refs).id, "beta");
  assert.equal(resolveConversationSupplier(snapshot, "product", "Taladro FOB USD 7", refs).id, "beta");
});
test("productos consecutivos transmiten su asociación y referencias explícitas desconocidas no usan fallback", () => {
  assert.equal(resolveConversationSupplier(snapshot, "next", "Martillo FOB USD 3", [{ ...refs[0], messageIds: ["a", "product"] }, refs[1]]).id, "alpha");
  assert.equal(resolveConversationSupplier(snapshot, "product", "El tercer proveedor", refs).ambiguous, true);
  assert.equal(resolveConversationSupplier(snapshot, "product", "Del proveedor Gamma Tools", refs).ambiguous, true);
});
test("quote, falta de anterior, permisos de contexto y mensajes posteriores", () => {
  const quoted = structuredClone(snapshot); quoted.messages[2].envelope.quotedMessageId = "a";
  assert.equal(resolveConversationSupplier(quoted, "product", "Taladro FOB USD 7", refs).id, "alpha");
  assert.equal(resolveConversationSupplier(snapshot, "a", "Taladro", refs).id, undefined);
  assert.equal(resolveConversationSupplier(snapshot, "product", "Taladro", refs.map((ref) => ({ ...ref, companyId: "other" }))).id, undefined);
  assert.equal(resolveConversationSupplier(snapshot, "b", "Taladro", refs).id, "alpha");
});
