import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { correctSupplierCapture, confirmSupplierCapture, updateSupplier, updateSupplierDraft, updateCaptureDetails, autoConfirmSupplierCapture } from "../../lib/nihao/operations/supplier-operations.ts";
import { createProduct } from "../../lib/nihao/operations/create-product.ts";
import { AuthorizationError } from "../../lib/bot/authorization.ts";
import { CaptureConflictError, CaptureNotFoundError } from "../../lib/bot/persistence/repository.ts";
import { ValidationError } from "../../lib/bot/validation.ts";
import { createAgentEnvironment, localAgentDatabase } from "../../evals/whatsapp-agent/environment.ts";

test("PostgreSQL: supplier operations preserve scope, corrections and promotion", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async t => {
  const db = localAgentDatabase();
  const env = await createAgentEnvironment(db, { trips: [{ id: "trip", name: "Supplier operations", companies: [{ id: "company", name: "Broco" }, { id: "other", name: "Other" }], suppliers: [{ id: "supplier", captureId: "capture", name: "Dragon", city: "Foshan", companyId: "company" }, { id: "other-supplier", captureId: "other-capture", name: "Sunrise", city: "Ningbo", companyId: "other" }] }] });
  const context = { userId: env.userId, tripId: env.id("trip"), companyId: env.id("company") };
  const supplierId = env.id("supplier"), captureId = env.id("capture");
  const update = (patch: unknown, access: "web" | "automation" = "web", expectedVersion?: string) => db.$transaction(tx => updateSupplier(tx, context, { supplierId, patch, expectedVersion }, access));
  const draft = (extra: object = {}) => db.supplierCapture.create({ data: { tripId: context.tripId, companyId: context.companyId, createdById: env.userId, sourceType: "TEXT", status: "DRAFT", companyName: "New Supplier", missingFields: ["contact", "city"], reviewFields: ["city"], acknowledgedUnknownFields: [], evidence: [], ...extra } });
  const promote = (id: string) => db.$transaction(tx => autoConfirmSupplierCapture(tx, context, id, "automation"));
  try {
    await t.test("supplier patch preserves omitted commercial fields and appends/replaces notes", async () => {
      await db.supplier.update({ where: { id: supplierId }, data: { notes: "Initial.", fobAmount: 18, fobCurrency: "USD", fobUnit: "unidad", moqQuantity: 200, pendingFields: ["city"] } });
      const saved = await update({ fob: { amount: 20 }, notes: "Pedir catálogo.", city: "Guangzhou" }, "automation");
      assert.equal(Number(saved.fobAmount), 20); assert.equal(saved.fobCurrency, "USD"); assert.equal(saved.fobUnit, "unidad"); assert.equal(saved.moqQuantity, 200); assert.equal(saved.notes, "Initial.\nPedir catálogo."); assert.deepEqual(saved.pendingFields, []);
      assert.equal((await update({ notes: "Pedir catálogo." })).notes, saved.notes);
      assert.equal((await update({ notes: "Corrected.", notesMode: "replace" })).notes, "Corrected.");
      assert.equal((await update({ notes: null, notesMode: "replace" })).notes, null);
    });
    await t.test("contacts update atomically and reflect pending fields", async () => {
      const p = await update({ contacts: [{ type: "EMAIL", rawText: "sales@example.test" }, { type: "WECHAT", rawText: "dragon123" }] });
      assert.equal(p.contacts.length, 2); assert.ok(!(p.pendingFields as string[]).includes("contact"));
      const empty = await update({ contacts: [] }); assert.equal(empty.contacts.length, 0); assert.ok((empty.pendingFields as string[]).includes("contact"));
      await assert.rejects(update({ contacts: [{ type: "EMAIL", rawText: "invalid" }] }), ValidationError);
    });
    await t.test("concurrent supplier edits do not lose independent fields or notes", async () => {
      await update({ notes: "Start.", notesMode: "replace" });
      await Promise.all([update({ notes: "A." }), update({ notes: "B." }), update({ city: "Shenzhen" }), update({ fob: { amount: 25 } })]);
      const saved = await db.supplier.findUniqueOrThrow({ where: { id: supplierId } });
      assert.equal(saved.city, "Shenzhen"); assert.equal(Number(saved.fobAmount), 25); assert.match(saved.notes!, /Start/); assert.match(saved.notes!, /A/); assert.match(saved.notes!, /B/);
    });
    await t.test("scope and observed version reject foreign or stale writes", async () => {
      await assert.rejects(db.$transaction(tx => updateSupplier(tx, context, { supplierId: env.id("other-supplier"), patch: { city: "Wrong" } }, "web")), AuthorizationError);
      await assert.rejects(db.$transaction(tx => updateSupplier(tx, context, { supplierId: randomUUID(), patch: {} }, "web")), AuthorizationError);
      const old = await db.supplier.update({ where: { id: supplierId }, data: { updatedAt: new Date("2020-01-01") } });
      await update({ city: "Shanghai" });
      await assert.rejects(update({ city: "Wrong" }, "automation", old.updatedAt.toISOString()), CaptureConflictError);
      assert.equal((await db.supplier.findUniqueOrThrow({ where: { id: supplierId } })).city, "Shanghai");
    });
    await t.test("draft corrections keep review and human-correction metadata", async () => {
      const p = await draft({ notes: "Initial.", fobAmount: 18, fobCurrency: "USD" });
      const saved = await db.$transaction(tx => updateSupplierDraft(tx, context, { captureId: p.id, expectedVersion: p.updatedAt.toISOString(), patch: { city: "Hangzhou", notes: "Hace OEM.", fob: { amount: 22 }, contacts: [{ type: "EMAIL", rawText: "sales@example.test" }] } }));
      assert.equal(saved.city, "Hangzhou"); assert.equal(Number(saved.fobAmount), 22); assert.equal(saved.fobCurrency, "USD"); assert.equal(saved.notes, "Initial.\nHace OEM."); assert.ok((saved.humanCorrectedFields as string[]).includes("city")); assert.ok(!(saved.reviewFields as string[]).includes("city")); assert.deepEqual(saved.contactMethods, [{ type: "EMAIL", rawText: "sales@example.test" }]);
      const correctedAgain = await db.$transaction(tx => updateSupplierDraft(tx, context, { captureId: p.id, patch: { province: "Zhejiang" } }));
      assert.equal(Number(correctedAgain.fobAmount), 22); assert.equal(correctedAgain.fobCurrency, "USD");
      await assert.rejects(db.$transaction(tx => updateSupplierDraft(tx, context, { captureId: p.id, patch: { companyId: "other" } })), ValidationError);
      await assert.rejects(db.$transaction(tx => updateSupplierDraft(tx, context, { captureId, patch: { city: "Wrong" } })), CaptureConflictError);
    });
    await t.test("web details replace notes/contacts and reject field corrections", async () => {
      const p = await draft({ notes: "Previous." });
      const saved = await db.$transaction(tx => updateCaptureDetails(tx, context, { captureId: p.id, patch: { notes: "Replacement.", website: "https://example.test", contacts: [{ type: "EMAIL", rawText: "web@example.test" }] } }));
      assert.equal(saved.notes, "Replacement."); assert.equal(saved.website, "https://example.test");
      await assert.rejects(db.$transaction(tx => updateCaptureDetails(tx, context, { captureId: p.id, patch: { city: "Wrong" } })), ValidationError);
      assert.equal((await db.supplierCapture.findUniqueOrThrow({ where: { id: p.id } })).city, null);
    });
    await t.test("automatic promotion requires contact and keeps products/evidence/notes", async () => {
      const p = await draft({ notes: "Makes OEM.", evidence: [{ field: "companyName", evidence: "New Supplier", confidence: 1 }] });
      assert.equal((await promote(p.id)).resourceStatus, "DRAFT");
      const product = await db.$transaction(tx => createProduct(tx, context, { captureId: p.id, fields: { name: "Mesa" } }, { access: "automation", confirmation: "immediate" }));
      await db.supplierCapture.update({ where: { id: p.id }, data: { contact: "sales@example.test" } });
      const results = await Promise.all([promote(p.id), promote(p.id)]);
      assert.equal(results[0].id, results[1].id); assert.equal(await db.supplier.count({ where: { captureId: p.id } }), 1);
      const supplier = await db.supplier.findUniqueOrThrow({ where: { captureId: p.id }, include: { contacts: true } });
      assert.equal(supplier.notes, "Makes OEM."); assert.equal(supplier.contacts.length, 1);
      assert.deepEqual((await db.supplierCapture.findUniqueOrThrow({ where: { id: p.id } })).evidence, p.evidence);
      const savedProduct = await db.supplierProduct.findUniqueOrThrow({ where: { id: product.id } });
      assert.equal(savedProduct.supplierId, supplier.id); assert.equal(savedProduct.status, "CONFIRMED");
    });
    await t.test("reanalysis blocks promotion and existing supplier is not overwritten", async () => {
      const p = await draft({ contact: "sales@example.test", needsReanalysis: true });
      assert.equal((await promote(p.id)).resourceStatus, "DRAFT"); assert.equal(await db.supplier.count({ where: { captureId: p.id } }), 0);
      const before = await db.supplier.findUniqueOrThrow({ where: { id: supplierId } });
      await db.$transaction(tx => updateCaptureDetails(tx, context, { captureId, patch: { notes: "Capture-only edit." } }));
      const result = await promote(captureId);
      assert.equal(result.id, supplierId); assert.equal((await db.supplier.findUniqueOrThrow({ where: { id: supplierId } })).notes, before.notes);
    });
    await t.test("revoked/deleted scope rejects edits and promotion before mutation", async () => {
      const p = await draft({ contact: "sales@example.test" });
      await db.tripCompanyMember.delete({ where: { companyId_userId: { companyId: context.companyId, userId: env.userId } } });
      try { await assert.rejects(update({ notes: "Wrong." }, "automation"), AuthorizationError); await assert.rejects(promote(p.id), AuthorizationError); } finally { await db.tripCompanyMember.create({ data: { companyId: context.companyId, userId: env.userId } }); }
      await db.supplierCapture.update({ where: { id: p.id }, data: { deletedAt: new Date() } });
      await assert.rejects(promote(p.id), CaptureConflictError); assert.equal(await db.supplier.count({ where: { captureId: p.id } }), 0);
    });
    await t.test("manual correction keeps commercial conditions and human review metadata", async () => {
      const p = await draft({ fobAmount: 18, fobCurrency: "USD", moqQuantity: 200, leadTimeDays: 30, reviewFields: ["city", "province"] });
      const correct = (field: string, value: unknown, acknowledgedUnknown = false) => db.$transaction(tx => correctSupplierCapture(tx, context, { captureId: p.id, field, value, acknowledgedUnknown }));
      const saved = await correct("city", "Foshan");
      assert.equal(saved.fields.city, "Foshan"); assert.equal(saved.fields.fob?.amount, 18); assert.equal(saved.fields.moq?.quantity, 200); assert.equal(saved.fields.leadTime?.days, 30);
      assert.ok(saved.humanCorrectedFields.includes("city")); assert.ok(!saved.reviewFields.includes("city")); assert.ok(saved.reviewFields.includes("province"));
      const unknown = await correct("province", null, true); assert.ok(unknown.acknowledgedUnknownFields.includes("province"));
      await assert.rejects(correct("interestScore", 11), ValidationError);
      const commercial = await correct("fob", { amount: 22, currency: "EUR", unit: "unidad", rawText: "EUR 22" });
      assert.equal(commercial.fields.fob?.amount, 22); assert.equal(commercial.fields.fob?.currency, "EUR"); assert.equal(commercial.fields.moq?.quantity, 200);
    });
    await t.test("reviewed confirmation updates the existing supplier and replaces contacts", async () => {
      const p = await draft({ contact: "old@example.test", notes: "Initial" });
      await promote(p.id);
      const correct = (field: string, value: unknown) => db.$transaction(tx => correctSupplierCapture(tx, context, { captureId: p.id, field, value }));
      await correct("companyName", "Reviewed Supplier"); await correct("contact", "new@example.test");
      const first = await db.$transaction(tx => confirmSupplierCapture(tx, context, { captureId: p.id }));
      const second = await db.$transaction(tx => confirmSupplierCapture(tx, context, { captureId: p.id }));
      assert.equal(first.supplier.id, second.supplier.id); assert.equal(first.supplier.companyName, "Reviewed Supplier");
      const contacts = await db.supplierContact.findMany({ where: { supplierId: first.supplier.id } });
      assert.equal(contacts.length, 1); assert.equal(contacts[0].rawText, "new@example.test"); assert.deepEqual(first.capture.reviewFields, []);
    });
    await t.test("manual promotion is concurrent, links products and rolls back with caller", async () => {
      const p = await draft({ contact: "manual@example.test", evidence: [{ field: "companyName", confidence: 1, evidence: "New Supplier" }] });
      const product = await db.$transaction(tx => createProduct(tx, context, { captureId: p.id, fields: { name: "Silla" } }, { access: "automation", confirmation: "immediate" }));
      const confirm = () => db.$transaction(tx => confirmSupplierCapture(tx, context, { captureId: p.id }));
      await assert.rejects(db.$transaction(async tx => { await confirmSupplierCapture(tx, context, { captureId: p.id }); throw new Error("rollback"); }), /rollback/);
      assert.equal(await db.supplier.count({ where: { captureId: p.id } }), 0);
      const results = await Promise.all([confirm(), confirm()]); assert.equal(results[0].supplier.id, results[1].supplier.id);
      assert.equal((await db.supplierProduct.findUniqueOrThrow({ where: { id: product.id } })).supplierId, results[0].supplier.id);
      assert.deepEqual((await db.supplierCapture.findUniqueOrThrow({ where: { id: p.id } })).evidence, p.evidence);
    });
    await t.test("manual operations reject reanalysis, incomplete, stale and foreign captures", async () => {
      const p = await draft({ contact: "manual@example.test", needsReanalysis: true });
      const confirm = (captureId: string, expectedVersion?: string) => db.$transaction(tx => confirmSupplierCapture(tx, context, { captureId, expectedVersion }));
      await assert.rejects(confirm(p.id), CaptureConflictError);
      await assert.rejects(confirm(randomUUID()), CaptureNotFoundError);
      await assert.rejects(db.$transaction(tx => correctSupplierCapture(tx, context, { captureId: p.id, field: "city", value: "Wrong", expectedVersion: "2000-01-01T00:00:00.000Z" })), CaptureConflictError);
      await db.supplierCapture.update({ where: { id: p.id }, data: { needsReanalysis: false, contact: null } });
      await assert.rejects(confirm(p.id), CaptureConflictError);
      await assert.rejects(confirm(p.id, "2000-01-01T00:00:00.000Z"), CaptureConflictError);
      await assert.rejects(confirm(env.id("other-capture")), AuthorizationError);
      await assert.rejects(db.$transaction(tx => correctSupplierCapture(tx, context, { captureId: env.id("other-capture"), field: "city", value: "Wrong" })), AuthorizationError);
      await db.tripMember.update({ where: { tripId_userId: { tripId: context.tripId, userId: context.userId } }, data: { role: "ADMIN" } });
      try { await assert.rejects(confirm(p.id), AuthorizationError); await assert.rejects(db.$transaction(tx => correctSupplierCapture(tx, context, { captureId: p.id, field: "city", value: "Wrong" })), AuthorizationError); }
      finally { await db.tripMember.update({ where: { tripId_userId: { tripId: context.tripId, userId: context.userId } }, data: { role: "TRAVELER" } }); }
    });
    await t.test("receipt failure rolls back both supplier edits and promotion", async () => {
      const before = await db.supplier.findUniqueOrThrow({ where: { id: supplierId } });
      await assert.rejects(db.$transaction(async tx => { await updateSupplier(tx, context, { supplierId, patch: { city: "Rollback" } }, "automation"); throw new Error("receipt failed"); }), /receipt failed/);
      assert.equal((await db.supplier.findUniqueOrThrow({ where: { id: supplierId } })).city, before.city);
      const p = await draft({ contact: "rollback@example.test" });
      await assert.rejects(db.$transaction(async tx => { await autoConfirmSupplierCapture(tx, context, p.id, "automation"); throw new Error("receipt failed"); }), /receipt failed/);
      assert.equal(await db.supplier.count({ where: { captureId: p.id } }), 0); assert.equal((await db.supplierCapture.findUniqueOrThrow({ where: { id: p.id } })).status, "DRAFT");
    });
  } finally { await env.cleanup(); await db.$disconnect(); }
});
