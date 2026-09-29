import { requireTripTraveler } from "@/lib/bot/authorization";
import { PrismaTripAccessRepository } from "@/lib/bot/persistence/prisma-trip-access-repository";
import { apiError } from "@/lib/bot/http";
import { PrismaSupplierCaptureRepository } from "@/lib/bot/persistence/prisma-repository";
import { parseCreateCaptureRequest, parseTripContext } from "@/lib/bot/validation";
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
    const body = await request.json();
    const { tripId, clientCaptureId } = parseCreateCaptureRequest(body);
    const companyId = typeof body.companyId === "string" ? body.companyId : undefined;
    const user = await getAuthenticatedUser();
    await requireTripTraveler(new PrismaTripAccessRepository(getPrisma()), { userId: user.id, tripId });
    const extraction: StructuredExtractionResult = {
      rawSource: { type: "TEXT", text: "" }, extractedFields: EMPTY_TIER_1_DATA,
      missingFields: calculateMissingFields(EMPTY_TIER_1_DATA), reviewFields: [], evidence: [],
    };
    const capture = await new PrismaSupplierCaptureRepository(getPrisma()).createDraft({ userId: user.id, tripId, companyId, clientCaptureId, extraction });
    return Response.json({ capture }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
