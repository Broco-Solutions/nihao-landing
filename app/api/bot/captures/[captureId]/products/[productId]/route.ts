import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { apiError } from "@/lib/bot/http";
import { productRecord } from "@/lib/bot/supplier-edit";
import { updateProduct } from "@/lib/nihao/operations/update-product";
import { deleteProduct } from "@/lib/nihao/operations/delete-records";
import { parseTripContext } from "@/lib/bot/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ captureId: string; productId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { captureId, productId } = await params;
    const body = await request.json();
    const { tripId } = parseTripContext(body);
    const product = await getPrisma().$transaction(tx => updateProduct(tx, { userId: user.id, tripId }, { captureId, productId, patch: body }, "web"));
    return Response.json({ product: productRecord(product) });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ captureId: string; productId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { captureId, productId } = await params;
    const { tripId } = parseTripContext({ tripId: new URL(request.url).searchParams.get("tripId") });
    await getPrisma().$transaction(tx => deleteProduct(tx, { userId: user.id, tripId }, { captureId, productId }));
    return new Response(null, { status: 204 });
  } catch (error) { return apiError(error); }
}
