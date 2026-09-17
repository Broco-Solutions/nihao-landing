import type { PrismaClient } from "../../../generated/prisma/client.ts";
import { requireTripAdmin } from "../authorization.ts";
import { InvitationAcceptedError, InvitationAlreadyMemberError, InvitationEmailMismatchError, InvitationExpiredError, InvitationInvalidError, type AcceptInvitationResult, type CreateInvitationInput, type InvitationRecord, type InvitationRepository } from "../invitations.ts";
import { PrismaTripAccessRepository } from "./prisma-trip-access-repository.ts";

type InvitationRow = {
  id: string;
  tripId: string;
  email: string;
  name: string | null;
  status: "PENDING" | "ACCEPTED" | "EXPIRED";
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toRecord(row: InvitationRow): InvitationRecord {
  return row;
}

export class PrismaInvitationRepository implements InvitationRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) { this.prisma = prisma; }

  private async assertAdmin(userId: string, tripId: string) {
    await requireTripAdmin(new PrismaTripAccessRepository(this.prisma), { userId, tripId });
  }

  async create(input: CreateInvitationInput & { email: string; tokenHash: string; expiresAt: Date }) {
    await this.assertAdmin(input.adminUserId, input.tripId);
    try {
      return await this.prisma.$transaction(async (tx) => {
      const members = await tx.tripMember.findMany({ where: { tripId: input.tripId }, select: { user: { select: { email: true } } } });
      if (members.some((member) => member.user.email.trim().toLowerCase() === input.email)) throw new InvitationAlreadyMemberError("Ese email ya pertenece al viaje");

      const existing = await tx.tripInvitation.findFirst({ where: { tripId: input.tripId, email: input.email, status: "PENDING" }, orderBy: { createdAt: "desc" } });
      if (existing && existing.expiresAt > new Date()) return { invitation: toRecord(existing), reused: true };
      if (existing) await tx.tripInvitation.update({ where: { id: existing.id }, data: { status: "EXPIRED" } });

      const expired = await tx.tripInvitation.findFirst({ where: { tripId: input.tripId, email: input.email, status: "EXPIRED" }, orderBy: { createdAt: "desc" } });
      const row = expired
        ? await tx.tripInvitation.update({ where: { id: expired.id }, data: { name: input.name, tokenHash: input.tokenHash, status: "PENDING", expiresAt: input.expiresAt, acceptedAt: null } })
        : await tx.tripInvitation.create({ data: { tripId: input.tripId, email: input.email, name: input.name, tokenHash: input.tokenHash, expiresAt: input.expiresAt } });
      return { invitation: toRecord(row), reused: false };
      });
    } catch (error) {
      // The unique trip/email/status index closes the create race. If another
      // request won it, expose the same safe "already pending" result.
      const existing = await this.prisma.tripInvitation.findFirst({ where: { tripId: input.tripId, email: input.email, status: "PENDING" } });
      if (existing && existing.expiresAt > new Date()) return { invitation: toRecord(existing), reused: true };
      throw error;
    }
  }

  async list(adminUserId: string, tripId: string) {
    await this.assertAdmin(adminUserId, tripId);
    const rows = await this.prisma.tripInvitation.findMany({ where: { tripId }, orderBy: { createdAt: "desc" } });
    return rows.map(toRecord);
  }

  async resend(adminUserId: string, tripId: string, invitationId: string, tokenHash: string, expiresAt: Date) {
    await this.assertAdmin(adminUserId, tripId);
    const invitation = await this.prisma.tripInvitation.findFirst({ where: { id: invitationId, tripId } });
    if (!invitation) throw new InvitationInvalidError("La invitación no es válida");
    if (invitation.status === "ACCEPTED") throw new InvitationAcceptedError("La invitación ya fue aceptada");
    return toRecord(await this.prisma.tripInvitation.update({ where: { id: invitation.id }, data: { tokenHash, expiresAt, status: "PENDING", acceptedAt: null } }));
  }

  async getPublic(tokenHash: string, now: Date) {
    const invitation = await this.prisma.tripInvitation.findUnique({ where: { tokenHash }, include: { trip: { select: { name: true } } } });
    if (!invitation) return null;
    if (invitation.status === "PENDING" && invitation.expiresAt <= now) {
      const expired = await this.prisma.tripInvitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } });
      return { ...toRecord(expired), tripName: invitation.trip.name };
    }
    return { ...toRecord(invitation), tripName: invitation.trip.name };
  }

  async accept(tokenHash: string, userId: string, userEmail: string, now: Date): Promise<AcceptInvitationResult> {
    return this.prisma.$transaction(async (tx) => {
      const invitation = await tx.tripInvitation.findUnique({ where: { tokenHash } });
      if (!invitation) throw new InvitationInvalidError("La invitación no es válida");
      if (invitation.status === "ACCEPTED") throw new InvitationAcceptedError("La invitación ya fue aceptada");
      if (invitation.status === "EXPIRED" || invitation.expiresAt <= now) {
        if (invitation.status === "PENDING") await tx.tripInvitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } });
        throw new InvitationExpiredError("La invitación venció");
      }
      if (invitation.email !== userEmail) throw new InvitationEmailMismatchError("La cuenta no coincide con el email invitado");

      const member = await tx.tripMember.findUnique({ where: { tripId_userId: { tripId: invitation.tripId, userId } }, select: { role: true, onboardingCompletedAt: true } });
      if (member?.role === "ADMIN") throw new InvitationAlreadyMemberError("Ya pertenecés a este viaje");
      if (!member) await tx.tripMember.create({ data: { tripId: invitation.tripId, userId, role: "TRAVELER" } });
      await tx.tripInvitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED", acceptedAt: now } });
      return { tripId: invitation.tripId, invitationId: invitation.id, alreadyMember: Boolean(member), onboardingRequired: !member?.onboardingCompletedAt };
    });
  }
}
