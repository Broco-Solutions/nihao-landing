import { DEMO_CAPTURE_CONTEXT } from "@/lib/bot/demo-context";
import { apiError } from "@/lib/bot/http";
import { supplierCaptureRepository } from "@/lib/bot/persistence";
import { parseCorrection } from "@/lib/bot/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ captureId: string }> }) {
  try {
    const { captureId } = await params;
    const correction = parseCorrection(await request.json());
    const capture = await supplierCaptureRepository.correctField({
      ...DEMO_CAPTURE_CONTEXT,
      captureId,
      acknowledgedUnknown: correction.acknowledgedUnknown,
      ...correction.correction,
    });
    return Response.json({ capture });
  } catch (error) {
    return apiError(error);
  }
}
