import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";
import { apiError } from "@/lib/bot/http";
import { requireTripAdmin, requireTripMember } from "@/lib/bot/authorization";
import { PrismaTripAccessRepository } from "@/lib/bot/persistence/prisma-trip-access-repository";
import { ValidationError } from "@/lib/bot/validation";

export async function GET(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const user = await getAuthenticatedUser(); const { tripId } = await params; const prisma = getPrisma();
    const membership = await requireTripMember(new PrismaTripAccessRepository(prisma), { userId: user.id, tripId });
    const companies = await prisma.tripCompany.findMany({ where: { tripId, ...(membership.role === "ADMIN" ? {} : { members: { some: { userId: user.id } } }) }, select: { id: true, name: true }, orderBy: { name: "asc" } });
    return Response.json({ companies });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const user = await getAuthenticatedUser(); const { tripId } = await params; const prisma = getPrisma();
    await requireTripAdmin(new PrismaTripAccessRepository(prisma), { userId: user.id, tripId });
    const body = await request.json(); const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 120) throw new ValidationError("Ingresá un nombre de empresa válido");
    let company: { id: string; name: string };
    try { company = await prisma.tripCompany.create({ data: { tripId, name }, select: { id: true, name: true } }); }
    catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new ValidationError("Ya existe una empresa con ese nombre en el viaje"); throw error; }
    return Response.json({ company }, { status: 201 });
  } catch (error) { return apiError(error); }
}
