import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";
import { apiError } from "@/lib/bot/http";
import { requireTripAdmin, requireTripMember, requireUserAdmin } from "@/lib/bot/authorization";
import { PrismaTripAccessRepository } from "@/lib/bot/persistence/prisma-trip-access-repository";
import { ValidationError } from "@/lib/bot/validation";

export async function GET(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const user = await getAuthenticatedUser(); const { tripId } = await params; const prisma = getPrisma();
    const membership = await requireTripMember(new PrismaTripAccessRepository(prisma), { userId: user.id, tripId });
    const rows = await prisma.tripCompany.findMany({
      where: { tripId, active: true, ...(membership.role === "ADMIN" ? {} : { members: { some: { userId: user.id } } }) },
      select: { id: true, catalogCompanyId: true, catalogCompany: { select: { name: true } } },
      orderBy: { catalogCompany: { name: "asc" } },
    });
    return Response.json({ companies: rows.map((row) => ({ id: row.id, catalogCompanyId: row.catalogCompanyId, name: row.catalogCompany.name })) });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const user = await getAuthenticatedUser(); const { tripId } = await params; const prisma = getPrisma();
    await requireUserAdmin(prisma, user.id);
    await requireTripAdmin(new PrismaTripAccessRepository(prisma), { userId: user.id, tripId });
    const body = await request.json();
    const catalogCompanyId = typeof body?.catalogCompanyId === "string" ? body.catalogCompanyId : "";
    const catalogCompany = await prisma.company.findUnique({ where: { id: catalogCompanyId }, select: { name: true } });
    if (!catalogCompany) throw new ValidationError("Elegí una empresa del catálogo");
    const assignment = await prisma.tripCompany.upsert({
      where: { tripId_catalogCompanyId: { tripId, catalogCompanyId } },
      create: { tripId, catalogCompanyId },
      update: { active: true },
      select: { id: true },
    });
    return Response.json({ company: { id: assignment.id, catalogCompanyId, name: catalogCompany.name } });
  } catch (error) { return apiError(error); }
}
