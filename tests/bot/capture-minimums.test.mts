import assert from "node:assert/strict";
import test from "node:test";
import { isProductConfirmable, isSupplierConfirmable, deriveProductStatus } from "../../lib/bot/record-completeness.ts";
import { canConfirmCapture } from "../../lib/bot/tier1.ts";
import { EMPTY_TIER_1_DATA, type SupplierCaptureRecord } from "../../lib/bot/types.ts";
import { autoConfirmWebCapture } from "../../lib/bot/persistence/auto-confirmation.ts";
import { createAgentEnvironment, localAgentDatabase } from "../../evals/whatsapp-agent/environment.ts";

test("mínimos compartidos aceptan proveedor sin categoría y producto sin imagen/proveedor", () => {
  const supplier = { fields: { ...EMPTY_TIER_1_DATA, companyName: "Alfa", contact: "ventas@alfa.test" }, contactMethods: [], acknowledgedUnknownFields: [] } as unknown as SupplierCaptureRecord;
  assert.equal(canConfirmCapture(supplier), true);
  assert.equal(canConfirmCapture({ ...supplier, fields: { ...supplier.fields, contact: null, category: "Hogar" } }), false);
  assert.equal(isSupplierConfirmable({ name: "Alfa", contacts: [{ type: "WECHAT", rawText: "alfa_tools" }] }), true);
  for (const amount of [0, 7, "7.0000"]) assert.equal(isProductConfirmable({ name: "Taladro", fobAmount: amount, fobCurrency: "USD" }), true);
  for (const amount of [null, undefined, -1, NaN, Infinity]) assert.equal(isProductConfirmable({ name: "Taladro", fobAmount: amount, fobCurrency: "USD" }), false);
  assert.equal(isProductConfirmable({ name: "Taladro", fobAmount: 7 }), false);
  assert.equal(isProductConfirmable({ name: "Producto sin nombre", fobAmount: 7, fobCurrency: "USD" }), false);
});

test("web PostgreSQL: proveedor se promueve con nombre/contacto y producto independiente queda confirmado", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async () => {
  const prisma = localAgentDatabase();
  const env = await createAgentEnvironment(prisma, { trips: [{ id: "trip", name: "China", companies: [{ id: "company", name: "Broco" }], suppliers: [] }] });
  try {
    const context = { userId: env.userId, tripId: env.id("trip") };
    const draft = await prisma.supplierCapture.create({ data: { id: env.id("draft"), tripId: context.tripId, companyId: env.id("company"), createdById: env.userId, sourceType: "TEXT", companyName: "Alfa", category: null, missingFields: ["category", "contact"], reviewFields: [], acknowledgedUnknownFields: [], evidence: [] } });
    assert.equal((await autoConfirmWebCapture(prisma, context, draft.id))!.status, "DRAFT");
    const product = await prisma.supplierProduct.create({ data: { captureId: draft.id, supplierId: null, name: "Taladro", fobAmount: 7, fobCurrency: "USD", status: deriveProductStatus({ status: "DRAFT", name: "Taladro", fobAmount: 7, fobCurrency: "USD" }) } });
    assert.equal(product.status, "CONFIRMED");
    assert.equal(product.supplierId, null);
    await prisma.supplierCapture.update({ where: { id: draft.id }, data: { contactMethods: [{ type: "EMAIL", rawText: "ventas@alfa.test" }] } });
    const confirmed = await autoConfirmWebCapture(prisma, context, draft.id);
    assert.equal(confirmed!.status, "CONFIRMED");
    assert.ok(confirmed!.supplierId);
    assert.equal((await autoConfirmWebCapture(prisma, context, draft.id))!.supplierId, confirmed!.supplierId);
    assert.equal(await prisma.supplier.count({ where: { captureId: draft.id } }), 1);
    assert.equal((await prisma.supplierProduct.findUniqueOrThrow({ where: { id: product.id } })).supplierId, confirmed!.supplierId);
  } finally { await env.cleanup(); await prisma.$disconnect(); }
});
