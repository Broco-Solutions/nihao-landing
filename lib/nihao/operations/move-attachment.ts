import type { Prisma } from "../../../generated/prisma/client.ts";
import { AuthorizationError } from "../../bot/authorization.ts";
import { CaptureConflictError, CaptureNotFoundError } from "../../bot/persistence/repository.ts";
import { TIER_1_FIELDS, type Tier1Field } from "../../bot/types.ts";
import { ValidationError } from "../../bot/validation.ts";

export type AttachmentMoveTarget = { id: string; label: string; status: "DRAFT" | "CONFIRMED" };
export type MoveAttachmentCommand = { sourceCaptureId: string; destinationCaptureId: string; attachmentId: string };

type AssociationHistoryEntry = {
  fromCaptureId: string;
  toCaptureId: string;
  movedById: string;
  movedAt: string;
  previousProductId: string | null;
};

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function history(value: unknown): AssociationHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const entry = item as Record<string, unknown>;
    if (typeof entry.fromCaptureId !== "string" || typeof entry.toCaptureId !== "string" || typeof entry.movedById !== "string" || typeof entry.movedAt !== "string") return [];
    return [{ fromCaptureId: entry.fromCaptureId, toCaptureId: entry.toCaptureId, movedById: entry.movedById, movedAt: entry.movedAt, previousProductId: typeof entry.previousProductId === "string" ? entry.previousProductId : null }];
  });
}

function evidenceFields(value: unknown, humanCorrectedFields: unknown): Tier1Field[] {
  const corrected = new Set(stringList(humanCorrectedFields));
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const field = (item as Record<string, unknown>).field;
    return typeof field === "string" && TIER_1_FIELDS.includes(field as Tier1Field) && !corrected.has(field) ? [field as Tier1Field] : [];
  }))];
}

function productEvidenceWithoutAttachment(value: unknown, attachmentId: string): { value: unknown; removed: boolean; reviewFields: string[] } {
  if (Array.isArray(value)) {
    let removed = false; const reviewFields = new Set<string>(); const items: unknown[] = [];
    for (const item of value) {
      const next = productEvidenceWithoutAttachment(item, attachmentId);
      removed ||= next.removed; next.reviewFields.forEach((field) => reviewFields.add(field));
      if (next.value !== undefined) items.push(next.value);
    }
    return { value: items, removed, reviewFields: [...reviewFields] };
  }
  if (!value || typeof value !== "object") return { value, removed: false, reviewFields: [] };
  const record = value as Record<string, unknown>;
  if (record.attachmentId === attachmentId) {
    const field = typeof record.field === "string" && ["fob", "moq", "leadTime"].includes(record.field) ? [record.field] : [];
    return { value: undefined, removed: true, reviewFields: field };
  }
  let removed = false; const reviewFields = new Set<string>(); const nextRecord: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(record)) {
    const next = productEvidenceWithoutAttachment(nested, attachmentId);
    removed ||= next.removed; next.reviewFields.forEach((field) => reviewFields.add(field));
    if (next.value !== undefined) nextRecord[key] = next.value;
  }
  return { value: nextRecord, removed, reviewFields: [...reviewFields] };
}

async function exactOwnedCapture(tx: Prisma.TransactionClient, userId: string, tripId: string, captureId: string) {
  const capture = await tx.supplierCapture.findUnique({ where: { id: captureId }, include: { supplier: { select: { id: true } } } });
  if (!capture) throw new CaptureNotFoundError("Proveedor de destino no encontrado");
  if (capture.deletedAt) throw new CaptureConflictError("El proveedor fue eliminado y no admite nuevas evidencias");
  if (capture.tripId !== tripId || capture.createdById !== userId) throw new AuthorizationError("No podés mover evidencias a ese proveedor");
  return capture;
}

/** Targets are intentionally narrower than normal shared-company reads. */
export async function listAttachmentMoveTargets(tx: Prisma.TransactionClient, context: { userId: string; tripId: string }, sourceCaptureId: string): Promise<AttachmentMoveTarget[]> {
  const source = await exactOwnedCapture(tx, context.userId, context.tripId, sourceCaptureId);
  const captures = await tx.supplierCapture.findMany({
    where: { id: { not: source.id }, tripId: source.tripId, companyId: source.companyId, createdById: source.createdById, deletedAt: null },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
  });
  return captures.map((capture) => ({
    id: capture.id,
    status: capture.status,
    label: capture.companyNameLatin || capture.companyName || `Captura pendiente · ${capture.createdAt.toISOString().slice(0, 10)}`,
  }));
}

/** Moves only metadata. The immutable R2 key and historical WhatsApp receipts remain untouched. */
export async function moveSupplierAttachment(tx: Prisma.TransactionClient, context: { userId: string; tripId: string }, command: MoveAttachmentCommand) {
  if (!command.destinationCaptureId || command.destinationCaptureId === command.sourceCaptureId) throw new ValidationError("Elegí otro proveedor");

  // The attachment is the shared serialization point for retries or competing destinations.
  await tx.$queryRaw`SELECT id FROM "SupplierAttachment" WHERE id = ${command.attachmentId} FOR UPDATE`;
  // Stable capture order prevents two opposite moves from deadlocking.
  for (const captureId of [command.sourceCaptureId, command.destinationCaptureId].sort()) {
    await tx.$queryRaw`SELECT id FROM "SupplierCapture" WHERE id = ${captureId} FOR UPDATE`;
  }

  const [source, destination, attachment] = await Promise.all([
    exactOwnedCapture(tx, context.userId, context.tripId, command.sourceCaptureId),
    exactOwnedCapture(tx, context.userId, context.tripId, command.destinationCaptureId),
    tx.supplierAttachment.findUnique({ where: { id: command.attachmentId } }),
  ]);
  if (source.companyId !== destination.companyId || source.tripId !== destination.tripId || source.createdById !== destination.createdById) throw new AuthorizationError("Origen y destino deben pertenecer al mismo viajero, empresa y viaje");
  if (!attachment || !["BUSINESS_CARD", "PRODUCT_IMAGE"].includes(attachment.type)) throw new CaptureNotFoundError("Fotografía no encontrada");

  const previousHistory = history(attachment.associationHistory);
  if (attachment.supplierCaptureId === destination.id) {
    const repeated = previousHistory.some((entry) => entry.fromCaptureId === source.id && entry.toCaptureId === destination.id && entry.movedById === context.userId);
    if (repeated) return { attachment, sourceCaptureId: source.id, destinationCaptureId: destination.id, idempotent: true };
  }
  if (attachment.supplierCaptureId !== source.id) throw new CaptureConflictError("La fotografía ya cambió de proveedor. Actualizá la página antes de continuar.");

  const sourceAnalyzedIds = stringList(source.analyzedAttachmentIds);
  const affectedSupplierAnalysis = source.sourceAttachmentId === attachment.id || sourceAnalyzedIds.includes(attachment.id);
  const sourceReviewFields = affectedSupplierAnalysis
    ? [...new Set([...stringList(source.reviewFields), ...evidenceFields(source.evidence, source.humanCorrectedFields)])]
    : stringList(source.reviewFields);
  const replacementSource = source.sourceAttachmentId === attachment.id
    ? await tx.supplierAttachment.findFirst({ where: { supplierCaptureId: source.id, type: "BUSINESS_CARD", id: { not: attachment.id } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } })
    : null;

  if (attachment.productId) {
    const product = await tx.supplierProduct.findUnique({ where: { id: attachment.productId } });
    if (product) {
      const nextEvidence = productEvidenceWithoutAttachment(product.sourceEvidence, attachment.id);
      await tx.supplierProduct.update({
        where: { id: product.id },
        data: {
          ...(nextEvidence.removed ? { sourceEvidence: JSON.parse(JSON.stringify(nextEvidence.value)) as Prisma.InputJsonValue } : {}),
          reviewFields: [...new Set([...stringList(product.reviewFields), ...nextEvidence.reviewFields, "image"])],
        },
      });
    }
  }

  await tx.supplierCapture.update({
    where: { id: source.id },
    data: {
      analyzedAttachmentIds: sourceAnalyzedIds.filter((id) => id !== attachment.id),
      ...(source.sourceAttachmentId === attachment.id ? { sourceAttachmentId: replacementSource?.id ?? null } : {}),
      ...(affectedSupplierAnalysis ? { needsReanalysis: true, reviewFields: sourceReviewFields } : {}),
    },
  });
  if (attachment.type === "BUSINESS_CARD") {
    await tx.supplierCapture.update({ where: { id: destination.id }, data: { needsReanalysis: true } });
  }

  const moved = await tx.supplierAttachment.update({
    where: { id: attachment.id },
    data: {
      supplierCaptureId: destination.id,
      productId: null,
      associationHistory: JSON.parse(JSON.stringify([...previousHistory, {
        fromCaptureId: source.id,
        toCaptureId: destination.id,
        movedById: context.userId,
        movedAt: new Date().toISOString(),
        previousProductId: attachment.productId,
      }])) as Prisma.InputJsonValue,
    },
  });
  return { attachment: moved, sourceCaptureId: source.id, destinationCaptureId: destination.id, idempotent: false };
}
