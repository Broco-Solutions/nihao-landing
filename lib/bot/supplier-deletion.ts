import type { PrismaClient } from "../../generated/prisma/client.ts";
import { deleteSupplierRecord } from "../nihao/operations/delete-records.ts";

/** Archive business records atomically, retaining their original capture and media. */
export async function deleteSupplier(prisma: PrismaClient, userId: string, tripId: string, supplierId: string) {
  const captureId = await prisma.$transaction(tx => deleteSupplierRecord(tx, { userId, tripId }, supplierId));
  console.info("Nihao supplier archived", { supplierId, captureId, tripId, userId });
}
