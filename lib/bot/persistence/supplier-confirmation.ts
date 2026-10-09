import { createHash } from "node:crypto";
import type { Prisma } from "../../../generated/prisma/client.ts";
import { deriveSupplierStatus, type ContactValue } from "../record-completeness.ts";

/** Caller owns the transaction and authorization. Promotion keeps the original capture. */
export async function reconcileSupplierConfirmation(tx: Prisma.TransactionClient, captureId: string) {
  await tx.$queryRaw`SELECT id FROM "SupplierCapture" WHERE id = ${captureId} FOR UPDATE`;
  const capture = await tx.supplierCapture.findUniqueOrThrow({ where: { id: captureId }, include: { supplier: { include: { contacts: true } } } });
  if (capture.deletedAt || capture.needsReanalysis) return { resourceStatus: capture.status, name: capture.companyNameLatin ?? capture.companyName };
  if (capture.supplier) return { id: capture.supplier.id, name: capture.supplier.companyNameLatin ?? capture.supplier.companyName, resourceStatus: capture.supplier.status };
  const methods = Array.isArray(capture.contactMethods) ? capture.contactMethods as ContactValue[] : [];
  const status = deriveSupplierStatus({ status: capture.status, name: capture.companyNameLatin ?? capture.companyName, contact: capture.contact, contacts: methods });
  if (status === "DRAFT") return { resourceStatus: status, name: capture.companyNameLatin ?? capture.companyName };
  const contacts = [...methods, ...(capture.contact?.trim() ? [{ type: null, rawText: capture.contact.trim() }] : [])];
  const supplier = await tx.supplier.create({ data: {
    id: `was_${createHash("sha256").update(captureId).digest("hex").slice(0, 40)}`,
    captureId, tripId: capture.tripId, companyId: capture.companyId, createdById: capture.createdById,
    status: "CONFIRMED", companyName: capture.companyName, companyNameLatin: capture.companyNameLatin, city: capture.city, province: capture.province,
    notes: capture.notes, category: capture.category, supplierType: capture.supplierType, website: capture.website, interestScore: capture.interestScore,
    fobAmount: capture.fobAmount, fobCurrency: capture.fobCurrency, fobUnit: capture.fobUnit, fobRawText: capture.fobRawText,
    moqQuantity: capture.moqQuantity, moqUnit: capture.moqUnit, moqNotes: capture.moqNotes, moqRawText: capture.moqRawText,
    leadTimeDays: capture.leadTimeDays, leadTimeRawText: capture.leadTimeRawText,
    pendingFields: (Array.isArray(capture.missingFields) ? capture.missingFields.filter((field) => field !== "companyName" && field !== "contact") : []) as Prisma.InputJsonValue,
    ...(contacts.length ? { contacts: { create: contacts.map((contact) => ({ ...contact, tripId: capture.tripId, createdById: capture.createdById })) } } : {}),
  } });
  await tx.supplierCapture.update({ where: { id: captureId }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
  await tx.supplierProduct.updateMany({ where: { captureId, supplierId: null }, data: { supplierId: supplier.id } });
  return { id: supplier.id, name: supplier.companyNameLatin ?? supplier.companyName, resourceStatus: "CONFIRMED" as const, confirmationReason: "NAME_AND_CONTACT_PRESENT" as const };
}
