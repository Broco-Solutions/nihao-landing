import { getCaptureDetails } from "@/lib/nihao/operations/read-records";
import { autoConfirmSupplierCapture, correctSupplierCapture } from "@/lib/nihao/operations/supplier-operations";
import { apiError } from "@/lib/bot/http";
import { OperationsCaptureRepository } from "@/lib/nihao/operations/capture-repository-adapter";
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
    const capture = await new OperationsCaptureRepository(getPrisma()).getCapture({ userId: user.id, tripId: input.tripId }, captureId);
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
    const capture = await getPrisma().$transaction(async tx => {
      const context = { captureId, userId: user.id, tripId: correction.tripId };
      const corrected = await correctSupplierCapture(tx, context, { captureId, acknowledgedUnknown: correction.acknowledgedUnknown, ...correction.correction });
      await autoConfirmSupplierCapture(tx, context, captureId, "web");
      return await getCaptureDetails(tx, context, captureId) ?? corrected;
    });
    return Response.json({ capture });
  } catch (error) {
    return apiError(error);
  }
}
