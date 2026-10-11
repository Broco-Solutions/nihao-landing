import type { PrismaClient } from "../../../generated/prisma/client.ts";
import { whatsappInboundLookupCandidates } from "../../bot/whatsapp-phone.ts";
import type { WhatsAppIdentityRepository } from "./identity.ts";

export class PrismaWhatsAppIdentityRepository implements WhatsAppIdentityRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async findByWhatsAppPhone(phone: string) {
    return this.prisma.tripMember.findMany({ where: { role: "TRAVELER", user: { whatsappPhone: { in: whatsappInboundLookupCandidates(phone) } }, trip: { status: { in: ["ACTIVE", "PLANNED"] } } }, select: { userId: true, tripId: true, trip: { select: { status: true } } } });
  }
}
