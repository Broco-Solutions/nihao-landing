import { createHash, randomBytes } from "node:crypto";

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function normalizeInvitationEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createInvitationSecret(now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInvitationToken(token), expiresAt: new Date(now.getTime() + INVITATION_TTL_MS) };
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
  email: string;
  name: string | null;
  status: InvitationStatus;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
export type CreateInvitationInput = { adminUserId: string; tripId: string; email: string; name?: string | null };
export type CreateInvitationResult = { invitation: InvitationRecord; token: string | null; reused: boolean };
export type AcceptInvitationResult = { tripId: string; invitationId: string; alreadyMember: boolean };

export interface InvitationRepository {
  create(input: CreateInvitationInput & { email: string; tokenHash: string; expiresAt: Date }): Promise<{ invitation: InvitationRecord; reused: boolean }>;
  list(adminUserId: string, tripId: string): Promise<InvitationRecord[]>;
  resend(adminUserId: string, tripId: string, invitationId: string, tokenHash: string, expiresAt: Date): Promise<InvitationRecord>;
  getPublic(tokenHash: string, now: Date): Promise<InvitationRecord | null>;
  accept(tokenHash: string, userId: string, userEmail: string, now: Date): Promise<AcceptInvitationResult>;
}

export class InvitationService {
  private readonly repository: InvitationRepository;

  constructor(repository: InvitationRepository) { this.repository = repository; }

  async create(input: CreateInvitationInput): Promise<CreateInvitationResult> {
    const email = normalizeInvitationEmail(input.email);
    if (!email || !email.includes("@")) throw new InvitationError("Ingresá un email válido");
    const secret = createInvitationSecret();
    const result = await this.repository.create({ ...input, email, name: input.name?.trim() || null, ...secret });
    return { invitation: result.invitation, token: result.reused ? null : secret.token, reused: result.reused };
  }

  async list(adminUserId: string, tripId: string) { return this.repository.list(adminUserId, tripId); }

  async resend(adminUserId: string, tripId: string, invitationId: string): Promise<{ invitation: InvitationRecord; token: string }> {
    const secret = createInvitationSecret();
    return { invitation: await this.repository.resend(adminUserId, tripId, invitationId, secret.tokenHash, secret.expiresAt), token: secret.token };
  }

  async getPublic(token: string, now = new Date()) {
    const invitation = await this.repository.getPublic(hashInvitationToken(token), now);
    if (!invitation) throw new InvitationInvalidError("La invitación no es válida");
    return { status: invitation.status, tripId: invitation.tripId, tripName: (invitation as InvitationRecord & { tripName?: string }).tripName };
  }

  async accept(token: string, userId: string, userEmail: string, now = new Date()) {
    return this.repository.accept(hashInvitationToken(token), userId, normalizeInvitationEmail(userEmail), now);
  }
}
