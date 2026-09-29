import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireUserAdmin } from "@/lib/bot/authorization";
import { companyNameInput } from "@/lib/bot/company-catalog";
import { apiError } from "@/lib/bot/http";
import { ValidationError } from "@/lib/bot/validation";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const prisma = getPrisma();
    await requireUserAdmin(prisma, user.id);
    const search = new URL(request.url).searchParams.get("search")?.trim().replace(/\s+/g, " ").slice(0, 120).toLocaleLowerCase("es") ?? "";
    const companies = await prisma.company.findMany({
      where: search ? { normalizedName: { contains: search } } : {},
      select: { id: true, name: true, _count: { select: { trips: { where: { active: true } } } }, trips: { where: { active: true }, select: { trip: { select: { name: true } } }, take: 3 } },
      orderBy: { name: "asc" },
      take: 100,
    });
    return Response.json({ companies: companies.map((company) => ({ id: company.id, name: company.name, tripCount: company._count.trips, tripNames: company.trips.map((assignment) => assignment.trip.name) })) });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    const prisma = getPrisma();
    await requireUserAdmin(prisma, user.id);
    const { name, normalizedName } = companyNameInput((await request.json())?.name);
    if (await prisma.company.findFirst({ where: { normalizedName }, select: { id: true } })) {
      throw new ValidationError("Ya existe una empresa con ese nombre. Buscala y asignala al viaje.");
    }
    let company: { id: string; name: string };
    try { company = await prisma.company.create({ data: { name, normalizedName, dedupeKey: normalizedName }, select: { id: true, name: true } }); }
    catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new ValidationError("Ya existe una empresa con ese nombre. Buscala en el catálogo."); throw error; }
    return Response.json({ company }, { status: 201 });
  } catch (error) { return apiError(error); }
}
