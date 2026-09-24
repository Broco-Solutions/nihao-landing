import type { PrismaClient } from "../../../generated/prisma/client.ts";
import { AuthorizationError } from "../authorization.ts";
import { ValidationError } from "../validation.ts";
import { normalizeWhatsAppPhone } from "../whatsapp-phone.ts";

export type TripWhatsAppState = { tripId: string; whatsappPhone: string | null };

export class PrismaTripWhatsAppRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getForMember(userId: string, tripId: string): Promise<TripWhatsAppState> {
    const member = await this.prisma.tripMember.findUnique({ where: { tripId_userId: { tripId, userId } }, select: { whatsappPhone: true } });
    if (!member) throw new AuthorizationError("No tenés acceso a este viaje");
    return { tripId, whatsappPhone: member.whatsappPhone };
  }

  async updateForMember(userId: string, tripId: string, phone: string | null): Promise<TripWhatsAppState> {
    await this.getForMember(userId, tripId);
    const whatsappPhone = phone === null ? null : normalizeWhatsAppPhone(phone);
    try {
      const member = await this.prisma.tripMember.update({ where: { tripId_userId: { tripId, userId } }, data: { whatsappPhone }, select: { whatsappPhone: true } });
      return { tripId, whatsappPhone: member.whatsappPhone };
    } catch (error) {
      if (typeof error === "object" && error && "code" in error && error.code === "P2002") throw new ValidationError("Ese WhatsApp ya está vinculado a otro miembro de este viaje");
      throw error;
    }
  }
}
