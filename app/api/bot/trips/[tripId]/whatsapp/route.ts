import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { apiError } from "@/lib/bot/http";
import { PrismaTripWhatsAppRepository } from "@/lib/bot/persistence/prisma-trip-whatsapp-repository";
import { ValidationError } from "@/lib/bot/validation";

async function input(request: Request): Promise<string | null> {
  const body: unknown = await request.json();
  if (!body || typeof body !== "object" || Array.isArray(body) || !("whatsappPhone" in body)) throw new ValidationError("whatsappPhone es obligatorio");
  const value = (body as { whatsappPhone: unknown }).whatsappPhone;
  if (value !== null && typeof value !== "string") throw new ValidationError("whatsappPhone no es válido");
  return value;
}

export async function GET(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try { const user = await getAuthenticatedUser(); const { tripId } = await params; return Response.json(await new PrismaTripWhatsAppRepository(getPrisma()).getForMember(user.id, tripId)); }
  catch (error) { return apiError(error); }
}

export async function PUT(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try { const user = await getAuthenticatedUser(); const { tripId } = await params; return Response.json(await new PrismaTripWhatsAppRepository(getPrisma()).updateForMember(user.id, tripId, await input(request))); }
  catch (error) { return apiError(error); }
}
