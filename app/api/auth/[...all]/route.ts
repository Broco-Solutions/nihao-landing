import { BetterAuthConfigurationError, getAuth } from "@/lib/auth/auth";
import { DatabaseConfigurationError } from "@/lib/auth/prisma";
import { toNextJsHandler } from "better-auth/next-js";

function unavailable(error: unknown): Response | null {
  if (error instanceof BetterAuthConfigurationError || error instanceof DatabaseConfigurationError) {
    return Response.json({ error: "La autenticación productiva todavía no está configurada" }, { status: 503 });
  }
  return null;
}

export async function GET(request: Request) {
  try {
    return await toNextJsHandler(getAuth()).GET(request);
  } catch (error) {
    const response = unavailable(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    return await toNextJsHandler(getAuth()).POST(request);
  } catch (error) {
    const response = unavailable(error);
    if (response) return response;
    throw error;
  }
}
