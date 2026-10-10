import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { AuthorizationError } from "../../lib/bot/authorization.ts";
import { CaptureConflictError, CaptureNotFoundError } from "../../lib/bot/persistence/repository.ts";
import { listAttachmentMoveTargets, moveSupplierAttachment } from "../../lib/nihao/operations/move-attachment.ts";
import { createAgentEnvironment, localAgentDatabase } from "../../evals/whatsapp-agent/environment.ts";

test("PostgreSQL: manual image reassociation is scoped, durable and atomic", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async (t) => {
  const db = localAgentDatabase();
  const env = await createAgentEnvironment(db, { trips: [
    { id: "trip", name: "Canton", companies: [{ id: "company", name: "Broco" }, { id: "other-company", name: "Other" }], suppliers: [
      { id: "panlos", captureId: "panlos-capture", name: "PANLOS", city: "Shantou", companyId: "company" },
      { id: "timekettle", captureId: "timekettle-capture", name: "Timekettle", city: "Shenzhen", companyId: "company" },
      { id: "other-supplier", captureId: "other-company-capture", name: "Other supplier", city: "Yiwu", companyId: "other-company" },
    ] },
    { id: "other-trip", name: "Other trip", companies: [{ id: "other-trip-company", name: "Other trip company" }], suppliers: [
      { id: "other-trip-supplier", captureId: "other-trip-capture", name: "Other trip supplier", city: "Beijing", companyId: "other-trip-company" },
    ] },
  ] });
  const context = { userId: env.userId, tripId: env.id("trip") };
  const panlos = env.id("panlos-capture");
  const timekettle = env.id("timekettle-capture");
  const createImage = (captureId: string, type: "BUSINESS_CARD" | "PRODUCT_IMAGE" = "BUSINESS_CARD", productId?: string) => db.supplierAttachment.create({ data: { supplierCaptureId: captureId, productId, type, storageKey: `immutable/${randomUUID()}.jpg`, mimeType: "image/jpeg", size: 1234 } });

  try {
    await t.test("moves a card without touching the original or historical WhatsApp receipt", async () => {
      const card = await createImage(timekettle);
      await db.supplierCapture.update({ where: { id: timekettle }, data: {
        sourceAttachmentId: card.id,
        analyzedAttachmentIds: [card.id],
        evidence: [{ field: "companyName", confidence: 0.91, evidence: "Timekettle" }, { field: "contact", confidence: 0.9, evidence: "human@example.test" }],
        humanCorrectedFields: ["contact"],
      } });
      const receipt = await db.whatsAppCommandReceipt.create({ data: { instance: `test-${randomUUID()}`, messageId: randomUUID(), command: "ANALYZE_CARD", status: "COMPLETED", tripId: context.tripId, createdById: context.userId, supplierCaptureId: timekettle } });
      const before = { storageKey: card.storageKey, size: card.size };

      const first = await db.$transaction((tx) => moveSupplierAttachment(tx, context, { sourceCaptureId: timekettle, destinationCaptureId: panlos, attachmentId: card.id }));
      const retry = await db.$transaction((tx) => moveSupplierAttachment(tx, context, { sourceCaptureId: timekettle, destinationCaptureId: panlos, attachmentId: card.id }));
      assert.equal(first.idempotent, false); assert.equal(retry.idempotent, true);
      const moved = await db.supplierAttachment.findUniqueOrThrow({ where: { id: card.id } });
      assert.equal(moved.supplierCaptureId, panlos); assert.equal(moved.storageKey, before.storageKey); assert.equal(moved.size, before.size);
      assert.equal((moved.associationHistory as unknown[]).length, 1);
      const [source, destination, unchangedReceipt] = await Promise.all([
        db.supplierCapture.findUniqueOrThrow({ where: { id: timekettle } }),
        db.supplierCapture.findUniqueOrThrow({ where: { id: panlos } }),
        db.whatsAppCommandReceipt.findUniqueOrThrow({ where: { id: receipt.id } }),
      ]);
      assert.equal(source.sourceAttachmentId, null); assert.deepEqual(source.analyzedAttachmentIds, []); assert.equal(source.needsReanalysis, true);
      assert.deepEqual(source.reviewFields, ["companyName"], "human corrections remain excluded from derived review fields");
      assert.equal(destination.needsReanalysis, true); assert.equal(unchangedReceipt.supplierCaptureId, timekettle);
      assert.equal(await db.supplier.count({ where: { captureId: { in: [panlos, timekettle] } } }), 2);
    });

    await t.test("detaches a product photo and preserves commercial values for review", async () => {
      const product = await db.supplierProduct.create({ data: { captureId: timekettle, supplierId: env.id("timekettle"), status: "CONFIRMED", name: "AT-200", fobAmount: 9, fobCurrency: "USD", moqQuantity: 500, sourceEvidence: [] } });
      const image = await createImage(timekettle, "PRODUCT_IMAGE", product.id);
      await db.supplierProduct.update({ where: { id: product.id }, data: { sourceEvidence: { refs: [{ id: "proof", attachmentId: image.id, productImageVerified: true, field: "fob" }], retained: "manual context" } } });
      await db.$transaction((tx) => moveSupplierAttachment(tx, context, { sourceCaptureId: timekettle, destinationCaptureId: panlos, attachmentId: image.id }));
      const [moved, savedProduct] = await Promise.all([db.supplierAttachment.findUniqueOrThrow({ where: { id: image.id } }), db.supplierProduct.findUniqueOrThrow({ where: { id: product.id } })]);
      assert.equal(moved.productId, null); assert.equal(moved.supplierCaptureId, panlos);
      assert.equal(Number(savedProduct.fobAmount), 9); assert.equal(savedProduct.moqQuantity, 500); assert.equal(savedProduct.status, "CONFIRMED");
      assert.deepEqual(savedProduct.sourceEvidence, { refs: [], retained: "manual context" }); assert.deepEqual(savedProduct.reviewFields, ["fob", "image"]);
    });

    await t.test("lists and accepts only exact same traveler, company and trip targets", async () => {
      const targets = await db.$transaction((tx) => listAttachmentMoveTargets(tx, context, timekettle));
      assert.deepEqual(targets.map((target) => target.id), [panlos]);
      const card = await createImage(timekettle);
      await assert.rejects(db.$transaction((tx) => moveSupplierAttachment(tx, context, { sourceCaptureId: timekettle, destinationCaptureId: env.id("other-company-capture"), attachmentId: card.id })), AuthorizationError);
      await assert.rejects(db.$transaction((tx) => moveSupplierAttachment(tx, context, { sourceCaptureId: timekettle, destinationCaptureId: env.id("other-trip-capture"), attachmentId: card.id })), AuthorizationError);
      await assert.rejects(db.$transaction((tx) => moveSupplierAttachment(tx, context, { sourceCaptureId: timekettle, destinationCaptureId: randomUUID(), attachmentId: card.id })), CaptureNotFoundError);
      await db.supplierCapture.update({ where: { id: panlos }, data: { deletedAt: new Date() } });
      await assert.rejects(db.$transaction((tx) => moveSupplierAttachment(tx, context, { sourceCaptureId: timekettle, destinationCaptureId: panlos, attachmentId: card.id })), CaptureConflictError);
      assert.equal((await db.supplierAttachment.findUniqueOrThrow({ where: { id: card.id } })).supplierCaptureId, timekettle);
      await db.supplierCapture.update({ where: { id: panlos }, data: { deletedAt: null } });
    });

    await t.test("rejects another traveler even inside the same company", async () => {
      const otherUserId = `${env.prefix}-other-user`;
      await db.user.create({ data: { id: otherUserId, name: "Other", email: `${otherUserId}@example.test` } });
      await db.tripMember.create({ data: { tripId: context.tripId, userId: otherUserId, role: "TRAVELER" } });
      await db.tripCompanyMember.create({ data: { companyId: env.id("company"), userId: otherUserId } });
      const foreign = await db.supplierCapture.create({ data: { tripId: context.tripId, companyId: env.id("company"), createdById: otherUserId, sourceType: "TEXT", missingFields: [], reviewFields: [], acknowledgedUnknownFields: [], evidence: [] } });
      const card = await createImage(timekettle);
      await assert.rejects(db.$transaction((tx) => moveSupplierAttachment(tx, context, { sourceCaptureId: timekettle, destinationCaptureId: foreign.id, attachmentId: card.id })), AuthorizationError);
      assert.equal((await db.supplierAttachment.findUniqueOrThrow({ where: { id: card.id } })).supplierCaptureId, timekettle);
      await db.supplierCapture.delete({ where: { id: foreign.id } }); await db.user.delete({ where: { id: otherUserId } });
    });

    await t.test("rolls back an injected error and serializes concurrent retries", async () => {
      const rollbackCard = await createImage(timekettle); const key = rollbackCard.storageKey;
      await assert.rejects(db.$transaction(async (tx) => { await moveSupplierAttachment(tx, context, { sourceCaptureId: timekettle, destinationCaptureId: panlos, attachmentId: rollbackCard.id }); throw new Error("injected rollback"); }), /injected rollback/);
      const rolledBack = await db.supplierAttachment.findUniqueOrThrow({ where: { id: rollbackCard.id } });
      assert.equal(rolledBack.supplierCaptureId, timekettle); assert.equal(rolledBack.storageKey, key); assert.deepEqual(rolledBack.associationHistory, []);

      const concurrentCard = await createImage(timekettle);
      const results = await Promise.all([
        db.$transaction((tx) => moveSupplierAttachment(tx, context, { sourceCaptureId: timekettle, destinationCaptureId: panlos, attachmentId: concurrentCard.id })),
        db.$transaction((tx) => moveSupplierAttachment(tx, context, { sourceCaptureId: timekettle, destinationCaptureId: panlos, attachmentId: concurrentCard.id })),
      ]);
      assert.deepEqual(results.map((result) => result.idempotent).sort(), [false, true]);
      const final = await db.supplierAttachment.findUniqueOrThrow({ where: { id: concurrentCard.id } });
      assert.equal(final.supplierCaptureId, panlos); assert.equal((final.associationHistory as unknown[]).length, 1);
    });
  } finally { await env.cleanup(); await db.$disconnect(); }
});
