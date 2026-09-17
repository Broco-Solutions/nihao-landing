import { DEMO_CAPTURE_CONTEXT } from "@/lib/bot/demo-context";
import { supplierExtractionService } from "@/lib/bot/extraction";
import { apiError } from "@/lib/bot/http";
import { supplierCaptureRepository } from "@/lib/bot/persistence";
import { parseTextSource } from "@/lib/bot/validation";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { source: unknown };
    const extraction = await supplierExtractionService.extract({ source: parseTextSource(body.source) });
    const capture = await supplierCaptureRepository.createDraft({ ...DEMO_CAPTURE_CONTEXT, extraction });
    return Response.json({ capture }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
