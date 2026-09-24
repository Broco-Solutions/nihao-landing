import assert from "node:assert/strict";
import test from "node:test";
import { SupplierExtractionService } from "../../lib/bot/extraction/service.ts";
import type { ExtractionInput, ExtractionProvider } from "../../lib/bot/extraction/contract.ts";
import type { ExtractionCandidate, SupplierCaptureRecord } from "../../lib/bot/types.ts";
import { formatWhatsAppCaptureReply } from "../../lib/channels/whatsapp/capture-formatter.ts";
import { resolveWhatsAppIdentity } from "../../lib/channels/whatsapp/identity.ts";
import { WhatsAppCaptureService, whatsappCaptureId } from "../../lib/channels/whatsapp/whatsapp-capture-service.ts";
import { normalizeWhatsAppPhone } from "../../lib/bot/whatsapp-phone.ts";
import { ValidationError } from "../../lib/bot/validation.ts";
import { AuthorizationError } from "../../lib/bot/authorization.ts";
import { PrismaTripWhatsAppRepository } from "../../lib/bot/persistence/prisma-trip-whatsapp-repository.ts";

const emptyFields = { companyName: null, city: null, province: null, contact: null, category: null, supplierType: "UNKNOWN" as const, fob: null, moq: null, leadTime: null, interestScore: null };
function record(id = "wa_capture", userId = "user-a", tripId = "trip-a"): SupplierCaptureRecord { return { id, userId, tripId, supplierId: null, status: "DRAFT", source: { type: "TEXT", text: "Proveedor ABC FOB USD 4.20 MOQ 500" }, fields: { ...emptyFields, companyName: "Guangzhou ABC", fob: { amount: 4.2, currency: "USD", unit: "unidad", rawText: "USD 4.20/unidad" }, moq: { quantity: 500, unit: "unidades", notes: null, rawText: "500 unidades" } }, missingFields: ["category"], reviewFields: ["supplierType"], acknowledgedUnknownFields: [], evidence: [], humanCorrectedFields: [], analyzedAttachmentIds: [], needsReanalysis: false, createdAt: "2026-01-01", updatedAt: "2026-01-01", confirmedAt: null }; }

test("normaliza WhatsApp sin inferir el código de país", () => {
  assert.equal(normalizeWhatsAppPhone("+54 (934) 123-45678"), "5493412345678");
  assert.equal(normalizeWhatsAppPhone("3412345678"), "3412345678", "el helper no agrega ni infiere prefijos");
  assert.throws(() => normalizeWhatsAppPhone("+54 abc"), ValidationError);
});

test("el binding sólo permite actualizar el WhatsApp del propio TripMember", async () => {
  const members = new Map([["trip-a:user-a", { whatsappPhone: null as string | null }]]);
  const repository = new PrismaTripWhatsAppRepository({ tripMember: {
    async findUnique({ where }: { where: { tripId_userId: { tripId: string; userId: string } } }) { return members.get(`${where.tripId_userId.tripId}:${where.tripId_userId.userId}`) ?? null; },
    async update({ where, data }: { where: { tripId_userId: { tripId: string; userId: string } }; data: { whatsappPhone: string | null } }) { const member = members.get(`${where.tripId_userId.tripId}:${where.tripId_userId.userId}`)!; member.whatsappPhone = data.whatsappPhone; return member; },
  } } as never);
  assert.deepEqual(await repository.updateForMember("user-a", "trip-a", "+54 934 123-45678"), { tripId: "trip-a", whatsappPhone: "5493412345678" });
  await assert.rejects(repository.updateForMember("user-b", "trip-a", "5493412345678"), AuthorizationError);
});

test("resuelve ACTIVE y hace fallback a un único PLANNED", async () => {
  const repository = { async findByWhatsAppPhone() { return [{ userId: "u-active", tripId: "active", trip: { status: "ACTIVE" as const } }, { userId: "u-plan", tripId: "plan", trip: { status: "PLANNED" as const } }]; } };
  assert.deepEqual(await resolveWhatsAppIdentity("5493412345678", repository), { kind: "resolved", identity: { userId: "u-active", tripId: "active", phone: "5493412345678" } });
  assert.deepEqual(await resolveWhatsAppIdentity("5493412345678", { async findByWhatsAppPhone() { return [{ userId: "u-plan", tripId: "plan", trip: { status: "PLANNED" as const } }]; } }), { kind: "resolved", identity: { userId: "u-plan", tripId: "plan", phone: "5493412345678" } });
});

test("número sin membresía y viajes ambiguos no se resuelven", async () => {
  assert.deepEqual(await resolveWhatsAppIdentity("5493412345678", { async findByWhatsAppPhone() { return []; } }), { kind: "unlinked" });
  assert.deepEqual(await resolveWhatsAppIdentity("5493412345678", { async findByWhatsAppPhone() { return [{ userId: "u1", tripId: "a", trip: { status: "ACTIVE" as const } }, { userId: "u2", tripId: "b", trip: { status: "ACTIVE" as const } }]; } }), { kind: "ambiguous" });
});

class Provider implements ExtractionProvider { readonly name = "mock"; calls = 0; fail = false; supports() { return true; } async extract(input: ExtractionInput): Promise<ExtractionCandidate> { this.calls++; if (this.fail) throw new Error("Mistral unavailable"); return { rawSource: input.source, extractedFields: record().fields, reviewFields: ["supplierType"], evidence: [] }; } }

function setup(candidates = [{ userId: "user-a", tripId: "trip-a", trip: { status: "ACTIVE" as const } }]) {
  const captures = new Map<string, SupplierCaptureRecord>(); const provider = new Provider();
  const repository = { async hasTripAccess() { return true; }, async getCapture(_context: unknown, id: string) { return captures.get(id) ?? null; }, async createDraft(input: { clientCaptureId?: string; userId: string; tripId: string; extraction: { extractedFields: SupplierCaptureRecord["fields"] } }) { const item = record(input.clientCaptureId, input.userId, input.tripId); item.fields = input.extraction.extractedFields; captures.set(item.id, item); return item; }, async replaceExtraction() { throw new Error("not used"); }, async correctField() { throw new Error("not used"); }, async confirm() { throw new Error("not used"); }, async listCaptures() { return []; } } as unknown as import("../../lib/bot/persistence/repository.ts").SupplierCaptureRepository & import("../../lib/bot/persistence/repository.ts").TripAccessRepository;
  return { provider, captures, service: new WhatsAppCaptureService({ identities: { async findByWhatsAppPhone() { return candidates; } }, captures: repository, extraction: new SupplierExtractionService([provider]) }) };
}

test("texto crea DRAFT con user/trip resueltos y nunca confirma", async () => {
  const fixture = setup(); const result = await fixture.service.capture({ instance: "nihao", messageId: "msg-1", phone: "5493412345678", text: "Proveedor ABC" });
  assert.equal(result.kind, "captured"); const item = fixture.captures.get(whatsappCaptureId("nihao", "msg-1"))!;
  assert.equal(item.userId, "user-a"); assert.equal(item.tripId, "trip-a"); assert.equal(item.status, "DRAFT"); assert.equal(item.confirmedAt, null);
});

test("mismo message id no duplica ni vuelve a extraer", async () => {
  const fixture = setup(); const input = { instance: "nihao", messageId: "same", phone: "5493412345678", text: "Proveedor ABC" };
  await fixture.service.capture(input); await fixture.service.capture(input);
  assert.equal(fixture.captures.size, 1); assert.equal(fixture.provider.calls, 1);
});

test("formatter sólo muestra los campos existentes", () => {
  const reply = formatWhatsAppCaptureReply(record()); assert.match(reply, /Guangzhou ABC/); assert.match(reply, /FOB/); assert.doesNotMatch(reply, /Provincia/); assert.match(reply, /pendiente de revisión/);
});

test("error de extracción devuelve respuesta estable", async () => {
  const fixture = setup(); fixture.provider.fail = true; const result = await fixture.service.capture({ instance: "nihao", messageId: "broken", phone: "5493412345678", text: "Proveedor ABC" });
  assert.deepEqual(result, { kind: "failed", text: "No pude analizar ese mensaje. Probá nuevamente en unos segundos." });
});
