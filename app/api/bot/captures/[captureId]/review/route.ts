import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";
import { apiError } from "@/lib/bot/http";
import { parseTripContext, ValidationError } from "@/lib/bot/validation";
import { reviewSupplierDraft } from "@/lib/nihao/operations/supplier-operations";

export async function POST(request: Request, { params }: { params: Promise<{ captureId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { captureId } = await params;
    const body = await request.json();
    const { tripId } = parseTripContext(body);
    if (typeof body.expectedVersion !== "string") throw new ValidationError("Actualizá el borrador antes de revisarlo");
    const capture = await getPrisma().$transaction((tx) => reviewSupplierDraft(tx, { userId: user.id, tripId }, { captureId, expectedVersion: body.expectedVersion }));
    return Response.json({ reviewedAt: capture.reviewedAt?.toISOString() });
  } catch (error) { return apiError(error); }
}
