import { apiError } from "@/lib/bot/http";
import { supplierCaptureRepository } from "@/lib/bot/persistence";
import { parseContext } from "@/lib/bot/validation";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const context = parseContext({ userId: url.searchParams.get("userId"), tripId: url.searchParams.get("tripId") });
    const suppliers = await supplierCaptureRepository.listSuppliers(context);
    return Response.json({ suppliers });
  } catch (error) {
    return apiError(error);
  }
}
