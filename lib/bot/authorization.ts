import type { CaptureContext, TripAccessRepository, TripMembership, TripRoleRepository } from "./persistence/repository.ts";

export class AuthorizationError extends Error {}

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
