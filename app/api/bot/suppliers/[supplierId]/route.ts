import { deleteSupplier } from "@/lib/bot/supplier-deletion";
import { updateSupplier } from "@/lib/nihao/operations/supplier-operations";
import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { apiError } from "@/lib/bot/http";
import { OperationsCaptureRepository } from "@/lib/nihao/operations/capture-repository-adapter";
import { parseTripContext } from "@/lib/bot/validation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ supplierId: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const { supplierId } = await params;
    const { tripId } = parseTripContext({ tripId: new URL(request.url).searchParams.get("tripId") });
    const supplier = await new OperationsCaptureRepository(getPrisma()).getSupplier({ userId: user.id, tripId }, supplierId);
    if (!supplier) return Response.json({ error: "Proveedor no encontrado en este viaje" }, { status: 404 });
    return Response.json({ supplier });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ supplierId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { supplierId } = await params;
    const body = await request.json();
    const { tripId } = parseTripContext(body);
    const prisma = getPrisma();
    await prisma.$transaction(transaction => updateSupplier(transaction, { userId: user.id, tripId }, { supplierId, patch: body }, "web"));
    const supplier = await new OperationsCaptureRepository(prisma).getSupplier({ userId: user.id, tripId }, supplierId);
    return Response.json({ supplier });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ supplierId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { supplierId } = await params;
    const { tripId } = parseTripContext({ tripId: new URL(request.url).searchParams.get("tripId") });
    await deleteSupplier(getPrisma(), user.id, tripId, supplierId);
    return new Response(null, { status: 204 });
  } catch (error) { return apiError(error); }
}
