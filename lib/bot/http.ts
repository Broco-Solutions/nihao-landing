import { CaptureConflictError, CaptureNotFoundError } from "./persistence/repository.ts";
import { AuthorizationError } from "./authorization.ts";
import { AuthenticationRequiredError, AuthConfigurationError } from "../auth/errors.ts";
import { ValidationError } from "./validation.ts";

export function apiError(error: unknown): Response {
  if (error instanceof AuthenticationRequiredError) return Response.json({ error: error.message }, { status: 401 });
  if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: 403 });
  if (error instanceof AuthConfigurationError) return Response.json({ error: error.message }, { status: 503 });
  if (error instanceof ValidationError) return Response.json({ error: error.message }, { status: 400 });
  if (error instanceof CaptureNotFoundError) return Response.json({ error: error.message }, { status: 404 });
  if (error instanceof CaptureConflictError) return Response.json({ error: error.message }, { status: 409 });
  console.error("Nihao bot API error", error);
  return Response.json({ error: "No se pudo completar la operación" }, { status: 500 });
}
