import { createHash, randomBytes } from "node:crypto";
import { normalizeWhatsAppPhone } from "./whatsapp-phone.ts";

// `expiresAt` remains in the persisted model for backwards compatibility.
// Pending invitations stay valid until they are accepted or an administrator
// regenerates their token.
export const INVITATION_NO_EXPIRY = new Date("9999-12-31T23:59:59.999Z");

export function normalizeInvitationEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createInvitationSecret() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInvitationToken(token), expiresAt: new Date(INVITATION_NO_EXPIRY.getTime()) };
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class InvitationError extends Error {}
export class InvitationAlreadyMemberError extends InvitationError {}
export class InvitationPendingError extends InvitationError {}
export class InvitationInvalidError extends InvitationError {}
export class InvitationExpiredError extends InvitationError {}
export class InvitationAcceptedError extends InvitationError {}
export class InvitationEmailMismatchError extends InvitationError {}

export type InvitationStatus = "PENDING" | "ACCEPTED" | "EXPIRED";
export type InvitationRecord = {
  id: string;
  tripId: string;
  companyId?: string;
  companyName?: string;
  email: string;
  name: string | null;
  whatsappPhone: string | null;
  status: InvitationStatus;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
export type CreateInvitationInput = { adminUserId: string; tripId: string; companyId?: string; email: string; name?: string | null; whatsappPhone?: string | null };
export type CreateInvitationResult = { invitation: InvitationRecord; token: string | null; reused: boolean };
export type AcceptInvitationResult = { tripId: string; invitationId: string; alreadyMember: boolean; onboardingRequired: boolean };

export interface InvitationRepository {
  create(input: CreateInvitationInput & { email: string; tokenHash: string; expiresAt: Date }): Promise<{ invitation: InvitationRecord; reused: boolean }>;
  list(adminUserId: string, tripId: string): Promise<InvitationRecord[]>;
  resend(adminUserId: string, tripId: string, invitationId: string, tokenHash: string, expiresAt: Date): Promise<InvitationRecord>;
  revoke(adminUserId: string, tripId: string, invitationId: string): Promise<InvitationRecord>;
  getPublic(tokenHash: string, now: Date): Promise<InvitationRecord | null>;
  accept(tokenHash: string, userId: string, userEmail: string, now: Date): Promise<AcceptInvitationResult>;
}

export class InvitationService {
  private readonly repository: InvitationRepository;

  constructor(repository: InvitationRepository) { this.repository = repository; }

  async create(input: CreateInvitationInput): Promise<CreateInvitationResult> {
    const email = normalizeInvitationEmail(input.email);
    if (!email || !email.includes("@")) throw new InvitationError("Ingresá un email válido");
    const whatsappPhone = input.whatsappPhone?.trim() ? normalizeWhatsAppPhone(input.whatsappPhone) : null;
    const secret = createInvitationSecret();
    const result = await this.repository.create({ ...input, email, whatsappPhone, name: input.name?.trim() || null, ...secret });
    return { invitation: result.invitation, token: result.reused ? null : secret.token, reused: result.reused };
  }

  async list(adminUserId: string, tripId: string) { return this.repository.list(adminUserId, tripId); }

  async resend(adminUserId: string, tripId: string, invitationId: string): Promise<{ invitation: InvitationRecord; token: string }> {
    const secret = createInvitationSecret();
    return { invitation: await this.repository.resend(adminUserId, tripId, invitationId, secret.tokenHash, secret.expiresAt), token: secret.token };
  }

  async revoke(adminUserId: string, tripId: string, invitationId: string): Promise<InvitationRecord> {
    return this.repository.revoke(adminUserId, tripId, invitationId);
  }

  async getPublic(token: string, now = new Date()) {
    const invitation = await this.repository.getPublic(hashInvitationToken(token), now);
    if (!invitation) throw new InvitationInvalidError("La invitación no es válida");
    return { status: invitation.status, tripId: invitation.tripId, tripName: (invitation as InvitationRecord & { tripName?: string }).tripName, companyName: invitation.companyName };
  }

  async accept(token: string, userId: string, userEmail: string, now = new Date()) {
    return this.repository.accept(hashInvitationToken(token), userId, normalizeInvitationEmail(userEmail), now);
  }
}
