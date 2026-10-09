import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createProduct } from "../../lib/nihao/operations/create-product.ts";
import { assignProductAttachment, finalizeProduct, type ProductSourceEvidence } from "../../lib/nihao/operations/product-files.ts";
import { CaptureConflictError } from "../../lib/bot/persistence/repository.ts";
import { AuthorizationError } from "../../lib/bot/authorization.ts";
import { ValidationError } from "../../lib/bot/validation.ts";
import { createAgentEnvironment, localAgentDatabase } from "../../evals/whatsapp-agent/environment.ts";

test("PostgreSQL: product files and completion are scoped, atomic and retryable", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async t => {
  const db = localAgentDatabase();
  const env = await createAgentEnvironment(db, { trips: [{ id: "trip", name: "Files operations", companies: [{ id: "company", name: "Broco" }, { id: "other", name: "Other" }], suppliers: [{ id: "supplier", captureId: "capture", name: "Dragon", city: "Foshan", companyId: "company" }, { id: "other-supplier", captureId: "other-capture", name: "Sunrise", city: "Ningbo", companyId: "other" }] }] });
  const context = { userId: env.userId, tripId: env.id("trip"), companyId: env.id("company") }, captureId = env.id("capture");
  const fresh = (name = "Silla", sourceEvidence: unknown = []) => db.$transaction(tx => createProduct(tx, context, { captureId, fields: { name }, trace: { sourceEvidence } }, { access: "automation", confirmation: "after-evidence" }));
  const file = (type: "PRODUCT_IMAGE" | "BUSINESS_CARD" | "AUDIO" | "OTHER" = "PRODUCT_IMAGE", capture = captureId) => db.supplierAttachment.create({ data: { supplierCaptureId: capture, type, storageKey: `operations/${randomUUID()}`, mimeType: type === "AUDIO" ? "audio/ogg" : "image/jpeg", size: 4 } });
  const assign = (attachmentId: string, productId: string | null, access: "web" | "automation" = "web") => db.$transaction(tx => assignProductAttachment(tx, context, { captureId, attachmentId, productId }, access));
  const finish = (productId: string, attachmentIds: string[] = [], sources?: ProductSourceEvidence[]) => db.$transaction(tx => finalizeProduct(tx, context, { captureId, productId, attachmentIds, sources }, "automation"));
  try {
    await t.test("web associates, reassigns and detaches only product images", async () => {
      const a = await fresh(), b = await fresh(), image = await file(), card = await file("BUSINESS_CARD");
      assert.equal((await assign(image.id, a.id)).productId, a.id);
      assert.equal((await assign(image.id, b.id)).productId, b.id);
      assert.equal((await assign(image.id, null)).productId, null);
      await assert.rejects(assign(card.id, a.id), ValidationError);
      await assert.rejects(assign(image.id, randomUUID()), ValidationError);
    });
    await t.test("automation preserves audio/card evidence and rejects moving or detaching it", async () => {
      const a = await fresh(), b = await fresh(), audio = await file("AUDIO"), card = await file("BUSINESS_CARD");
      await finish(a.id, [audio.id, card.id]);
      assert.equal((await db.supplierAttachment.findUniqueOrThrow({ where: { id: audio.id } })).productId, a.id);
      await assert.rejects(assign(audio.id, b.id, "automation"), CaptureConflictError);
      await assert.rejects(assign(audio.id, null, "automation"), ValidationError);
    });
    await t.test("completion links image, merges trace and derives named status once", async () => {
      const p = await fresh("Silla", [{ id: "original", text: "Silla", origin: "VISUAL_DESCRIPTION" }]), image = await file();
      const sources = [{ id: "original", messageId: "synthetic", role: "FACTS", attachmentId: image.id, productImageVerified: true, logicalLoadIds: ["load"] }];
      const result = await finish(p.id, [image.id], sources);
      assert.equal(result.resourceStatus, "CONFIRMED"); assert.equal(result.newlyConfirmed, true);
      const saved = await db.supplierProduct.findUniqueOrThrow({ where: { id: p.id } });
      assert.deepEqual(saved.sourceEvidence, [{ text: "Silla", origin: "VISUAL_DESCRIPTION", ...sources[0] }]);
      assert.equal((await finish(p.id, [image.id], sources)).newlyConfirmed, false);
      assert.equal(await db.supplierAttachment.count({ where: { productId: p.id } }), 1);
      assert.deepEqual((await db.supplierProduct.findUniqueOrThrow({ where: { id: p.id } })).sourceEvidence, saved.sourceEvidence);
    });
    await t.test("image does not confirm unnamed product and confirmed rows are not demoted", async () => {
      const p = await fresh("Producto sin nombre"), image = await file();
      assert.equal((await finish(p.id, [image.id])).resourceStatus, "DRAFT");
      await db.supplierProduct.update({ where: { id: p.id }, data: { status: "CONFIRMED" } });
      assert.equal((await finish(p.id)).resourceStatus, "CONFIRMED");
    });
    await t.test("proof cannot name another product's image, card or invalid metadata", async () => {
      const p = await fresh(), image = await file(), card = await file("BUSINESS_CARD"), other = await fresh();
      await assign(image.id, other.id);
      await assert.rejects(finish(p.id, [], [{ id: "wrong", attachmentId: image.id, productImageVerified: true }]), ValidationError);
      await assert.rejects(finish(p.id, [card.id], [{ id: "card", attachmentId: card.id, productImageVerified: true }]), ValidationError);
      const invalid = await file(); await db.supplierAttachment.update({ where: { id: invalid.id }, data: { size: 0 } });
      await assert.rejects(finish(p.id, [invalid.id], [{ id: "bad", attachmentId: invalid.id, productImageVerified: true }]), ValidationError);
      assert.equal((await db.supplierAttachment.findUniqueOrThrow({ where: { id: card.id } })).productId, null);
    });
    await t.test("cross-capture files, revoked membership and deleted captures are rejected", async () => {
      const p = await fresh(), foreign = await file("PRODUCT_IMAGE", env.id("other-capture"));
      await assert.rejects(finish(p.id, [foreign.id]), ValidationError);
      await db.tripCompanyMember.delete({ where: { companyId_userId: { companyId: context.companyId, userId: env.userId } } });
      try { await assert.rejects(finish(p.id), AuthorizationError); } finally { await db.tripCompanyMember.create({ data: { companyId: context.companyId, userId: env.userId } }); }
      await db.supplierCapture.update({ where: { id: captureId }, data: { deletedAt: new Date() } });
      try { await assert.rejects(finish(p.id), CaptureConflictError); } finally { await db.supplierCapture.update({ where: { id: captureId }, data: { deletedAt: null } }); }
    });
    await t.test("missing file rolls back links and uploaded metadata remains available for retry", async () => {
      const p = await fresh(), image = await file();
      await assert.rejects(finish(p.id, [image.id, randomUUID()]), ValidationError);
      assert.equal((await db.supplierAttachment.findUniqueOrThrow({ where: { id: image.id } })).productId, null);
      assert.equal((await db.supplierProduct.findUniqueOrThrow({ where: { id: p.id } })).status, "DRAFT");
      assert.equal((await finish(p.id, [image.id])).resourceStatus, "CONFIRMED");
    });
    await t.test("receipt failure reverts links, source trace and status together", async () => {
      const p = await fresh(), image = await file();
      await assert.rejects(db.$transaction(async tx => { await finalizeProduct(tx, context, { captureId, productId: p.id, attachmentIds: [image.id], sources: [{ id: "new", text: "Silla" }] }, "automation"); throw new Error("receipt failed"); }), /receipt failed/);
      const saved = await db.supplierProduct.findUniqueOrThrow({ where: { id: p.id } });
      assert.equal(saved.status, "DRAFT"); assert.deepEqual(saved.sourceEvidence, []); assert.equal((await db.supplierAttachment.findUniqueOrThrow({ where: { id: image.id } })).productId, null);
      await finish(p.id, [image.id]);
    });
    await t.test("concurrent completion preserves both files and distinct sources", async () => {
      const p = await fresh(), a = await file(), b = await file();
      await Promise.all([finish(p.id, [a.id], [{ id: "source-a", text: "A" }]), finish(p.id, [b.id], [{ id: "source-b", text: "B" }])]);
      assert.equal(await db.supplierAttachment.count({ where: { productId: p.id } }), 2);
      const saved = await db.supplierProduct.findUniqueOrThrow({ where: { id: p.id } });
      assert.deepEqual((saved.sourceEvidence as Array<{ id: string }>).map(s => s.id).sort(), ["source-a", "source-b"]);
    });
  } finally { await env.cleanup(); await db.$disconnect(); }
});
