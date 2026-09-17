import { CaptureConflictError, CaptureNotFoundError } from "./persistence/repository.ts";
import { AuthorizationError } from "./authorization.ts";
import { AuthenticationRequiredError, AuthConfigurationError } from "../auth/errors.ts";
import { ValidationError } from "./validation.ts";
import { R2StorageConfigurationError } from "./storage/r2-s3-provider.ts";
import { StorageNotConfiguredError } from "./storage/provider.ts";
import { MistralExtractionError, MistralExtractionResponseError, MistralExtractionTimeoutError } from "./extraction/mistral-extraction-provider.ts";
import { TranscriptionError, TranscriptionResponseError, TranscriptionTimeoutError } from "./transcription.ts";

export function apiError(error: unknown): Response {
  if (error instanceof AuthenticationRequiredError) return Response.json({ error: error.message }, { status: 401 });
  if (error instanceof AuthorizationError) return Response.json({ error: error.message }, { status: 403 });
  if (error instanceof AuthConfigurationError) return Response.json({ error: error.message }, { status: 503 });
  if (error instanceof R2StorageConfigurationError || error instanceof StorageNotConfiguredError) return Response.json({ error: "El almacenamiento de adjuntos no está disponible" }, { status: 503 });
  if (error instanceof ValidationError) return Response.json({ error: error.message }, { status: 400 });
  if (error instanceof MistralExtractionTimeoutError) return Response.json({ error: "El análisis tardó demasiado. Podés reintentar." }, { status: 504 });
  if (error instanceof MistralExtractionResponseError) return Response.json({ error: "El análisis no devolvió una respuesta válida. Podés reintentar." }, { status: 502 });
  if (error instanceof MistralExtractionError) return Response.json({ error: "El análisis no está disponible. Podés reintentar." }, { status: 503 });
  if (error instanceof TranscriptionTimeoutError) return Response.json({ error: "La transcripción tardó demasiado. Podés reintentar." }, { status: 504 });
  if (error instanceof TranscriptionResponseError) return Response.json({ error: "La transcripción no devolvió una respuesta válida. Podés reintentar." }, { status: 502 });
  if (error instanceof TranscriptionError) return Response.json({ error: "La transcripción no está disponible. Podés reintentar." }, { status: 503 });
  if (error instanceof CaptureNotFoundError) return Response.json({ error: error.message }, { status: 404 });
  if (error instanceof CaptureConflictError) return Response.json({ error: error.message }, { status: 409 });
  console.error("Nihao bot API error", error);
  return Response.json({ error: "No se pudo completar la operación" }, { status: 500 });
}
