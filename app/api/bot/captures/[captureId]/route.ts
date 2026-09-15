import { apiError } from "@/lib/bot/http";
import { supplierCaptureRepository } from "@/lib/bot/persistence";
import { parseCorrectionRequest } from "@/lib/bot/validation";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ captureId: string }> },
) {
  try {
    const { captureId } = await params;
    const correction = parseCorrectionRequest(await request.json());
    const capture = await supplierCaptureRepository.correctField({
      captureId,
      userId: correction.userId,
      tripId: correction.tripId,
      acknowledgedUnknown: correction.acknowledgedUnknown,
      ...correction.correction,
    });
    return Response.json({ capture });
  } catch (error) {
    return apiError(error);
  }
}
