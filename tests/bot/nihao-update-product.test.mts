import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createProduct } from "../../lib/nihao/operations/create-product.ts";
import { updateProduct } from "../../lib/nihao/operations/update-product.ts";
import { AuthorizationError } from "../../lib/bot/authorization.ts";
import { CaptureConflictError, CaptureNotFoundError } from "../../lib/bot/persistence/repository.ts";
import { ValidationError } from "../../lib/bot/validation.ts";
import { createAgentEnvironment, localAgentDatabase } from "../../evals/whatsapp-agent/environment.ts";

// Direct business operations only: no model, orchestrator or conversational replay.
test("PostgreSQL: shared product updates preserve patches, access and transactions", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async t => {
  const db = localAgentDatabase();
  const env = await createAgentEnvironment(db, { trips: [{ id: "trip", name: "Update operations", companies: [{ id: "company", name: "Broco" }, { id: "other", name: "Other" }], suppliers: [{ id: "supplier", captureId: "capture", name: "Dragon", city: "Foshan", companyId: "company" }, { id: "other-supplier", captureId: "other-capture", name: "Sunrise", city: "Ningbo", companyId: "other" }] }] });
  const context = { userId: env.userId, tripId: env.id("trip"), companyId: env.id("company") };
  const captureId = env.id("capture");
  const fresh = () => db.$transaction(tx => createProduct(tx, context, { captureId, fields: { name: "Silla", notes: "Nota inicial.", fob: { amount: 18, currency: "USD", unit: "unidad", rawText: "USD 18 por unidad" }, moq: { quantity: 200, unit: "unidades", notes: null, rawText: "200 unidades" }, leadTime: { days: 30, rawText: "30 días" } } }, { access: "web", confirmation: "immediate" }));
  const update = (productId: string, patch: unknown, access: "web" | "automation" = "web", expectedVersion?: string) => db.$transaction(tx => updateProduct(tx, context, { captureId, productId, patch, expectedVersion }, access));
  try {
    await t.test("price patch preserves currency/unit/MOQ/plazo, notes and confirmed state", async () => {
      const p = await fresh(), saved = await update(p.id, { fob: { amount: 20 } }, "automation", p.updatedAt.toISOString());
      assert.equal(Number(saved.fobAmount), 20); assert.equal(saved.fobCurrency, "USD"); assert.equal(saved.fobUnit, "unidad"); assert.equal(saved.moqQuantity, 200); assert.equal(saved.leadTimeDays, 30); assert.equal(saved.notes, "Nota inicial."); assert.equal(saved.status, "CONFIRMED");
      assert.equal((await update(p.id, { status: "DRAFT" })).status, "CONFIRMED");
    });
    await t.test("notes append, deduplicate, replace and clear explicitly", async () => {
      const p = await fresh();
      assert.equal((await update(p.id, { notes: "Pedir muestra." })).notes, "Nota inicial.\nPedir muestra.");
      assert.equal((await update(p.id, { notes: "Pedir muestra." })).notes, "Nota inicial.\nPedir muestra.");
      assert.equal((await update(p.id, { notes: "Nota corregida.", notesMode: "replace" })).notes, "Nota corregida.");
      assert.equal((await update(p.id, { leadTime: { days: 40 } })).notes, "Nota corregida.");
      assert.equal((await update(p.id, { notes: null, notesMode: "replace" })).notes, null);
      assert.equal((await update(p.id, { fob: null })).fobAmount, null);
    });
    await t.test("web confirmation checks reanalysis and only explicit confirmation clears review", async () => {
      const p = await fresh();
      await db.supplierProduct.update({ where: { id: p.id }, data: { reviewFields: ["fob"] } });
      await db.supplierCapture.update({ where: { id: captureId }, data: { needsReanalysis: true } });
      try {
        await assert.rejects(update(p.id, { confirm: true }), /Analizá la nueva evidencia/);
        assert.deepEqual((await update(p.id, { leadTime: { days: 45 } })).reviewFields, ["fob"]);
      } finally { await db.supplierCapture.update({ where: { id: captureId }, data: { needsReanalysis: false } }); }
      assert.deepEqual((await update(p.id, { confirm: true })).reviewFields, []);
    });
    await t.test("rejects another capture, unauthorized company and deleted capture", async () => {
      const p = await fresh();
      await assert.rejects(db.$transaction(tx => updateProduct(tx, context, { captureId: env.id("other-capture"), productId: p.id, patch: { name: "Wrong" } }, "web")), AuthorizationError);
      await assert.rejects(update(randomUUID(), { name: "Missing" }), CaptureNotFoundError);
      await db.supplierCapture.update({ where: { id: captureId }, data: { deletedAt: new Date() } });
      try { await assert.rejects(update(p.id, { name: "Wrong" }), CaptureConflictError); } finally { await db.supplierCapture.update({ where: { id: captureId }, data: { deletedAt: null } }); }
      const otherContext = { ...context, companyId: env.id("other") };
      await assert.rejects(db.$transaction(tx => updateProduct(tx, otherContext, { captureId: env.id("other-capture"), productId: p.id, patch: { name: "Wrong" } }, "web")), CaptureNotFoundError);
    });
    await t.test("revalidates automation memberships; web keeps admin access", async () => {
      const p = await fresh();
      await db.tripCompanyMember.delete({ where: { companyId_userId: { companyId: context.companyId, userId: env.userId } } });
      try { await assert.rejects(update(p.id, { name: "Wrong" }, "automation"), AuthorizationError); } finally { await db.tripCompanyMember.create({ data: { companyId: context.companyId, userId: env.userId } }); }
      await db.tripMember.update({ where: { tripId_userId: { tripId: context.tripId, userId: env.userId } }, data: { role: "ADMIN" } });
      try { await assert.rejects(update(p.id, { name: "Wrong" }, "automation"), AuthorizationError); assert.equal((await update(p.id, { name: "Mesa" })).name, "Mesa"); } finally { await db.tripMember.update({ where: { tripId_userId: { tripId: context.tripId, userId: env.userId } }, data: { role: "TRAVELER" } }); }
    });
    await t.test("stale observed version rejects an edit without overwriting current data", async () => {
      const p = await fresh();
      const old = await db.supplierProduct.update({ where: { id: p.id }, data: { updatedAt: new Date("2020-01-01T00:00:00.000Z") } });
      await update(p.id, { fob: { amount: 22 } });
      await assert.rejects(update(p.id, { fob: { amount: 25 } }, "automation", old.updatedAt.toISOString()), CaptureConflictError);
      assert.equal(Number((await db.supplierProduct.findUniqueOrThrow({ where: { id: p.id } })).fobAmount), 22);
    });
    await t.test("concurrent independent patches and notes do not lose changes", async () => {
      const p = await fresh();
      await Promise.all([update(p.id, { fob: { amount: 25 } }), update(p.id, { leadTime: { days: 50 } }), update(p.id, { notes: "Nota A." }), update(p.id, { notes: "Nota B." })]);
      const saved = await db.supplierProduct.findUniqueOrThrow({ where: { id: p.id } });
      assert.equal(Number(saved.fobAmount), 25); assert.equal(saved.leadTimeDays, 50); assert.equal(saved.moqQuantity, 200); assert.match(saved.notes!, /Nota inicial/); assert.match(saved.notes!, /Nota A/); assert.match(saved.notes!, /Nota B/);
    });
    await t.test("invalid fields and receipt failure leave stored values unchanged", async () => {
      const p = await fresh();
      for (const patch of [{ supplierId: "other" }, { captureId: "other" }, { confirm: "true" }, { fob: { amount: -1 } }, null]) await assert.rejects(update(p.id, patch), ValidationError);
      await assert.rejects(db.$transaction(async tx => { await updateProduct(tx, context, { captureId, productId: p.id, patch: { fob: { amount: 99 } } }, "automation"); throw new Error("receipt failed"); }), /receipt failed/);
      assert.equal(Number((await db.supplierProduct.findUniqueOrThrow({ where: { id: p.id } })).fobAmount), 18);
    });
  } finally { await env.cleanup(); await db.$disconnect(); }
});
