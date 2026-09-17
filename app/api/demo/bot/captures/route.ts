import { DEMO_CAPTURE_CONTEXT } from "@/lib/bot/demo-context";
import { apiError } from "@/lib/bot/http";
import { supplierCaptureRepository } from "@/lib/bot/persistence";

export async function GET() {
  try {
    const suppliers = await supplierCaptureRepository.listSuppliers(DEMO_CAPTURE_CONTEXT);
    return Response.json({ suppliers });
  } catch (error) {
    return apiError(error);
  }
}
