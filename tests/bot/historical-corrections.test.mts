import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { assertStagingCorrectionsEnvironment, parseCorrectionManifest, correctionHash, diagnoseHistoricalCorrection, applyHistoricalCorrection, revertHistoricalCorrection, type CorrectionManifest } from "../../lib/admin/historical-corrections.ts";
import { productCandidates, getBusinessRecord, captureProducts } from "../../lib/nihao/operations/read-records.ts";
import { createAgentEnvironment, localAgentDatabase } from "../../evals/whatsapp-agent/environment.ts";

const staging = { NIHAO_RUNTIME_ENV: "staging", DATABASE_URL: "postgresql://local@127.0.0.1:54379/nihao_audit", NIHAO_STAGING_DATABASE_HOST: "127.0.0.1" };
test("history command fails closed outside explicit isolated staging", () => {
  for (const env of [{}, { ...staging, NIHAO_RUNTIME_ENV: "production" }, { ...staging, VERCEL_ENV: "production" }, { ...staging, RAILWAY_ENVIRONMENT_NAME: "production" }, { ...staging, NIHAO_STAGING_DATABASE_HOST: "different" }, { ...staging, NIHAO_PRODUCTION_DATABASE_HOST: "127.0.0.1" }]) assert.throws(() => assertStagingCorrectionsEnvironment(env));
  assert.doesNotThrow(() => assertStagingCorrectionsEnvironment(staging));
});
test("review manifest requires precise proof and supported operation", () => {
  assert.throws(() => parseCorrectionManifest({ version: 1, reviewed: false }));
  assert.equal(correctionHash({ b: 2, a: 1 }), correctionHash({ a: 1, b: 2 }));
});
test("PostgreSQL: history apply/revert preserves originals and refuses subsequent human edits", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async () => {
  const db = localAgentDatabase();
  const env = await createAgentEnvironment(db, { trips: [{ id: "trip", name: "Canton", companies: [{ id: "company", name: "Broco" }], suppliers: [{ id: "s1", captureId: "c1", name: "PANLOS", city: "Shantou", companyId: "company" }, { id: "s2", captureId: "c2", name: "Timekettle", city: "Shenzhen", companyId: "company" }] }] });
  const actorId = randomUUID(), appliedIds: string[] = [];
  await db.user.create({ data: { id: actorId, name: "Staging admin", email: `${actorId}@example.test`, role: "ADMIN" } });
  await db.tripMember.create({ data: { tripId: env.id("trip"), userId: actorId, role: "ADMIN" } });
  try {
    const image = await db.supplierAttachment.create({ data: { supplierCaptureId: env.id("c1"), type: "BUSINESS_CARD", storageKey: `history/${randomUUID()}.jpg`, mimeType: "image/jpeg", size: 1234 } });
    const original = await db.supplierCapture.findUniqueOrThrow({ where: { id: env.id("c1") } });
    const manifest: CorrectionManifest = { version: 1, id: randomUUID(), actorId, reviewed: true, reason: "Tarjeta Timekettle inequívoca, revisión humana", context: { userId: env.userId, tripId: env.id("trip"), companyId: env.id("company") }, beforeHash: "", evidence: [{ attachmentId: image.id, storageKey: image.storageKey, size: image.size, sha256: "a".repeat(64) }], operation: { type: "moveAttachment", attachmentId: image.id, sourceCaptureId: env.id("c1"), destinationCaptureId: env.id("c2") } };
    const diagnosis = await diagnoseHistoricalCorrection(db, manifest, staging); manifest.beforeHash = diagnosis.beforeHash;
    let verified = 0;
    await assert.rejects(applyHistoricalCorrection(db, manifest, async () => { throw new Error("bad original hash"); }, staging), /bad original/);
    assert.equal((await db.supplierAttachment.findUniqueOrThrow({ where: { id: image.id } })).supplierCaptureId, env.id("c1"));
    const applied = await applyHistoricalCorrection(db, manifest, async () => { verified++; }, staging); appliedIds.push(manifest.id); assert.equal(applied.idempotent, false); assert.equal(verified, 1);
    assert.equal((await applyHistoricalCorrection(db, manifest, async () => {}, staging)).idempotent, true);
    const moved = await db.supplierAttachment.findUniqueOrThrow({ where: { id: image.id } }); assert.equal(moved.storageKey, image.storageKey); assert.equal(moved.size, image.size); assert.equal(moved.supplierCaptureId, env.id("c2"));
    await revertHistoricalCorrection(db, manifest.id, actorId, staging);
    assert.equal((await db.supplierAttachment.findUniqueOrThrow({ where: { id: image.id } })).supplierCaptureId, env.id("c1"));
    assert.equal((await revertHistoricalCorrection(db, manifest.id, actorId, staging)).idempotent, true);
    assert.equal((await db.supplierCapture.findUniqueOrThrow({ where: { id: env.id("c1") } })).companyName, original.companyName);
    const product = await db.supplierProduct.create({ data: { captureId: env.id("c1"), supplierId: env.id("s1"), name: "Producto clasificado erróneamente" } });
    const invalidation: CorrectionManifest = { ...manifest, id: randomUUID(), beforeHash: "", operation: { type: "invalidateProduct", productId: product.id } }; invalidation.beforeHash = (await diagnoseHistoricalCorrection(db, invalidation, staging)).beforeHash;
    await applyHistoricalCorrection(db, invalidation, async () => {}, staging); appliedIds.push(invalidation.id); assert.ok((await db.supplierProduct.findUniqueOrThrow({ where: { id: product.id } })).invalidatedAt);
    const opContext = { userId: env.userId, tripId: env.id("trip"), companyId: env.id("company") };
    assert.equal((await db.$transaction(tx => productCandidates(tx, opContext, "automation"))).some(p => p.id === product.id), false);
    assert.equal((await db.$transaction(tx => captureProducts(tx, opContext, env.id("c1")))).some(p => p.id === product.id), false);
    await assert.rejects(db.$transaction(tx => getBusinessRecord(tx, opContext, "PRODUCT", product.id)), /no encontrado/);
    await revertHistoricalCorrection(db, invalidation.id, actorId, staging);
    assert.equal((await db.supplierProduct.findUniqueOrThrow({ where: { id: product.id } })).invalidatedAt, null);
    const secondInvalidation = { ...invalidation, id: randomUUID(), beforeHash: "" }; secondInvalidation.beforeHash = (await diagnoseHistoricalCorrection(db, secondInvalidation, staging)).beforeHash;
    await applyHistoricalCorrection(db, secondInvalidation, async () => {}, staging); appliedIds.push(secondInvalidation.id);
    await db.supplierProduct.update({ where: { id: product.id }, data: { notes: "Nota humana posterior" } });
    await assert.rejects(revertHistoricalCorrection(db, secondInvalidation.id, actorId, staging), /cambios posteriores/); assert.equal((await db.supplierProduct.findUniqueOrThrow({ where: { id: product.id } })).notes, "Nota humana posterior");
    const stale = { ...invalidation, id: randomUUID() }; await assert.rejects(applyHistoricalCorrection(db, stale, async () => {}, staging), /estado cambió/);
  } finally { await db.historicalCorrection.deleteMany({ where: { id: { in: appliedIds } } }); await env.cleanup(); await db.user.delete({ where: { id: actorId } }); await db.$disconnect(); }
});
