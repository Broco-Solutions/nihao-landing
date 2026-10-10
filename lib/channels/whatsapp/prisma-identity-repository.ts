import type { PrismaClient } from "../../../generated/prisma/client.ts";
import { whatsappPhoneLookupCandidates } from "../../bot/whatsapp-phone.ts";
import type { WhatsAppIdentityRepository } from "./identity.ts";

export class PrismaWhatsAppIdentityRepository implements WhatsAppIdentityRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async findByWhatsAppPhone(phone: string) {
    return this.prisma.tripMember.findMany({ where: { role: "TRAVELER", user: { whatsappPhone: { in: whatsappPhoneLookupCandidates(phone) } }, trip: { status: { in: ["ACTIVE", "PLANNED"] } } }, select: { userId: true, tripId: true, trip: { select: { status: true } } } });
  }
}
