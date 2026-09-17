import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { apiError } from "@/lib/bot/http";
import { PrismaSupplierCaptureRepository } from "@/lib/bot/persistence/prisma-repository";
import { parseTripContext } from "@/lib/bot/validation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ supplierId: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const { supplierId } = await params;
    const { tripId } = parseTripContext({ tripId: new URL(request.url).searchParams.get("tripId") });
    const supplier = await new PrismaSupplierCaptureRepository(getPrisma()).getSupplier({ userId: user.id, tripId }, supplierId);
    if (!supplier) return Response.json({ error: "Proveedor no encontrado en este viaje" }, { status: 404 });
    return Response.json({ supplier });
  } catch (error) {
    return apiError(error);
  }
}
