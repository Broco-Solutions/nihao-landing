import { apiError } from "@/lib/bot/http";
import { supplierCaptureRepository } from "@/lib/bot/persistence";
import { parseContext } from "@/lib/bot/validation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ captureId: string }> },
) {
  try {
    const { captureId } = await params;
    const context = parseContext(await request.json());
    const result = await supplierCaptureRepository.confirm(context, captureId);
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}
