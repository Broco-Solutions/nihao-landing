import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireUserAdmin } from "@/lib/bot/authorization";
import { companyNameInput } from "@/lib/bot/company-catalog";
import { apiError } from "@/lib/bot/http";
import { ValidationError } from "@/lib/bot/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const prisma = getPrisma();
    await requireUserAdmin(prisma, user.id);
    const { companyId } = await params;
    const { name, normalizedName } = companyNameInput((await request.json())?.name);
    const existing = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!existing) throw new ValidationError("Empresa no encontrada");
    if (await prisma.company.findFirst({ where: { normalizedName, id: { not: companyId } }, select: { id: true } })) {
      throw new ValidationError("Ya existe otra empresa con ese nombre");
    }
    let company: { id: string; name: string };
    try { company = await prisma.company.update({ where: { id: companyId }, data: { name, normalizedName, dedupeKey: normalizedName }, select: { id: true, name: true } }); }
    catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new ValidationError("Ya existe otra empresa con ese nombre"); throw error; }
    return Response.json({ company });
  } catch (error) { return apiError(error); }
}
