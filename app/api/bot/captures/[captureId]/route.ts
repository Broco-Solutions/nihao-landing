import { apiError } from "@/lib/bot/http";
import { PrismaSupplierCaptureRepository } from "@/lib/bot/persistence/prisma-repository";
import { parseCorrectionRequest } from "@/lib/bot/validation";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ captureId: string }> },
) {
  try {
    const { captureId } = await params;
    const correction = parseCorrectionRequest(await request.json());
    const user = await getAuthenticatedUser();
    const capture = await new PrismaSupplierCaptureRepository(getPrisma()).correctField({
      captureId,
      userId: user.id,
      tripId: correction.tripId,
      acknowledgedUnknown: correction.acknowledgedUnknown,
      ...correction.correction,
    });
    return Response.json({ capture });
  } catch (error) {
    return apiError(error);
  }
}
