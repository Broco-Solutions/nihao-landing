import type { PrismaClient } from "../../generated/prisma/client.ts";
import { writableSupplier } from "./supplier-edit.ts";
import { CaptureConflictError } from "./persistence/repository.ts";

/** Delete business records atomically, retaining private evidence and the original capture.
 * The tombstone prevents the old confirmed capture from recreating a deleted supplier. */
export async function deleteSupplier(prisma: PrismaClient, userId: string, tripId: string, supplierId: string) {
  const captureId = await prisma.$transaction(async tx => {
    const supplier = await writableSupplier(tx, userId, tripId, supplierId);
    await tx.$queryRaw`SELECT id FROM "SupplierCapture" WHERE id = ${supplier.captureId} FOR UPDATE`;
    const capture = await tx.supplierCapture.findUniqueOrThrow({ where: { id: supplier.captureId } });
    if (capture.tripId !== tripId || capture.companyId !== supplier.companyId) throw new CaptureConflictError("El proveedor cambió de contexto. Actualizá la página antes de eliminarlo.");
    await tx.supplierCapture.update({ where: { id: capture.id }, data: { deletedAt: new Date(), deletedById: userId } });
    // Remove this capture’s unassigned drafts; confirmed products cascade from Supplier.
    // SetNull keeps image objects/attachment evidence when products are removed.
    await tx.supplierProduct.deleteMany({ where: { captureId: capture.id, supplierId: null } });
    // SupplierContact cascades from Supplier. No storage objects are deleted.
    await tx.supplier.delete({ where: { id: supplierId, tripId, companyId: supplier.companyId } });
    return capture.id;
  });
  console.info("Nihao supplier deleted", { supplierId, captureId, tripId, userId });
}
