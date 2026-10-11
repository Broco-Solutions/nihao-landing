import type { PrismaClient } from "../../generated/prisma/client.ts";

export async function resolveTripForUser(prisma: PrismaClient, userId: string, routeKey: string) {
  return prisma.trip.findFirst({ where: { OR: [{ id: routeKey }, { publicSlug: routeKey }], members: { some: { userId } } }, select: { id: true, publicSlug: true, name: true, members: { where: { userId }, select: { role: true } } } });
}
