import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";
import { apiError } from "@/lib/bot/http";
import { agendaOwner, parseAgendaInput } from "@/lib/bot/traveler-agenda";

type Context = { params: Promise<{ tripId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await getAuthenticatedUser();
    const { tripId } = await params;
    const prisma = getPrisma();
    const userId = await agendaOwner(prisma, actor.id, tripId, new URL(request.url).searchParams.get("userId"));
    const entries = await prisma.tripAgendaEntry.findMany({ where: { tripId, userId }, orderBy: [{ date: "asc" }, { time: "asc" }, { createdAt: "asc" }] });
    return Response.json({ entries: entries.map((entry) => ({ ...entry, date: entry.date.toISOString().slice(0, 10) })) });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await getAuthenticatedUser();
    const { tripId } = await params;
    const prisma = getPrisma();
    const body = await request.json() as Record<string, unknown>;
    const userId = await agendaOwner(prisma, actor.id, tripId, typeof body.userId === "string" ? body.userId : null);
    const entry = await prisma.tripAgendaEntry.create({ data: { tripId, userId, ...parseAgendaInput(body) } });
    return Response.json({ entry }, { status: 201 });
  } catch (error) { return apiError(error); }
}
