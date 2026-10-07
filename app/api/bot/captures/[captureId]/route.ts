import type { PrismaClient } from "@/generated/prisma/client";
import { reconcileSupplierConfirmation } from "@/lib/bot/persistence/supplier-confirmation";
import { requireTripTraveler } from "@/lib/bot/authorization";
import { PrismaTripAccessRepository } from "@/lib/bot/persistence/prisma-trip-access-repository";
import { apiError } from "@/lib/bot/http";
import { PrismaSupplierCaptureRepository } from "@/lib/bot/persistence/prisma-repository";
import { parseCorrectionRequest, parseTripContext } from "@/lib/bot/validation";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ captureId: string }> },
) {
  try {
    const { captureId } = await params;
    const tripId = new URL(request.url).searchParams.get("tripId");
    const input = parseTripContext({ tripId });
    const user = await getAuthenticatedUser();
    const capture = await new PrismaSupplierCaptureRepository(getPrisma()).getCapture({ userId: user.id, tripId: input.tripId }, captureId);
    if (!capture) return Response.json({ error: "Captura no encontrada en este viaje" }, { status: 404 });
    return Response.json({ capture });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ captureId: string }> },
) {
  try {
    const { captureId } = await params;
    const correction = parseCorrectionRequest(await request.json());
    const user = await getAuthenticatedUser();
    await requireTripTraveler(new PrismaTripAccessRepository(getPrisma()), { userId: user.id, tripId: correction.tripId });
    const capture = await getPrisma().$transaction(async tx => {
      // Corrections and automatic promotion commit together; lock before reading the draft.
      await tx.$queryRaw`SELECT id FROM "SupplierCapture" WHERE id = ${captureId} FOR UPDATE`;
      const repository = new PrismaSupplierCaptureRepository(tx as PrismaClient);
      const context = { captureId, userId: user.id, tripId: correction.tripId };
      const corrected = await repository.correctField({ ...context, acknowledgedUnknown: correction.acknowledgedUnknown, ...correction.correction });
      const stored = await tx.supplierCapture.findUniqueOrThrow({ where: { id: captureId } });
      // Preserve the legacy manual workflow for captures outside automatic card ingestion.
      if (Array.isArray(stored.evidence) && stored.evidence.some(e => e && typeof e === "object" && "kind" in e && e.kind === "WHATSAPP_CAPTURE_PROVENANCE")) {
        await reconcileSupplierConfirmation(tx, captureId);
        return repository.getCapture(context, captureId);
      }
      return corrected;
    });
    return Response.json({ capture });
  } catch (error) {
    return apiError(error);
  }
}
