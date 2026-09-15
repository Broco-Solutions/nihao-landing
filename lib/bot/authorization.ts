import type { CaptureContext, TripAccessRepository } from "./persistence/repository.ts";

export class AuthorizationError extends Error {}

export async function requireTripAccess(repository: TripAccessRepository, context: CaptureContext): Promise<void> {
  if (!(await repository.hasTripAccess(context))) {
    throw new AuthorizationError("No tenés acceso a este viaje");
  }
}
