import type { Prisma, PrismaClient } from "../../../generated/prisma/client.ts";
import { requireTripTraveler, AuthorizationError } from "../../bot/authorization.ts";
import { mergeNotes } from "../../bot/notes.ts";
import { applySupplierPatch } from "../../bot/record-updates.ts";
import { parseSupplierEdit, supplierCommercialUpdate } from "../../bot/supplier-edit.ts";
import { CaptureConflictError, CaptureNotFoundError } from "../../bot/persistence/repository.ts";
import { PrismaSupplierCaptureRepository } from "../../bot/persistence/prisma-repository.ts";
import { reconcileSupplierConfirmation } from "../../bot/persistence/supplier-confirmation.ts";
import { parseCorrectionRequest, ValidationError } from "../../bot/validation.ts";
import { PrismaTripAccessRepository } from "../../bot/persistence/prisma-trip-access-repository.ts";
import type { Tier1Field } from "../../bot/types.ts";
import { writableCaptureForOperation, type OperationContext, type OperationAccess } from "./capture-access.ts";

function checkVersion(actual: Date, expected?: string) {
  if (expected !== undefined && actual.toISOString() !== expected) throw new CaptureConflictError("El registro cambió. Volvé a consultarlo antes de aplicar la corrección");
}

/** Caller owns the transaction, including any conversational receipt/approval. */
export async function updateSupplier(tx: Prisma.TransactionClient, context: OperationContext, command: { supplierId: string; patch: unknown; expectedVersion?: string }, access: OperationAccess) {
  const ref = await tx.supplier.findFirst({ where: { id: command.supplierId, tripId: context.tripId }, select: { captureId: true } });
  if (!ref) throw new AuthorizationError("Proveedor no encontrado en este viaje");
  await writableCaptureForOperation(tx, context, ref.captureId, access);
  await tx.$queryRaw`SELECT id FROM "Supplier" WHERE id = ${command.supplierId} FOR UPDATE`;
  const existing = await tx.supplier.findUniqueOrThrow({ where: { id: command.supplierId } });
  checkVersion(existing.updatedAt, command.expectedVersion);
  await applySupplierPatch(tx, context.userId, existing, command.patch);
  return tx.supplier.findUniqueOrThrow({ where: { id: existing.id }, include: { contacts: true } });
}

async function lockedCapture(tx: Prisma.TransactionClient, context: OperationContext, captureId: string, access: OperationAccess) {
  await writableCaptureForOperation(tx, context, captureId, access);
  await tx.$queryRaw`SELECT id FROM "SupplierCapture" WHERE id = ${captureId} FOR UPDATE`;
  return writableCaptureForOperation(tx, context, captureId, access);
}

/** Web details keep their existing replacement policy for notes/contacts. */
export async function updateCaptureDetails(tx: Prisma.TransactionClient, context: OperationContext, command: { captureId: string; patch: unknown }) {
  const capture = await lockedCapture(tx, context, command.captureId, "web");
  const { data, contacts } = parseSupplierEdit(command.patch);
  if (Object.keys(data).some(key => !["website", "notes"].includes(key))) throw new ValidationError("Campo de captura inválido");
  return tx.supplierCapture.update({ where: { id: capture.id }, data: {
    ...(capture.supplier ? { status: "DRAFT" as const } : {}),
    ...(data.notes !== undefined ? { notes: data.notes as string | null } : {}),
    ...(data.website !== undefined ? { website: data.website as string | null } : {}),
    ...(contacts ? { contactMethods: contacts } : {}),
  } });
}

/** Automated draft corrections reuse existing field-review/human-correction rules. */
export async function updateSupplierDraft(tx: Prisma.TransactionClient, context: OperationContext, command: { captureId: string; patch: Record<string, unknown>; expectedVersion?: string }) {
  const capture = await lockedCapture(tx, context, command.captureId, "automation");
  if (capture.supplier) throw new CaptureConflictError("La captura ya tiene un proveedor. Consultá el registro actualizado");
  checkVersion(capture.updatedAt, command.expectedVersion);
  const patch = command.patch;
  const allowed = ["notes", "companyName", "city", "province", "category", "supplierType", "interestScore", "contact", "contacts", "website", "fob", "moq", "leadTime"];
  if (Object.keys(patch).some(key => !allowed.includes(key))) throw new ValidationError("Campo de borrador inválido");
  parseSupplierEdit(Object.fromEntries(Object.entries(patch).filter(([key]) => key !== "contact")));
  if ("contact" in patch && patch.contact !== null && typeof patch.contact !== "string") throw new ValidationError("Contacto inválido");
  // Apply the merged commercial patch after all field corrections, so patch
  // ordering cannot overwrite explicitly requested supplier conditions.
  const commercial = {
    fobAmount: capture.fobAmount, fobCurrency: capture.fobCurrency, fobUnit: capture.fobUnit, fobRawText: capture.fobRawText,
    moqQuantity: capture.moqQuantity, moqUnit: capture.moqUnit, moqNotes: capture.moqNotes, moqRawText: capture.moqRawText,
    leadTimeDays: capture.leadTimeDays, leadTimeRawText: capture.leadTimeRawText,
    ...supplierCommercialUpdate(capture, patch),
  };
  const repository = new PrismaSupplierCaptureRepository(tx as PrismaClient);
  for (const [key, value] of Object.entries(patch)) {
    if (["fob", "moq", "leadTime"].includes(key)) continue;
    if (key === "contacts") {
      await tx.supplierCapture.update({ where: { id: capture.id }, data: { contactMethods: parseSupplierEdit({ contacts: value }).contacts! } });
    } else if (key === "notes") {
      await tx.supplierCapture.update({ where: { id: capture.id }, data: { notes: mergeNotes(capture.notes, value) } });
    } else if (key === "website") {
      await tx.supplierCapture.update({ where: { id: capture.id }, data: { website: value as string | null } });
    } else {
      await repository.correctField({ userId: context.userId, tripId: context.tripId, captureId: capture.id, field: key as Tier1Field, value: value as never, acknowledgedUnknown: value === null });
    }
  }
  return tx.supplierCapture.update({ where: { id: capture.id }, data: commercial });
}

/** Automatic minimum-field promotion, distinct from manual reviewed confirmation. */
export async function autoConfirmSupplierCapture(tx: Prisma.TransactionClient, context: OperationContext, captureId: string, access: OperationAccess) {
  await lockedCapture(tx, context, captureId, access);
  return reconcileSupplierConfirmation(tx, captureId);
}

async function lockedManualCapture(tx: Prisma.TransactionClient, context: OperationContext, captureId: string) {
  await requireTripTraveler(new PrismaTripAccessRepository(tx), context);
  // Preserve manual endpoints' missing-resource response before company checks.
  const ref = await tx.supplierCapture.findFirst({ where: { id: captureId, tripId: context.tripId }, select: { id: true } });
  if (!ref) throw new CaptureNotFoundError("Captura no encontrada en este viaje");
  return lockedCapture(tx, context, captureId, "web");
}

/** Human field correction with existing validation and review bookkeeping. */
export async function correctSupplierCapture(tx: Prisma.TransactionClient, context: OperationContext, command: { captureId: string; field: unknown; value: unknown; acknowledgedUnknown?: boolean; expectedVersion?: string }) {
  const parsed = parseCorrectionRequest({ tripId: context.tripId, field: command.field, value: command.value, acknowledgedUnknown: command.acknowledgedUnknown });
  const capture = await lockedManualCapture(tx, context, command.captureId);
  checkVersion(capture.updatedAt, command.expectedVersion);
  return new PrismaSupplierCaptureRepository(tx as PrismaClient).correctField({ ...context, captureId: capture.id, ...parsed.correction, acknowledgedUnknown: parsed.acknowledgedUnknown });
}

/** Reviewed manual confirmation can update an already associated supplier. */
export async function confirmSupplierCapture(tx: Prisma.TransactionClient, context: OperationContext, command: { captureId: string; expectedVersion?: string }) {
  const capture = await lockedManualCapture(tx, context, command.captureId);
  checkVersion(capture.updatedAt, command.expectedVersion);
  return new PrismaSupplierCaptureRepository(tx as PrismaClient).confirmInTransaction(tx, context, capture.id);
}
