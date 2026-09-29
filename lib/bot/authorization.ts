import type { CaptureContext, TripAccessRepository, TripMembership, TripRoleRepository } from "./persistence/repository.ts";
import type { PrismaClient } from "../../generated/prisma/client.ts";

export class AuthorizationError extends Error {}

export async function isUserAdmin(prisma: Pick<PrismaClient, "user">, userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return user?.role === "ADMIN";
}

export async function requireUserAdmin(prisma: Pick<PrismaClient, "user">, userId: string): Promise<void> {
  if (!(await isUserAdmin(prisma, userId))) throw new AuthorizationError("Sólo los administradores pueden realizar esta acción");
}

export async function requireTripAccess(repository: TripAccessRepository, context: CaptureContext): Promise<void> {
  if (!(await repository.hasTripAccess(context))) {
    throw new AuthorizationError("No tenés acceso a este viaje");
  }
}

export async function requireTripMember(repository: TripRoleRepository, context: CaptureContext): Promise<TripMembership> {
  const membership = await repository.getTripMembership(context);
  if (!membership) throw new AuthorizationError("No tenés acceso a este viaje");
  return membership;
}

export async function requireTripAdmin(repository: TripRoleRepository, context: CaptureContext): Promise<TripMembership> {
  const membership = await requireTripMember(repository, context);
  if (membership.role !== "ADMIN") throw new AuthorizationError("Sólo el administrador del viaje puede acceder a esta sección");
  return membership;
}

export async function requireTripTraveler(repository: TripRoleRepository, context: CaptureContext): Promise<TripMembership> {
  const membership = await requireTripMember(repository, context);
  if (membership.role !== "TRAVELER") throw new AuthorizationError("Sólo los viajeros pueden cargar proveedores");
  return membership;
}
