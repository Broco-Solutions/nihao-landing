import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";
import { apiError } from "@/lib/bot/http";
import { AuthorizationError, isUserAdmin } from "@/lib/bot/authorization";
import { parseAgendaInput } from "@/lib/bot/traveler-agenda";

type Context = { params: Promise<{ tripId: string; entryId: string }> };

async function authorizedEntry(params: Context["params"]) {
  const actor = await getAuthenticatedUser();
  const { tripId, entryId } = await params;
  const prisma = getPrisma();
  const entry = await prisma.tripAgendaEntry.findFirst({ where: { id: entryId, tripId }, select: { id: true, userId: true } });
  if (!entry || (entry.userId !== actor.id && !(await isUserAdmin(prisma, actor.id)))) throw new AuthorizationError("No tenés acceso a esta actividad");
  return { prisma, entryId };
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { prisma, entryId } = await authorizedEntry(params);
    const data = parseAgendaInput(await request.json() as Record<string, unknown>);
    return Response.json({ entry: await prisma.tripAgendaEntry.update({ where: { id: entryId }, data }) });
  } catch (error) { return apiError(error); }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { prisma, entryId } = await authorizedEntry(params);
    await prisma.tripAgendaEntry.delete({ where: { id: entryId } });
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
