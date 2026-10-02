import type { PrismaClient } from "../../generated/prisma/client.ts";
import { AuthorizationError, isUserAdmin } from "./authorization.ts";
import { ValidationError } from "./validation.ts";

export type AgendaInput = { date: Date; time: string; place: string; address: string; instructions: string | null };

export function parseAgendaInput(body: Record<string, unknown>): AgendaInput {
  const dateText = typeof body.date === "string" ? body.date : "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateText) ? new Date(`${dateText}T00:00:00.000Z`) : new Date(NaN);
  const time = typeof body.time === "string" ? body.time : "";
  const place = typeof body.place === "string" ? body.place.trim() : "";
  const address = typeof body.address === "string" ? body.address.trim() : "";
  const instructions = typeof body.instructions === "string" ? body.instructions.trim() : "";
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dateText || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !place || !address || place.length > 160 || address.length > 300 || instructions.length > 2000) {
    throw new ValidationError("Completá fecha, hora, lugar y dirección válidos");
  }
  return { date, time, place, address, instructions: instructions || null };
}

export async function agendaOwner(prisma: PrismaClient, actorId: string, tripId: string, requestedUserId?: string | null) {
  const userId = requestedUserId || actorId;
  if (userId !== actorId && !(await isUserAdmin(prisma, actorId))) throw new AuthorizationError("No tenés acceso a esta agenda");
  const member = await prisma.tripMember.findUnique({ where: { tripId_userId: { tripId, userId } }, select: { role: true } });
  if (member?.role !== "TRAVELER") throw new AuthorizationError("El viajero no pertenece a este viaje");
  return userId;
}

export function agendaCopyRows(
  entries: Array<{ date: Date; time: string; place: string; address: string; instructions: string | null }>,
  targets: Array<{ tripId: string; userId: string }>,
) {
  return targets.flatMap((target) => entries.map((entry) => ({ tripId: target.tripId, userId: target.userId, date: entry.date, time: entry.time, place: entry.place, address: entry.address, instructions: entry.instructions })));
}
