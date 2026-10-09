import { confirmSupplierCapture } from "@/lib/nihao/operations/supplier-operations";
import { apiError } from "@/lib/bot/http";
import { parseTripContext } from "@/lib/bot/validation";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ captureId: string }> },
) {
  try {
    const { captureId } = await params;
    const input = parseTripContext(await request.json());
    const user = await getAuthenticatedUser();
    const result = await getPrisma().$transaction(tx => confirmSupplierCapture(tx, { userId: user.id, tripId: input.tripId }, { captureId }));
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}
