import type { InvitationRecord } from "./invitations.ts";

export function invitationLink(token: string): string {
  const origin = process.env.PUBLIC_APP_URL?.trim().replace(/\/$/, "") || process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") || "http://localhost:3000";
  return `${origin}/invitacion/${encodeURIComponent(token)}`;
}

export function serializeInvitation(invitation: InvitationRecord) {
  return {
    id: invitation.id,
    tripId: invitation.tripId,
    email: invitation.email,
    name: invitation.name,
    status: invitation.status,
    expiresAt: invitation.expiresAt.toISOString(),
    acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
    createdAt: invitation.createdAt.toISOString(),
    updatedAt: invitation.updatedAt.toISOString(),
  };
}
