import { supplierExtractionService } from "@/lib/bot/extraction";
import { apiError } from "@/lib/bot/http";
import { PrismaSupplierCaptureRepository } from "@/lib/bot/persistence/prisma-repository";
import { parseExtractionRequest } from "@/lib/bot/validation";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";

export async function POST(request: Request) {
  try {
    const input = parseExtractionRequest(await request.json());
    const user = await getAuthenticatedUser();
    const extraction = await supplierExtractionService.extract({ source: input.source });
    const capture = await new PrismaSupplierCaptureRepository(getPrisma()).createDraft({
      userId: user.id,
      tripId: input.tripId,
      extraction,
    });
    return Response.json({ capture }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
