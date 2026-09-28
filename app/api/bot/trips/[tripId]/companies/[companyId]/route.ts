import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";
import { apiError } from "@/lib/bot/http";
import { requireTripAdmin } from "@/lib/bot/authorization";
import { PrismaTripAccessRepository } from "@/lib/bot/persistence/prisma-trip-access-repository";
import { ValidationError } from "@/lib/bot/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ tripId: string; companyId: string }> }) {
  try {
    const user = await getAuthenticatedUser(); const { tripId, companyId } = await params; const prisma = getPrisma();
    await requireTripAdmin(new PrismaTripAccessRepository(prisma), { userId: user.id, tripId });
    const body = await request.json(); const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 120) throw new ValidationError("Ingresá un nombre de empresa válido");
    let result: { count: number };
    try { result = await prisma.tripCompany.updateMany({ where: { id: companyId, tripId }, data: { name } }); }
    catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new ValidationError("Ya existe una empresa con ese nombre en el viaje"); throw error; }
    if (!result.count) throw new ValidationError("Empresa no encontrada");
    return Response.json({ company: { id: companyId, name } });
  } catch (error) { return apiError(error); }
}
