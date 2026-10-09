import { autoConfirmSupplierCapture, updateCaptureDetails } from "@/lib/nihao/operations/supplier-operations";
import { getCaptureDetails } from "@/lib/nihao/operations/read-records";
import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { apiError } from "@/lib/bot/http";
import { parseTripContext } from "@/lib/bot/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ captureId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { captureId } = await params;
    const body = await request.json();
    const { tripId } = parseTripContext(body);
    const prisma = getPrisma();
    const result = await prisma.$transaction(async tx => {
      const context = { userId: user.id, tripId };
      const updated = await updateCaptureDetails(tx, context, { captureId, patch: body });
      await autoConfirmSupplierCapture(tx, context, captureId, "web");
      const capture = await getCaptureDetails(tx, context, captureId);
      return { website: updated.website, contactMethods: updated.contactMethods, capture };
    });
    return Response.json(result);
  } catch (error) { return apiError(error); }
}
