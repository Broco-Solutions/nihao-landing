import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.ts";
import { moveSupplierAttachment } from "../nihao/operations/move-attachment.ts";

export type CorrectionProof = { attachmentId: string; storageKey: string; sha256: string; size: number };
export type CorrectionManifest = {
  version: 1; id: string; actorId: string; reviewed: true; reason: string;
  context: { userId: string; tripId: string; companyId: string };
  beforeHash: string; evidence: CorrectionProof[];
  operation: { type: "moveAttachment"; attachmentId: string; sourceCaptureId: string; destinationCaptureId: string } | { type: "invalidateProduct"; productId: string };
};
export type CorrectionSnapshot = { captures: Record<string, unknown>[]; products: Record<string, unknown>[]; attachments: Record<string, unknown>[] };
export type OriginalVerifier = (proof: CorrectionProof) => Promise<void>;

export function assertStagingCorrectionsEnvironment(env: Record<string, string | undefined> = process.env) {
  const db = env.DATABASE_URL ? new URL(env.DATABASE_URL) : null;
  if (env.NIHAO_RUNTIME_ENV !== "staging" || env.RAILWAY_ENVIRONMENT_NAME === "production" || env.VERCEL_ENV === "production" || !db || env.NIHAO_STAGING_DATABASE_HOST !== db.hostname) {
    throw new Error("Las correcciones históricas requieren staging y el hostname explícito de su base aislada");
  }
  if (env.NIHAO_PRODUCTION_DATABASE_HOST && db.hostname === env.NIHAO_PRODUCTION_DATABASE_HOST) throw new Error("No se permiten correcciones en la base de producción");
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
function json<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
export function correctionHash(value: unknown): string { return createHash("sha256").update(JSON.stringify(canonical(json(value)))).digest("hex"); }

export function parseCorrectionManifest(value: unknown): CorrectionManifest {
  const m = value as CorrectionManifest;
  if (!m || m.version !== 1 || !m.id || !m.actorId || m.reviewed !== true || !m.reason?.trim() || !m.context?.userId || !m.context.tripId || !m.context.companyId || typeof m.beforeHash !== "string" || !Array.isArray(m.evidence) || !m.evidence.length) throw new Error("Manifiesto revisado incompleto");
  for (const proof of m.evidence) if (!proof?.attachmentId || !proof.storageKey || !/^[a-f0-9]{64}$/i.test(proof.sha256) || !Number.isInteger(proof.size) || proof.size < 1 || proof.size > 25 * 1024 * 1024) throw new Error("Prueba de original inválida");
  if (m.operation?.type === "moveAttachment") {
    const operation = m.operation;
    if (!m.operation.attachmentId || !m.operation.sourceCaptureId || !m.operation.destinationCaptureId || m.operation.sourceCaptureId === m.operation.destinationCaptureId || !m.evidence.some(p => p.attachmentId === operation.attachmentId)) throw new Error("Movimiento o prueba inválidos");
  } else if (m.operation?.type !== "invalidateProduct" || !m.operation.productId) throw new Error("Operación no permitida");
  return m;
}

async function authorize(tx: Prisma.TransactionClient, manifest: CorrectionManifest) {
  const [actor, membership, owner] = await Promise.all([
    tx.user.findUnique({ where: { id: manifest.actorId }, select: { role: true } }),
    tx.tripMember.findUnique({ where: { tripId_userId: { tripId: manifest.context.tripId, userId: manifest.actorId } }, select: { role: true } }),
    tx.tripCompanyMember.findUnique({ where: { companyId_userId: { companyId: manifest.context.companyId, userId: manifest.context.userId } }, select: { userId: true } }),
  ]);
  if (actor?.role !== "ADMIN" || membership?.role !== "ADMIN" || !owner) throw new Error("La corrección requiere un administrador del viaje y un viajero de la empresa");
}

async function snapshot(tx: Prisma.TransactionClient, manifest: CorrectionManifest, seed?: CorrectionSnapshot): Promise<CorrectionSnapshot> {
  let captureIds: string[], productIds: string[];
  if (seed) { captureIds = seed.captures.map(c => String(c.id)); productIds = seed.products.map(p => String(p.id)); }
  else if (manifest.operation.type === "moveAttachment") {
    captureIds = [manifest.operation.sourceCaptureId, manifest.operation.destinationCaptureId];
    const attachment = await tx.supplierAttachment.findUniqueOrThrow({ where: { id: manifest.operation.attachmentId } });
    productIds = attachment.productId ? [attachment.productId] : [];
  } else {
    const product = await tx.supplierProduct.findUniqueOrThrow({ where: { id: manifest.operation.productId } });
    productIds = [product.id]; captureIds = [product.captureId];
  }
  const captures = await tx.supplierCapture.findMany({ where: { id: { in: captureIds } }, orderBy: { id: "asc" } });
  if (captures.length !== new Set(captureIds).size || captures.some(c => c.deletedAt || c.tripId !== manifest.context.tripId || c.companyId !== manifest.context.companyId || c.createdById !== manifest.context.userId)) throw new Error("La corrección cruza propietario, empresa o viaje, o una captura eliminada");
  const products = await tx.supplierProduct.findMany({ where: { id: { in: productIds } }, orderBy: { id: "asc" } });
  if (products.length !== productIds.length || products.some(p => !captureIds.includes(p.captureId))) throw new Error("Producto ajeno a las capturas revisadas");
  // Include every attachment on affected captures, not only the moved photo, to
  // detect concurrent uploads/associations before application or reversal.
  const attachments = await tx.supplierAttachment.findMany({ where: { OR: [{ supplierCaptureId: { in: captureIds } }, { id: { in: manifest.evidence.map(p => p.attachmentId) } }] }, orderBy: { id: "asc" } });
  for (const proof of manifest.evidence) {
    const attachment = attachments.find(a => a.id === proof.attachmentId);
    if (!attachment || !captureIds.includes(attachment.supplierCaptureId) || attachment.storageKey !== proof.storageKey || attachment.size !== proof.size) throw new Error("El original no corresponde al contexto o cambió su descriptor");
  }
  return json({ captures, products, attachments }) as unknown as CorrectionSnapshot;
}

async function lockAffected(tx: Prisma.TransactionClient, manifest: CorrectionManifest) {
  // One transaction/advisory lock per correction id serializes retries. Capture
  // locks use the same ordering as the normal image move operation.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${manifest.id}))`;
  const ids = manifest.operation.type === "moveAttachment" ? [manifest.operation.sourceCaptureId, manifest.operation.destinationCaptureId] : [(await tx.supplierProduct.findUniqueOrThrow({ where: { id: manifest.operation.productId } })).captureId];
  if (manifest.operation.type === "moveAttachment") await tx.$queryRaw`SELECT id FROM "SupplierAttachment" WHERE id = ${manifest.operation.attachmentId} FOR UPDATE`;
  for (const id of [...new Set(ids)].sort()) await tx.$queryRaw`SELECT id FROM "SupplierCapture" WHERE id = ${id} FOR UPDATE`;
  for (const id of ids) await tx.$queryRaw`SELECT id FROM "SupplierProduct" WHERE "captureId" = ${id} ORDER BY id FOR UPDATE`;
}

export async function diagnoseHistoricalCorrection(db: PrismaClient, input: CorrectionManifest, env?: Record<string, string | undefined>) {
  assertStagingCorrectionsEnvironment(env); const manifest = parseCorrectionManifest(input);
  return db.$transaction(async tx => { await authorize(tx, manifest); const before = await snapshot(tx, manifest); return { id: manifest.id, beforeHash: correctionHash(before), before, operation: manifest.operation, applicable: !manifest.beforeHash || manifest.beforeHash === correctionHash(before) }; });
}

export async function applyHistoricalCorrection(db: PrismaClient, input: CorrectionManifest, verifyOriginal: OriginalVerifier, env?: Record<string, string | undefined>) {
  assertStagingCorrectionsEnvironment(env); const manifest = parseCorrectionManifest(input);
  if (!/^[a-f0-9]{64}$/.test(manifest.beforeHash)) throw new Error("Primero diagnosticá y fijá el hash del estado revisado");
  // Read originals without changing them. Network I/O is outside DB locks;
  // descriptor/state verification is repeated inside the transaction.
  for (const proof of manifest.evidence) await verifyOriginal(proof);
  return db.$transaction(async tx => {
    await authorize(tx, manifest); await lockAffected(tx, manifest);
    const prior = await tx.historicalCorrection.findUnique({ where: { id: manifest.id } });
    const manifestHash = correctionHash(manifest);
    if (prior) { if (prior.manifestHash !== manifestHash || prior.status !== "APPLIED") throw new Error("ID de corrección reutilizado o ya revertido"); return { id: prior.id, idempotent: true }; }
    const before = await snapshot(tx, manifest);
    if (correctionHash(before) !== manifest.beforeHash) throw new Error("El estado cambió después de la revisión; no se aplicó la corrección");
    if (manifest.operation.type === "moveAttachment") await moveSupplierAttachment(tx, { userId: manifest.context.userId, tripId: manifest.context.tripId }, manifest.operation);
    else {
      if (before.products.some(product => product.invalidatedAt)) throw new Error("El producto ya está invalidado; revisá su auditoría previa");
      await tx.supplierProduct.update({ where: { id: manifest.operation.productId }, data: { invalidatedAt: new Date(), invalidationReason: manifest.reason } });
    }
    const after = await snapshot(tx, manifest, before);
    await tx.historicalCorrection.create({ data: { id: manifest.id, actorId: manifest.actorId, manifestHash, evidence: json(manifest) as unknown as Prisma.InputJsonValue, beforeSnapshot: before as unknown as Prisma.InputJsonValue, afterSnapshot: after as unknown as Prisma.InputJsonValue } });
    return { id: manifest.id, idempotent: false, beforeHash: correctionHash(before), afterHash: correctionHash(after) };
  }, { timeout: 30_000, isolationLevel: "Serializable" });
}

export async function revertHistoricalCorrection(db: PrismaClient, id: string, actorId: string, env?: Record<string, string | undefined>) {
  assertStagingCorrectionsEnvironment(env);
  return db.$transaction(async tx => {
    const record = await tx.historicalCorrection.findUniqueOrThrow({ where: { id } });
    const manifest = parseCorrectionManifest(record.evidence); await authorize(tx, { ...manifest, actorId }); await lockAffected(tx, manifest);
    const fresh = await tx.historicalCorrection.findUniqueOrThrow({ where: { id } });
    if (fresh.status === "REVERTED") return { id, idempotent: true };
    const before = record.beforeSnapshot as unknown as CorrectionSnapshot, after = record.afterSnapshot as unknown as CorrectionSnapshot;
    const current = await snapshot(tx, manifest, before);
    if (correctionHash(current) !== correctionHash(after)) throw new Error("Hubo cambios posteriores; la reversión no sobrescribirá datos");
    for (const attachment of before.attachments) {
      const next = after.attachments.find(a => a.id === attachment.id);
      if (correctionHash(attachment) !== correctionHash(next)) await tx.supplierAttachment.update({ where: { id: String(attachment.id) }, data: { supplierCaptureId: String(attachment.supplierCaptureId), productId: attachment.productId as string | null, associationHistory: attachment.associationHistory as Prisma.InputJsonValue } });
    }
    for (const capture of before.captures) await tx.supplierCapture.update({ where: { id: String(capture.id) }, data: { analyzedAttachmentIds: capture.analyzedAttachmentIds as Prisma.InputJsonValue, sourceAttachmentId: capture.sourceAttachmentId as string | null, needsReanalysis: Boolean(capture.needsReanalysis), reviewFields: capture.reviewFields as Prisma.InputJsonValue, updatedAt: new Date(String(capture.updatedAt)) } });
    for (const product of before.products) await tx.supplierProduct.update({ where: { id: String(product.id) }, data: { sourceEvidence: product.sourceEvidence as Prisma.InputJsonValue, reviewFields: product.reviewFields as Prisma.InputJsonValue, invalidatedAt: product.invalidatedAt ? new Date(String(product.invalidatedAt)) : null, invalidationReason: product.invalidationReason as string | null, updatedAt: new Date(String(product.updatedAt)) } });
    await tx.historicalCorrection.update({ where: { id }, data: { status: "REVERTED", revertedAt: new Date() } });
    return { id, idempotent: false };
  }, { timeout: 30_000, isolationLevel: "Serializable" });
}
