import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";
import { apiError } from "@/lib/bot/http";
import { archiveSupplierDraft } from "@/lib/nihao/operations/supplier-operations";
import { parseTripContext } from "@/lib/bot/validation";
import { ValidationError } from "@/lib/bot/validation";

export async function POST(request: Request, { params }: { params: Promise<{ captureId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { captureId } = await params;
    const body = await request.json();
    const { tripId } = parseTripContext(body);
    if (typeof body.expectedVersion !== "string") throw new ValidationError("Recargá el borrador antes de archivarlo");
    const result = await getPrisma().$transaction((tx) => archiveSupplierDraft(tx, { userId: user.id, tripId }, { captureId, expectedVersion: body.expectedVersion }));
    return Response.json({ archivedAt: result.deletedAt?.toISOString() });
  } catch (error) { return apiError(error); }
}
