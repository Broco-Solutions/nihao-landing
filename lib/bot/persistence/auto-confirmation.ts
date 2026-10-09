import type { PrismaClient } from "../../../generated/prisma/client.ts";
import { autoConfirmSupplierCapture } from "../../nihao/operations/supplier-operations.ts";
import { getCaptureDetails } from "../../nihao/operations/read-records.ts";
import type { CaptureContext } from "./repository.ts";

/** Initial web loads use the same minimum-field promotion as WhatsApp. */
export async function autoConfirmWebCapture(prisma: PrismaClient, context: CaptureContext, captureId: string) {
  return prisma.$transaction(async (tx) => {
    await autoConfirmSupplierCapture(tx, context, captureId, "web");
    return getCaptureDetails(tx, context, captureId);
  });
}
