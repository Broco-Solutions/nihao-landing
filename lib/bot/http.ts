import { CaptureConflictError, CaptureNotFoundError } from "./persistence/repository.ts";
import { ValidationError } from "./validation.ts";

export function apiError(error: unknown): Response {
  if (error instanceof ValidationError) return Response.json({ error: error.message }, { status: 400 });
  if (error instanceof CaptureNotFoundError) return Response.json({ error: error.message }, { status: 404 });
  if (error instanceof CaptureConflictError) return Response.json({ error: error.message }, { status: 409 });
  console.error("Nihao bot API error", error);
  return Response.json({ error: "No se pudo completar la operación" }, { status: 500 });
}
