import { DEMO_CAPTURE_CONTEXT } from "@/lib/bot/demo-context";
import { apiError } from "@/lib/bot/http";
import { supplierCaptureRepository } from "@/lib/bot/persistence";

export async function POST(_request: Request, { params }: { params: Promise<{ captureId: string }> }) {
  try {
    const { captureId } = await params;
    const result = await supplierCaptureRepository.confirm(DEMO_CAPTURE_CONTEXT, captureId);
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}
