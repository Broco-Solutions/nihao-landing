import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireUserAdmin } from "@/lib/bot/authorization";
import { apiError } from "@/lib/bot/http";
import { ValidationError } from "@/lib/bot/validation";
import { normalizeWhatsAppPhone } from "@/lib/bot/whatsapp-phone";

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const admin = await getAuthenticatedUser();
    const prisma = getPrisma();
    await requireUserAdmin(prisma, admin.id);
    const { userId } = await params;
    const body = await request.json() as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ValidationError("Datos del viajero no válidos");
    const input = body as Record<string, unknown>;
    const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
    if (!name || name.length > 120) throw new ValidationError("El nombre debe tener entre 1 y 120 caracteres");
    const whatsappPhone = input.whatsappPhone === "" || input.whatsappPhone === null ? null : normalizeWhatsAppPhone(input.whatsappPhone as string);
    const traveler = await prisma.user.findFirst({ where: { id: userId, OR: [{ role: "TRAVELER" }, { tripMemberships: { some: { role: "TRAVELER" } } }] }, select: { id: true } });
    if (!traveler) return Response.json({ error: "Viajero no encontrado" }, { status: 404 });
    try {
      const updated = await prisma.user.update({ where: { id: userId }, data: { name, whatsappPhone }, select: { id: true, name: true, email: true, whatsappPhone: true } });
      return Response.json({ traveler: updated });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new ValidationError("Ese WhatsApp ya está asignado a otro usuario");
      throw error;
    }
  } catch (error) { return apiError(error); }
}
