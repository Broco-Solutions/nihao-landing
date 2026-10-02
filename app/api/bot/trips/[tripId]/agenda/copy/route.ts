import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";
import { requireUserAdmin } from "@/lib/bot/authorization";
import { apiError } from "@/lib/bot/http";
import { ValidationError } from "@/lib/bot/validation";
import { agendaCopyRows } from "@/lib/bot/traveler-agenda";

type Target = { tripId: string; userId: string };

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const actor = await getAuthenticatedUser();
    const prisma = getPrisma();
    await requireUserAdmin(prisma, actor.id);
    const { tripId } = await params;
    const body = await request.json() as { userId?: unknown; entryIds?: unknown; targets?: unknown };
    if (typeof body.userId !== "string" || !Array.isArray(body.entryIds) || !Array.isArray(body.targets)) throw new ValidationError("Seleccioná actividades y viajeros de destino");
    const entryIds = [...new Set(body.entryIds)];
    const rawTargets = body.targets as Target[];
    const targets = [...new Map(rawTargets.map((item) => [`${item?.tripId}:${item?.userId}`, item])).values()];
    if (!entryIds.length || entryIds.length > 100 || entryIds.some((id) => typeof id !== "string") || !targets.length || targets.length > 100 || targets.some((target) => !target || typeof target.tripId !== "string" || typeof target.userId !== "string" || !target.tripId || !target.userId || (target.tripId === tripId && target.userId === body.userId))) throw new ValidationError("Seleccioná actividades y otros viajeros válidos");
    const source = await prisma.tripMember.findUnique({ where: { tripId_userId: { tripId, userId: body.userId } }, select: { role: true } });
    if (source?.role !== "TRAVELER") throw new ValidationError("El viajero de origen no pertenece al viaje");
    const entries = await prisma.tripAgendaEntry.findMany({ where: { tripId, userId: body.userId, id: { in: entryIds as string[] } } });
    if (entries.length !== entryIds.length) throw new ValidationError("Hay actividades que no pertenecen a esta agenda");
    const members = await prisma.tripMember.findMany({ where: { OR: targets.map((target) => ({ tripId: target.tripId, userId: target.userId, role: "TRAVELER" })) }, select: { tripId: true, userId: true } });
    if (members.length !== targets.length) throw new ValidationError("Hay viajeros de destino no asignados al viaje seleccionado");
    const copied = await prisma.tripAgendaEntry.createMany({ data: agendaCopyRows(entries, targets) });
    return Response.json({ copied: copied.count });
  } catch (error) { return apiError(error); }
}
