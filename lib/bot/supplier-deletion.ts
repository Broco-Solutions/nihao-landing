import type { PrismaClient } from "../../generated/prisma/client.ts";
import { deleteSupplierRecord } from "../nihao/operations/delete-records.ts";

/** Delete business records atomically, retaining private evidence and the original capture.
 * The tombstone prevents the old confirmed capture from recreating a deleted supplier. */
export async function deleteSupplier(prisma: PrismaClient, userId: string, tripId: string, supplierId: string) {
  const captureId = await prisma.$transaction(tx => deleteSupplierRecord(tx, { userId, tripId }, supplierId));
  console.info("Nihao supplier deleted", { supplierId, captureId, tripId, userId });
}
