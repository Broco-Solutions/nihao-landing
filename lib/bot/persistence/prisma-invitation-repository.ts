import type { PrismaClient } from "../../../generated/prisma/client.ts";
import { requireTripAdmin, requireUserAdmin } from "../authorization.ts";
import { InvitationAcceptedError, InvitationAlreadyMemberError, InvitationEmailMismatchError, InvitationError, InvitationExpiredError, InvitationInvalidError, type AcceptInvitationResult, type CreateInvitationInput, type InvitationRecord, type InvitationRepository } from "../invitations.ts";
import { PrismaTripAccessRepository } from "./prisma-trip-access-repository.ts";
import { resolveCompanyId } from "./company-access.ts";

type InvitationRow = {
  id: string;
  tripId: string;
  companyId: string;
  email: string;
  name: string | null;
  whatsappPhone: string | null;
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
    await requireUserAdmin(this.prisma, userId);
    await requireTripAdmin(new PrismaTripAccessRepository(this.prisma), { userId, tripId });
  }

  async create(input: CreateInvitationInput & { email: string; tokenHash: string; expiresAt: Date }) {
    await this.assertAdmin(input.adminUserId, input.tripId);
    const companyId = await resolveCompanyId(this.prisma, input.adminUserId, input.tripId, input.companyId);
    try {
      return await this.prisma.$transaction(async (tx) => {
      const members = await tx.tripCompanyMember.findMany({ where: { companyId }, select: { user: { select: { email: true } } } });
      if (members.some((member) => member.user.email.trim().toLowerCase() === input.email)) throw new InvitationAlreadyMemberError("Ese email ya pertenece a esta empresa");
      const registered = await tx.user.findUnique({ where: { email: input.email }, select: { id: true, whatsappPhone: true } });
      if (registered?.whatsappPhone && registered.whatsappPhone !== input.whatsappPhone) throw new InvitationError("El viajero ya tiene otro WhatsApp registrado. Usá ese número.");
      const phoneOwner = await tx.user.findUnique({ where: { whatsappPhone: input.whatsappPhone }, select: { id: true } });
      if (phoneOwner && phoneOwner.id !== registered?.id) throw new InvitationError("Ese WhatsApp ya pertenece a otro usuario");

      const existing = await tx.tripInvitation.findFirst({ where: { companyId, email: input.email, status: "PENDING" }, orderBy: { createdAt: "desc" } });
      if (existing && existing.expiresAt > new Date()) {
        const row = await tx.tripInvitation.update({ where: { id: existing.id }, data: { name: input.name, whatsappPhone: input.whatsappPhone } });
        return { invitation: toRecord(row), reused: true };
      }
      if (existing) await tx.tripInvitation.update({ where: { id: existing.id }, data: { status: "EXPIRED" } });

      const expired = await tx.tripInvitation.findFirst({ where: { companyId, email: input.email, status: "EXPIRED" }, orderBy: { createdAt: "desc" } });
      const row = expired
        ? await tx.tripInvitation.update({ where: { id: expired.id }, data: { name: input.name, whatsappPhone: input.whatsappPhone, tokenHash: input.tokenHash, status: "PENDING", expiresAt: input.expiresAt, acceptedAt: null } })
        : await tx.tripInvitation.create({ data: { tripId: input.tripId, companyId, email: input.email, name: input.name, whatsappPhone: input.whatsappPhone, tokenHash: input.tokenHash, expiresAt: input.expiresAt } });
      return { invitation: toRecord(row), reused: false };
      });
    } catch (error) {
      // The unique trip/email/status index closes the create race. If another
      // request won it, expose the same safe "already pending" result.
      const existing = await this.prisma.tripInvitation.findFirst({ where: { companyId, email: input.email, status: "PENDING" } });
      if (existing && existing.expiresAt > new Date() && existing.whatsappPhone === input.whatsappPhone) return { invitation: toRecord(existing), reused: true };
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
    const invitation = await this.prisma.tripInvitation.findUnique({ where: { tokenHash }, include: { trip: { select: { name: true } }, company: { select: { name: true } } } });
    if (!invitation) return null;
    if (invitation.status === "PENDING" && invitation.expiresAt <= now) {
      const expired = await this.prisma.tripInvitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } });
      return { ...toRecord(expired), tripName: invitation.trip.name, companyName: invitation.company.name };
    }
    return { ...toRecord(invitation), tripName: invitation.trip.name, companyName: invitation.company.name };
  }

  async accept(tokenHash: string, userId: string, userEmail: string, now: Date): Promise<AcceptInvitationResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
      const invitation = await tx.tripInvitation.findUnique({ where: { tokenHash } });
      if (!invitation) throw new InvitationInvalidError("La invitación no es válida");
      if (invitation.status === "ACCEPTED") throw new InvitationAcceptedError("La invitación ya fue aceptada");
      if (invitation.status === "EXPIRED" || invitation.expiresAt <= now) {
        if (invitation.status === "PENDING") await tx.tripInvitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } });
        throw new InvitationExpiredError("La invitación venció");
      }
      if (invitation.email !== userEmail) throw new InvitationEmailMismatchError("La cuenta no coincide con el email invitado");
      if (invitation.whatsappPhone) {
        const user = await tx.user.findUnique({ where: { id: userId }, select: { whatsappPhone: true } });
        if (user?.whatsappPhone && user.whatsappPhone !== invitation.whatsappPhone) throw new InvitationError("Tu cuenta ya tiene otro WhatsApp registrado. Contactá al administrador.");
        const owner = await tx.user.findUnique({ where: { whatsappPhone: invitation.whatsappPhone }, select: { id: true } });
        if (owner && owner.id !== userId) throw new InvitationError("Ese WhatsApp ya pertenece a otro usuario");
        if (!user?.whatsappPhone) await tx.user.update({ where: { id: userId }, data: { whatsappPhone: invitation.whatsappPhone } });
      }

      const member = await tx.tripMember.findUnique({ where: { tripId_userId: { tripId: invitation.tripId, userId } }, select: { role: true, onboardingCompletedAt: true } });
      if (!member) await tx.tripMember.create({ data: { tripId: invitation.tripId, userId, role: "TRAVELER" } });
      const companyMember = await tx.tripCompanyMember.findUnique({ where: { companyId_userId: { companyId: invitation.companyId, userId } } });
      if (companyMember) throw new InvitationAlreadyMemberError("Ya pertenecés a esta empresa");
      await tx.tripCompanyMember.create({ data: { companyId: invitation.companyId, userId } });
      await tx.tripInvitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED", acceptedAt: now } });
      return { tripId: invitation.tripId, invitationId: invitation.id, alreadyMember: Boolean(member), onboardingRequired: !member?.onboardingCompletedAt };
      });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        throw new InvitationError("Ese WhatsApp ya pertenece a otro usuario");
      }
      throw error;
    }
  }
}
