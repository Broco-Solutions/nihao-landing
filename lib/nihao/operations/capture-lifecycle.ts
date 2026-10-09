import type { Prisma, PrismaClient } from "../../../generated/prisma/client.ts";
import { AuthorizationError, requireTripTraveler } from "../../bot/authorization.ts";
import { mergeNotes } from "../../bot/notes.ts";
import { PrismaSupplierCaptureRepository } from "../../bot/persistence/prisma-repository.ts";
import { PrismaTripAccessRepository } from "../../bot/persistence/prisma-trip-access-repository.ts";
import { CaptureConflictError, type CreateCaptureInput } from "../../bot/persistence/repository.ts";
import { supplierCommercialUpdate } from "../../bot/supplier-edit.ts";
import type { StructuredExtractionResult } from "../../bot/types.ts";
import { EMPTY_TIER_1_DATA } from "../../bot/types.ts";
import { calculateMissingFields } from "../../bot/tier1.ts";
import { authorizedOperationCompanies, writableCaptureForOperation, type OperationContext, type OperationAccess } from "./capture-access.ts";

async function lock(tx: Prisma.TransactionClient, context: OperationContext, captureId: string, access: OperationAccess) {
  await writableCaptureForOperation(tx, context, captureId, access);
  await tx.$queryRaw`SELECT id FROM "SupplierCapture" WHERE id = ${captureId} FOR UPDATE`;
  return writableCaptureForOperation(tx, context, captureId, access);
}

/** Extraction happens before this operation; caller owns the transaction. */
export async function createSupplierCapture(tx: Prisma.TransactionClient, context: OperationContext, command: Omit<CreateCaptureInput, keyof OperationContext>, access: OperationAccess) {
  await requireTripTraveler(new PrismaTripAccessRepository(tx), context);
  await authorizedOperationCompanies(tx, context, access);
  // Serialize stable-ID retries before implicit extracted products are touched.
  if (command.clientCaptureId) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`capture:${command.clientCaptureId}`}))`;
    const existing = await tx.supplierCapture.findUnique({ where: { id: command.clientCaptureId } });
    if (existing) {
      if (existing.createdById !== context.userId || existing.tripId !== context.tripId || context.companyId && existing.companyId !== context.companyId) throw new AuthorizationError("No podés reutilizar esa captura");
      await writableCaptureForOperation(tx, context, existing.id, access);
      // Replays recover the original result without rewriting implicit products.
      return new PrismaSupplierCaptureRepository(tx as PrismaClient).getCapture(context, existing.id).then(capture => capture!);
    }
  }
  return new PrismaSupplierCaptureRepository(tx as PrismaClient).createDraft({ ...command, ...context });
}

export async function replaceSupplierExtraction(tx: Prisma.TransactionClient, context: OperationContext, command: { captureId: string; extraction: StructuredExtractionResult; analyzedAttachmentIds?: string[]; expectedVersion?: string }, access: OperationAccess) {
  await requireTripTraveler(new PrismaTripAccessRepository(tx), context);
  const capture = await lock(tx, context, command.captureId, access);
  if (command.expectedVersion !== undefined && capture.updatedAt.toISOString() !== command.expectedVersion) throw new CaptureConflictError("La captura cambió durante el análisis. Volvé a analizarla");
  if (command.analyzedAttachmentIds?.length) {
    const count = await tx.supplierAttachment.count({ where: { id: { in: [...new Set(command.analyzedAttachmentIds)] }, supplierCaptureId: capture.id } });
    if (count !== new Set(command.analyzedAttachmentIds).size) throw new AuthorizationError("La evidencia no pertenece a esta captura");
  }
  return new PrismaSupplierCaptureRepository(tx as PrismaClient).replaceExtraction(context, capture.id, command.extraction, { analyzedAttachmentIds: command.analyzedAttachmentIds });
}

/** Trusted ingestion metadata, independent of any conversational data structures. */
export async function enrichSupplierCapture(tx: Prisma.TransactionClient, context: OperationContext, command: { captureId: string; commercial?: Record<string, unknown>; companyNameLatin?: string | null; evidence?: Prisma.InputJsonValue; appendEvidence?: Prisma.InputJsonValue; sourceText?: string; notes?: string }, access: OperationAccess) {
  const capture = await lock(tx, context, command.captureId, access);
  return tx.supplierCapture.update({ where: { id: capture.id }, data: {
    ...(command.commercial ? supplierCommercialUpdate(capture, command.commercial) : {}),
    ...(command.companyNameLatin !== undefined ? { companyNameLatin: command.companyNameLatin } : {}),
    ...(command.evidence !== undefined ? { evidence: command.evidence } : {}),
    ...(command.appendEvidence !== undefined ? { evidence: [...(Array.isArray(capture.evidence) ? capture.evidence : []), command.appendEvidence] as Prisma.InputJsonValue } : {}),
    ...(command.sourceText !== undefined ? { sourceText: command.sourceText } : {}),
    ...(command.notes !== undefined ? { notes: mergeNotes(capture.notes, command.notes) } : {}),
  } });
}

export async function finalizeSupplierEvidence(tx: Prisma.TransactionClient, context: OperationContext, captureId: string, access: OperationAccess) {
  const capture = await lock(tx, context, captureId, access);
  const attachments = await tx.supplierAttachment.findMany({ where: { supplierCaptureId: capture.id, productId: null }, select: { id: true } });
  return tx.supplierCapture.update({ where: { id: capture.id }, data: { sourceAttachmentId: attachments[0]?.id, analyzedAttachmentIds: attachments.map(a => a.id), needsReanalysis: false } });
}

/** Bootstrap original evidence before extraction, preserving legacy empty fields. */
export async function createEmptyEvidenceCapture(tx: Prisma.TransactionClient, context: OperationContext, command: { captureId: string; evidenceId: string }) {
  await requireTripTraveler(new PrismaTripAccessRepository(tx), context);
  await authorizedOperationCompanies(tx, context, "automation");
  if (!context.companyId) throw new AuthorizationError("No hay empresa para esta tarjeta");
  return tx.supplierCapture.create({ data: { id: command.captureId, tripId: context.tripId, companyId: context.companyId, createdById: context.userId, sourceType: "IMAGE_BUSINESS_CARD", sourceAttachmentId: command.evidenceId, missingFields: calculateMissingFields(EMPTY_TIER_1_DATA), reviewFields: [], acknowledgedUnknownFields: [], evidence: [] } });
}

/** Runtime checks its own pending state; business rejects nonempty captures. */
export async function deleteEmptySupplierCapture(tx: Prisma.TransactionClient, context: OperationContext, captureId: string) {
  const capture = await lock(tx, context, captureId, "automation");
  if (capture.createdById !== context.userId || capture.status !== "DRAFT" || capture.supplier || capture.companyName || capture.notes) return false;
  const attachments = await tx.supplierAttachment.count({ where: { supplierCaptureId: capture.id } });
  const products = await tx.supplierProduct.count({ where: { captureId: capture.id } });
  if (attachments || products) return false;
  await tx.supplierCapture.delete({ where: { id: capture.id } });
  return true;
}
