import type { Prisma, Supplier } from "../../generated/prisma/client.ts";
import { parseSupplierEdit } from "./supplier-edit.ts";

/** Caller owns the transaction and authorizes the record before applying the patch. */
export async function applySupplierPatch(tx: Prisma.TransactionClient, userId: string, existing: Supplier, body: unknown) {
  const { data, contacts } = parseSupplierEdit(body);
  const pending = new Set(Array.isArray(existing.pendingFields) ? existing.pendingFields.filter((f): f is string => typeof f === "string") : []);
  for (const field of ["companyName", "city", "province", "category", "supplierType", "interestScore"] as const) if (field in data) {
    if (data[field] === null || data[field] === "UNKNOWN") pending.add(field); else pending.delete(field);
  }
  if (contacts) { if (contacts.length) pending.delete("contact"); else pending.add("contact"); }
  await tx.supplier.update({ where: { id: existing.id }, data: { ...data, pendingFields: [...pending] } });
  if (contacts) {
    await tx.supplierContact.deleteMany({ where: { supplierId: existing.id } });
    if (contacts.length) await tx.supplierContact.createMany({ data: contacts.map((c) => ({ ...c, supplierId: existing.id, tripId: existing.tripId, createdById: userId })) });
  }
}
