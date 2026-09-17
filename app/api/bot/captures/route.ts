import { apiError } from "@/lib/bot/http";
import { PrismaSupplierCaptureRepository } from "@/lib/bot/persistence/prisma-repository";
import { parseTripContext } from "@/lib/bot/validation";
import { EMPTY_TIER_1_DATA, type StructuredExtractionResult } from "@/lib/bot/types";
import { calculateMissingFields } from "@/lib/bot/tier1";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const input = parseTripContext({ tripId: url.searchParams.get("tripId") });
    const user = await getAuthenticatedUser();
    const repository = new PrismaSupplierCaptureRepository(getPrisma());
    const context = { userId: user.id, tripId: input.tripId };
    const [captures, suppliers] = await Promise.all([
      repository.listCaptures(context),
      repository.listSuppliers(context),
    ]);
    return Response.json({ captures, suppliers });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { tripId } = parseTripContext(await request.json());
    const user = await getAuthenticatedUser();
    const extraction: StructuredExtractionResult = {
      rawSource: { type: "TEXT", text: "" }, extractedFields: EMPTY_TIER_1_DATA,
      missingFields: calculateMissingFields(EMPTY_TIER_1_DATA), reviewFields: [], evidence: [],
    };
    const capture = await new PrismaSupplierCaptureRepository(getPrisma()).createDraft({ userId: user.id, tripId, extraction });
    return Response.json({ capture }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
