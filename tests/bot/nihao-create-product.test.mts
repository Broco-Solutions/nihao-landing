import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createProduct, type CreateProductCommand, type ProductCreationPolicy } from "../../lib/nihao/operations/create-product.ts";
import { AuthorizationError } from "../../lib/bot/authorization.ts";
import { CaptureConflictError } from "../../lib/bot/persistence/repository.ts";
import { ValidationError } from "../../lib/bot/validation.ts";
import { reconcileSupplierConfirmation } from "../../lib/bot/persistence/supplier-confirmation.ts";
import { createAgentEnvironment, localAgentDatabase } from "../../evals/whatsapp-agent/environment.ts";

test("PostgreSQL: shared product creation preserves access, status and atomic recovery", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async t => {
  const db = localAgentDatabase();
  const env = await createAgentEnvironment(db, { trips: [{ id: "trip", name: "Product operations", companies: [{ id: "company", name: "Broco" }, { id: "other", name: "Other" }], suppliers: [{ id: "supplier", captureId: "capture", name: "Dragon", city: "Foshan", companyId: "company" }, { id: "other-supplier", captureId: "other-capture", name: "Sunrise", city: "Ningbo", companyId: "other" }] }] });
  const context = { userId: env.userId, tripId: env.id("trip"), companyId: env.id("company") };
  const web: ProductCreationPolicy = { access: "web", confirmation: "immediate" };
  const automation: ProductCreationPolicy = { access: "automation", confirmation: "after-evidence" };
  const command = (fields: unknown = { name: "Silla" }): CreateProductCommand => ({ captureId: env.id("capture"), fields });
  const create = (input = command(), policy = web) => db.$transaction(tx => createProduct(tx, context, input, policy));
  try {
    await t.test("web derives supplier and validates all commercial fields and notes", async () => {
      const p = await create(command({ name: " Silla DF-18 ", notes: "Pedir muestra negra.", fob: { amount: 18, currency: "USD", unit: "unidad", rawText: "USD 18 por unidad" }, moq: { quantity: 200, unit: "unidades", notes: null, rawText: "200 unidades" }, leadTime: { days: 30, rawText: "30 días" } }));
      assert.equal(p.supplierId, env.id("supplier")); assert.equal(p.status, "CONFIRMED"); assert.equal(p.name, "Silla DF-18"); assert.equal(Number(p.fobAmount), 18); assert.equal(p.fobCurrency, "USD"); assert.equal(p.moqQuantity, 200); assert.equal(p.leadTimeDays, 30); assert.equal(p.notes, "Pedir muestra negra."); assert.deepEqual(p.images, []);
    });
    await t.test("missing commercial data remains null and payload cannot choose target/status", async () => {
      const p = await create(command({ name: "Vaso", captureId: env.id("other-capture"), supplierId: env.id("other-supplier"), status: "DRAFT", access: "automation" }));
      assert.equal(p.captureId, env.id("capture")); assert.equal(p.supplierId, env.id("supplier")); assert.equal(p.status, "CONFIRMED"); assert.equal(p.fobAmount, null); assert.equal(p.fobCurrency, null); assert.equal(p.moqQuantity, null); assert.equal(p.leadTimeDays, null);
      const unknown = await create(command({ name: "Producto sin nombre" })); assert.equal(unknown.status, "DRAFT");
      await assert.rejects(create(command({ name: "" })), ValidationError);
      await assert.rejects(create(command({ name: "Vaso", fob: { amount: -1 } })), ValidationError);
    });
    await t.test("automation stays draft until evidence completion and preserves trace", async () => {
      const p = await create({ ...command(), supplierId: env.id("supplier"), trace: { sourceText: "Foto de silla", sourceEvidence: [{ messageId: "synthetic-image", role: "FACTS" }], reviewFields: ["fob"], sourceConflicts: [] } }, automation);
      assert.equal(p.status, "DRAFT"); assert.equal(p.sourceText, "Foto de silla"); assert.deepEqual(p.sourceEvidence, [{ messageId: "synthetic-image", role: "FACTS" }]); assert.deepEqual(p.reviewFields, ["fob"]);
    });
    await t.test("incomplete supplier accepts named product and promotion keeps its status", async () => {
      const capture = await db.supplierCapture.create({ data: { tripId: context.tripId, companyId: context.companyId, createdById: env.userId, sourceType: "TEXT", status: "DRAFT", companyName: "New Supplier", missingFields: [], reviewFields: [], acknowledgedUnknownFields: [], evidence: [] } });
      const p = await create({ captureId: capture.id, supplierId: null, fields: { name: "Mesa" } }, { ...automation, confirmation: "immediate" });
      assert.equal(p.supplierId, null); assert.equal(p.status, "CONFIRMED");
      await db.supplierCapture.update({ where: { id: capture.id }, data: { contact: "sales@example.test" } });
      const promoted = await db.$transaction(tx => reconcileSupplierConfirmation(tx, capture.id));
      const saved = await db.supplierProduct.findUniqueOrThrow({ where: { id: p.id } });
      assert.equal(saved.supplierId, promoted.id); assert.equal(saved.status, "CONFIRMED");
    });
    await t.test("unauthorized company/destination cannot receive products", async () => {
      await assert.rejects(create({ ...command(), supplierId: env.id("other-supplier") }), AuthorizationError);
      await assert.rejects(create({ ...command(), captureId: env.id("other-capture") }), AuthorizationError);
      await assert.rejects(db.$transaction(tx => createProduct(tx, { ...context, userId: "no-membership" }, command(), web)), AuthorizationError);
      await db.tripCompanyMember.delete({ where: { companyId_userId: { userId: env.userId, companyId: context.companyId } } });
      try { await assert.rejects(create(command(), automation), AuthorizationError); } finally {
        await db.tripCompanyMember.create({ data: { userId: env.userId, companyId: context.companyId } });
      }
    });
    await t.test("automation revalidates active trip/company but web retains admin policy", async () => {
      await db.tripCompany.update({ where: { id: context.companyId }, data: { active: false } });
      try { await assert.rejects(create(command(), automation), AuthorizationError); await create(); } finally { await db.tripCompany.update({ where: { id: context.companyId }, data: { active: true } }); }
      await db.trip.update({ where: { id: context.tripId }, data: { status: "ARCHIVED" } });
      try { await assert.rejects(create(command(), automation), AuthorizationError); await create(); } finally { await db.trip.update({ where: { id: context.tripId }, data: { status: "ACTIVE" } }); }
      await db.tripMember.update({ where: { tripId_userId: { tripId: context.tripId, userId: env.userId } }, data: { role: "ADMIN" } });
      try { await assert.rejects(create(command(), automation), AuthorizationError); await create(); } finally { await db.tripMember.update({ where: { tripId_userId: { tripId: context.tripId, userId: env.userId } }, data: { role: "TRAVELER" } }); }
    });
    await t.test("deleted capture rejects both adapters", async () => {
      await db.supplierCapture.update({ where: { id: env.id("capture") }, data: { deletedAt: new Date() } });
      try { await assert.rejects(create(), CaptureConflictError); await assert.rejects(create(command(), automation), CaptureConflictError); } finally { await db.supplierCapture.update({ where: { id: env.id("capture") }, data: { deletedAt: null } }); }
    });
    await t.test("retry after commit preserves the row and concurrent retries create once", async () => {
      const id = randomUUID(), input = { ...command(), id };
      const results = await Promise.all(Array.from({ length: 4 }, () => create(input)));
      assert.ok(results.every(p => p.id === id)); assert.equal(await db.supplierProduct.count({ where: { id } }), 1);
      await db.supplierProduct.update({ where: { id }, data: { notes: "Updated later" } });
      assert.equal((await create(input)).notes, "Updated later");
      await assert.rejects(db.$transaction(tx => createProduct(tx, { ...context, companyId: env.id("other") }, { ...input, captureId: env.id("other-capture") }, web)), CaptureConflictError);
    });
    await t.test("failure recording receipt rolls back product creation in caller transaction", async () => {
      const id = randomUUID();
      await assert.rejects(db.$transaction(async tx => { await createProduct(tx, context, { ...command(), id }, automation); throw new Error("receipt write interrupted"); }), /receipt write interrupted/);
      assert.equal(await db.supplierProduct.count({ where: { id } }), 0);
      assert.equal((await create({ ...command(), id }, automation)).id, id);
    });
  } finally { await env.cleanup(); await db.$disconnect(); }
});
