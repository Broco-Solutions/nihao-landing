import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_TIER_1_DATA } from "../../lib/bot/types.ts";
import { needsCaptureReview } from "../../lib/bot/capture-review.ts";
import { PrismaSupplierCaptureRepository } from "../../lib/bot/persistence/prisma-repository.ts";

function fixture() {
  const now = new Date();
  const supplier = { id: "supplier", captureId: "capture", tripId: "trip", companyId: "company", createdById: "user", companyName: "Nombre anterior", category: "Hogar", pendingFields: [], createdAt: now, updatedAt: now };
  let capture: Record<string, unknown> = {
    id: "capture", tripId: "trip", companyId: "company", createdById: "user", status: "CONFIRMED", sourceType: "TEXT", sourceText: "Proveedor", sourceAttachmentId: null,
    companyName: "Nombre actualizado", city: null, province: null, contact: "ventas@example.com", category: "Hogar", supplierType: "UNKNOWN", website: null, notes: null, contactMethods: [],
    fobAmount: null, fobCurrency: null, fobUnit: null, fobRawText: null, moqQuantity: null, moqUnit: null, moqNotes: null, moqRawText: null, leadTimeRawText: null, leadTimeDays: null, interestScore: null,
    missingFields: [], reviewFields: ["companyName"], acknowledgedUnknownFields: [], humanCorrectedFields: [], evidence: [], analyzedAttachmentIds: [], needsReanalysis: false, deletedAt: null, confirmedAt: now, createdAt: now, updatedAt: now, supplier,
  };
  let creates = 0; let updates = 0;
  const prisma = {
    $transaction: async (work: (tx: unknown) => Promise<unknown>): Promise<unknown> => work(prisma),
    tripMember: { findUnique: async () => ({ role: "ADMIN" }) },
    tripCompany: { findFirst: async () => ({ id: "company" }) },
    $queryRaw: async () => [],
    supplierCapture: {
      findFirst: async () => capture,
      update: async ({ data }: { data: Record<string, unknown> }) => (capture = { ...capture, ...data }),
    },
    supplier: {
      create: async () => { creates++; throw new Error("No debe duplicar el proveedor"); },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => { updates++; assert.equal(where.id, "supplier"); Object.assign(supplier, data); return supplier; },
    },
    supplierProduct: { updateMany: async () => ({ count: 0 }), deleteMany: async () => ({ count: 0 }), upsert: async () => ({}) },
  };
  return { repository: new PrismaSupplierCaptureRepository(prisma as never), get capture() { return capture; }, get creates() { return creates; }, get updates() { return updates; } };
}
const context = { userId: "user", tripId: "trip" };

test("reconfirmar actualiza el mismo proveedor, limpia la revisión y es idempotente", async () => {
  const f = fixture();
  const result = await f.repository.confirm(context, "capture");
  assert.equal(result.supplier.id, "supplier");
  assert.equal(result.supplier.companyName, "Nombre actualizado");
  assert.deepEqual(result.capture.reviewFields, []);
  assert.equal(result.capture.status, "CONFIRMED");
  await f.repository.confirm(context, "capture");
  assert.equal(f.creates, 0);
  assert.equal(f.updates, 1);
});

test("reconfirmar bloquea evidencia sin analizar y capturas eliminadas", async () => {
  const f = fixture();
  f.capture.needsReanalysis = true;
  await assert.rejects(() => f.repository.confirm(context, "capture"), /Analizá/);
  assert.equal(f.updates, 0);
  f.capture.deletedAt = new Date();
  await assert.rejects(() => f.repository.confirm(context, "capture"), /eliminado/);
});

test("corregir un proveedor confirmado lo deja pendiente hasta reconfirmar", async () => {
  const f = fixture();
  const corrected = await f.repository.correctField({ ...context, captureId: "capture", field: "companyName", value: "Corregido", acknowledgedUnknown: false });
  assert.equal(corrected.status, "DRAFT");
  assert.equal(f.updates, 0);
  const result = await f.repository.confirm(context, "capture");
  assert.equal(result.supplier.id, "supplier");
  assert.equal(result.supplier.companyName, "Corregido");
  assert.equal(f.creates, 0);
});

test("reanálisis de un proveedor guardado conserva su identidad y exige reconfirmación incluso sin conflictos", async () => {
  const f = fixture();
  f.capture.needsReanalysis = true;
  const analyzed = await f.repository.replaceExtraction(context, "capture", {
    rawSource: { type: "TEXT", text: "Proveedor actualizado" },
    extractedFields: { ...EMPTY_TIER_1_DATA, companyName: "Proveedor actualizado", category: "Hogar", contact: "ventas@example.com" },
    missingFields: [], reviewFields: [], evidence: [],
  });
  assert.equal(analyzed.needsReanalysis, false);
  assert.equal(analyzed.supplierId, "supplier");
  assert.equal(needsCaptureReview(analyzed), true);
  const result = await f.repository.confirm(context, "capture");
  assert.equal(result.supplier.companyName, "Proveedor actualizado");
  assert.equal(needsCaptureReview(result.capture), false);
  assert.equal(f.creates, 0);
});
