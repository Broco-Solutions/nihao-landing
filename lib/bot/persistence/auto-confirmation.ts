import type { PrismaClient } from "../../../generated/prisma/client.ts";
import { reconcileSupplierConfirmation } from "./supplier-confirmation.ts";
import { PrismaSupplierCaptureRepository } from "./prisma-repository.ts";
import type { CaptureContext } from "./repository.ts";

/** Initial web loads use the same minimum-field promotion as WhatsApp. */
export async function autoConfirmWebCapture(prisma: PrismaClient, context: CaptureContext, captureId: string) {
  return prisma.$transaction(async (tx) => {
    await reconcileSupplierConfirmation(tx, captureId);
    return new PrismaSupplierCaptureRepository(tx as PrismaClient).getCapture(context, captureId);
  });
}
