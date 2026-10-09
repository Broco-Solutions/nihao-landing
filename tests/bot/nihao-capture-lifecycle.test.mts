import { PrismaWhatsAppCardRepository } from "../../lib/channels/whatsapp/prisma-card-repository.ts";
import { runProductExtraction } from "../../lib/bot/extraction/production.ts";
import { SupplierExtractionService } from "../../lib/bot/extraction/service.ts";
import { userTripCatalog } from "../../lib/nihao/operations/trip-catalog.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createAgentEnvironment, localAgentDatabase } from "../../evals/whatsapp-agent/environment.ts";
import { EMPTY_TIER_1_DATA, type StructuredExtractionResult } from "../../lib/bot/types.ts";
import { calculateMissingFields } from "../../lib/bot/tier1.ts";
import { createSupplierCapture, replaceSupplierExtraction, enrichSupplierCapture, finalizeSupplierEvidence, createEmptyEvidenceCapture, deleteEmptySupplierCapture } from "../../lib/nihao/operations/capture-lifecycle.ts";
import { OperationsCaptureRepository } from "../../lib/nihao/operations/capture-repository-adapter.ts";
import { correctSupplierCapture, autoConfirmSupplierCapture } from "../../lib/nihao/operations/supplier-operations.ts";
import { deleteProduct, deleteSupplierRecord } from "../../lib/nihao/operations/delete-records.ts";
import { createProduct } from "../../lib/nihao/operations/create-product.ts";
import { getBusinessRecord, supplierCandidates, productCandidates, captureProducts } from "../../lib/nihao/operations/read-records.ts";
import { AuthorizationError } from "../../lib/bot/authorization.ts";
import { CaptureConflictError } from "../../lib/bot/persistence/repository.ts";
import { ValidationError } from "../../lib/bot/validation.ts";

test("PostgreSQL: capture lifecycle, legacy port, reads and deletion", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async t => {
  const db = localAgentDatabase();
  const env = await createAgentEnvironment(db, { trips: [{ id: "trip", name: "Lifecycle", companies: [{ id: "company", name: "Broco" }, { id: "other", name: "Other" }], suppliers: [{ id: "other-supplier", captureId: "other-capture", name: "Foreign", city: "Ningbo", companyId: "other" }] }] });
  const context = { userId: env.userId, tripId: env.id("trip"), companyId: env.id("company") };
  const port = new OperationsCaptureRepository(db, "automation");
  const extraction = (name = "Dragon"): StructuredExtractionResult => {
    const fields = { ...EMPTY_TIER_1_DATA, companyName: name, contact: "sales@dragon.test", city: "Foshan", category: "Silla", fob: { amount: 18, currency: "USD", unit: "unidad", rawText: "USD 18" } };
    return { rawSource: { type: "TEXT", text: "Producto: Silla. USD 18" }, extractedFields: fields, missingFields: calculateMissingFields(fields), reviewFields: ["city"], evidence: [{ field: "companyName", confidence: 1, evidence: name }] };
  };
  const create = (explicitProducts = false) => db.$transaction(tx => createSupplierCapture(tx, context, { extraction: extraction(), explicitProducts }, "automation"));
  const attachment = (captureId: string) => db.supplierAttachment.create({ data: { supplierCaptureId: captureId, type: "BUSINESS_CARD", mimeType: "image/jpeg", size: 20, storageKey: `synthetic/${randomUUID()}` } });
  try {
    await t.test("stable-ID replay preserves original implicit product and is atomic", async () => {
      const id = randomUUID();
      const command = { clientCaptureId: id, extraction: extraction() };
      const results = await Promise.all([port.createDraft({ ...context, ...command }), port.createDraft({ ...context, ...command })]);
      assert.equal(results[0].id, results[1].id); assert.equal(await db.supplierProduct.count({ where: { captureId: id } }), 1);
      await db.supplierProduct.update({ where: { id: `extracted_${id}` }, data: { name: "Human edit" } });
      await port.createDraft({ ...context, clientCaptureId: id, extraction: extraction("Changed replay") });
      assert.equal((await db.supplierProduct.findUniqueOrThrow({ where: { id: `extracted_${id}` } })).name, "Human edit");
      assert.equal((await port.getCapture(context, id))?.fields.companyName, "Dragon");
      await assert.rejects(port.createDraft({ ...context, clientCaptureId: env.id("other-capture"), extraction: extraction() }), AuthorizationError);
      const rollbackId = randomUUID();
      await assert.rejects(db.$transaction(async tx => { await createSupplierCapture(tx, context, { clientCaptureId: rollbackId, extraction: extraction() }, "automation"); throw new Error("receipt failed"); }), /receipt failed/);
      assert.equal(await db.supplierCapture.count({ where: { id: rollbackId } }), 0); assert.equal(await db.supplierProduct.count({ where: { captureId: rollbackId } }), 0);
    });
    await t.test("explicit products avoid implicit creation and extraction preserves human fields", async () => {
      const capture = await create(true); assert.equal(await db.supplierProduct.count({ where: { captureId: capture.id } }), 0);
      await db.$transaction(tx => correctSupplierCapture(tx, context, { captureId: capture.id, field: "city", value: "Human city" }));
      const current = await port.getCapture(context, capture.id);
      const updated = await port.replaceExtraction(context, capture.id, extraction("Updated"), { expectedVersion: current!.updatedAt });
      assert.equal(updated.fields.city, "Human city"); assert.ok(updated.humanCorrectedFields.includes("city")); assert.ok(!updated.reviewFields.includes("city"));
      const product = await db.supplierProduct.findUniqueOrThrow({ where: { id: `extracted_${capture.id}` } }); assert.equal(Number(product.fobAmount), 18);
      await assert.rejects(port.replaceExtraction(context, capture.id, extraction(), { expectedVersion: current!.updatedAt }), CaptureConflictError);
    });
    await t.test("extraction rejects foreign evidence before changing the capture", async () => {
      const capture = await create(true); const own = await attachment(capture.id); const foreign = await attachment(env.id("other-capture"));
      await assert.rejects(port.replaceExtraction(context, capture.id, extraction("Wrong"), { analyzedAttachmentIds: [foreign.id] }), AuthorizationError);
      assert.equal((await port.getCapture(context, capture.id))!.fields.companyName, "Dragon");
      const updated = await port.replaceExtraction(context, capture.id, extraction(), { analyzedAttachmentIds: [own.id, own.id] }); assert.deepEqual(updated.analyzedAttachmentIds, [own.id]);
    });
    await t.test("ingestion metadata and notes serialize concurrent changes", async () => {
      const capture = await create(true);
      await Promise.all(["A", "B"].map(value => db.$transaction(tx => enrichSupplierCapture(tx, context, { captureId: capture.id, notes: value, appendEvidence: { source: value } }, "automation"))));
      const saved = await db.supplierCapture.findUniqueOrThrow({ where: { id: capture.id } }); assert.match(saved.notes!, /A/); assert.match(saved.notes!, /B/); assert.equal((saved.evidence as unknown[]).length, 3);
      await db.$transaction(tx => enrichSupplierCapture(tx, context, { captureId: capture.id, commercial: { fob: { amount: 22, currency: "EUR" }, moq: { quantity: 200 } }, companyNameLatin: "Dragon Latin", sourceText: "Original" }, "automation"));
      const file = await attachment(capture.id); await db.$transaction(tx => finalizeSupplierEvidence(tx, context, capture.id, "automation"));
      const final = await db.supplierCapture.findUniqueOrThrow({ where: { id: capture.id } }); assert.equal(Number(final.fobAmount), 22); assert.equal(final.moqQuantity, 200); assert.equal(final.companyNameLatin, "Dragon Latin"); assert.deepEqual(final.analyzedAttachmentIds, [file.id]); assert.equal(final.sourceAttachmentId, file.id);
    });
    await t.test("candidate reads and DTOs respect trip and explicit company scope", async () => {
      const capture = await create(); const result = await db.$transaction(tx => autoConfirmSupplierCapture(tx, context, capture.id, "automation"));
      const record = await getBusinessRecord(db, context, "SUPPLIER", capture.id); assert.equal(record.kind, "SUPPLIER");
      const candidates = await supplierCandidates(db, context, "automation"); assert.ok(candidates.suppliers.some(s => s.id === result.id)); assert.ok(!candidates.suppliers.some(s => s.id === env.id("other-supplier")));
      const products = await productCandidates(db, context, "automation", result.id); assert.equal(products.length, 1); assert.equal((await captureProducts(db, context, capture.id)).length, 1);
      assert.equal(await port.getSupplier(context, env.id("other-supplier")), null);
      assert.equal(await port.getCapture(context, env.id("other-capture")), null);
      await assert.rejects(productCandidates(db, { ...context, companyId: "missing" }, "automation"), AuthorizationError);
      await db.tripCompany.update({ where: { id: context.companyId }, data: { active: false } });
      try { await assert.rejects(port.getCapture(context, capture.id), AuthorizationError); await assert.rejects(create(), AuthorizationError); }
      finally { await db.tripCompany.update({ where: { id: context.companyId }, data: { active: true } }); }
    });
    await t.test("product deletion preserves file restriction and rolls back", async () => {
      const capture = await create(true); const product = await db.$transaction(tx => createProduct(tx, context, { captureId: capture.id, fields: { name: "Chair" } }, { access: "web", confirmation: "immediate" }));
      const file = await attachment(capture.id); await db.supplierAttachment.update({ where: { id: file.id }, data: { productId: product.id } });
      await assert.rejects(db.$transaction(tx => deleteProduct(tx, context, { captureId: capture.id, productId: product.id })), ValidationError);
      await db.supplierAttachment.update({ where: { id: file.id }, data: { productId: null } });
      await assert.rejects(db.$transaction(async tx => { await deleteProduct(tx, context, { captureId: capture.id, productId: product.id }); throw new Error("rollback"); }), /rollback/);
      assert.equal(await db.supplierProduct.count({ where: { id: product.id } }), 1);
      await db.$transaction(tx => deleteProduct(tx, context, { captureId: capture.id, productId: product.id })); assert.equal(await db.supplierProduct.count({ where: { id: product.id } }), 0);
    });
    await t.test("supplier deletion retains originals and prevents resurrection", async () => {
      const capture = await create(); const promoted = await db.$transaction(tx => autoConfirmSupplierCapture(tx, context, capture.id, "automation")); const file = await attachment(capture.id);
      await assert.rejects(db.$transaction(async tx => { await deleteSupplierRecord(tx, context, promoted.id!); throw new Error("rollback"); }), /rollback/);
      assert.equal(await db.supplier.count({ where: { id: promoted.id } }), 1);
      await db.$transaction(tx => deleteSupplierRecord(tx, context, promoted.id!)); assert.equal(await db.supplierProduct.count({ where: { captureId: capture.id } }), 0); assert.equal(await db.supplierAttachment.count({ where: { id: file.id } }), 1);
      assert.ok((await db.supplierCapture.findUniqueOrThrow({ where: { id: capture.id } })).deletedAt);
      await assert.rejects(port.createDraft({ ...context, clientCaptureId: capture.id, extraction: extraction() }), CaptureConflictError);
      await assert.rejects(port.replaceExtraction(context, capture.id, extraction()), CaptureConflictError);
      await assert.rejects(db.$transaction(tx => autoConfirmSupplierCapture(tx, context, capture.id, "automation")), CaptureConflictError);
    });
    await t.test("extraction composition refuses a result after an intervening human edit", async () => {
      const capture = await create(true);
      const extractionService = new SupplierExtractionService([]);
      extractionService.extractMany = async () => {
        await db.$transaction(tx => correctSupplierCapture(tx, context, { captureId: capture.id, field: "city", value: "Edited during extraction" }));
        return extraction("Late result");
      };
      await assert.rejects(runProductExtraction({ ...context, captureId: capture.id, text: "Original", businessCardAttachmentIds: [] }, { captures: port, attachments: { get: async () => null }, extraction: extractionService }), CaptureConflictError);
      assert.equal((await port.getCapture(context, capture.id))!.fields.city, "Edited during extraction");
      assert.equal((await port.getCapture(context, capture.id))!.fields.companyName, "Dragon");
    });
    await t.test("legacy card bootstrap keeps runtime state and command idempotency", async () => {
      const cards = new PrismaWhatsAppCardRepository(db); const id = randomUUID();
      const created = await cards.createPending(context, id, "original"); assert.equal(created.created, true); assert.equal(created.card.state, "PENDING");
      const repeated = await cards.createPending(context, id, "original"); assert.equal(repeated.created, false); assert.equal(repeated.card.id, id);
      const messageId = randomUUID(); const instance = `synthetic-${randomUUID()}`;
      try {
        const command = await cards.beginAnalyzeCommand(context, instance, messageId, new Date(0)); assert.equal(command.kind, "owned");
        assert.equal(await cards.settleAnalyzeCommand(context, instance, messageId, id, "COMPLETED"), true);
        assert.equal((await cards.get(context, id))!.state, "ANALYZED");
        assert.equal((await cards.beginAnalyzeCommand(context, instance, messageId, new Date(0))).kind, "existing");
        assert.equal(await cards.deleteIfEmpty(context, id), false);
      } finally { await db.whatsAppCommandReceipt.deleteMany({ where: { instance } }); }
      const pendingId = randomUUID(); await cards.createPending(context, pendingId, "original"); assert.equal(await cards.deleteIfEmpty(context, pendingId), true);
      const catalogue = await userTripCatalog(db, context.userId, true); assert.ok(catalogue.trips.some(trip => trip.id === context.tripId));
    });
    await t.test("empty evidence bootstrap and cleanup reject foreign and nonempty captures", async () => {
      const id = randomUUID(); await db.$transaction(tx => createEmptyEvidenceCapture(tx, context, { captureId: id, evidenceId: "source" }));
      const file = await attachment(id); assert.equal(await db.$transaction(tx => deleteEmptySupplierCapture(tx, context, id)), false);
      await db.supplierAttachment.delete({ where: { id: file.id } }); assert.equal(await db.$transaction(tx => deleteEmptySupplierCapture(tx, context, id)), true);
      await assert.rejects(db.$transaction(tx => deleteSupplierRecord(tx, context, env.id("other-supplier"))), AuthorizationError);
      await db.tripMember.update({ where: { tripId_userId: { tripId: context.tripId, userId: context.userId } }, data: { role: "ADMIN" } });
      try { await assert.rejects(create(), AuthorizationError); } finally { await db.tripMember.update({ where: { tripId_userId: { tripId: context.tripId, userId: context.userId } }, data: { role: "TRAVELER" } }); }
    });
  } finally { await env.cleanup(); await db.$disconnect(); }
});
