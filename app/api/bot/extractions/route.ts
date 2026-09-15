import { supplierExtractionService } from "@/lib/bot/extraction";
import { apiError } from "@/lib/bot/http";
import { supplierCaptureRepository } from "@/lib/bot/persistence";
import { parseExtractionRequest } from "@/lib/bot/validation";

export async function POST(request: Request) {
  try {
    const input = parseExtractionRequest(await request.json());
    const extraction = await supplierExtractionService.extract({ source: input.source });
    const capture = await supplierCaptureRepository.createDraft({
      userId: input.userId,
      tripId: input.tripId,
      tripName: input.tripName,
      extraction,
    });
    return Response.json({ capture }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
