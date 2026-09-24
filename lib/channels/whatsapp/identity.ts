import { normalizeWhatsAppPhone } from "../../bot/whatsapp-phone.ts";

export type WhatsAppIdentity = { userId: string; tripId: string; phone: string };
type Candidate = { userId: string; tripId: string; trip: { status: "ACTIVE" | "PLANNED" | "COMPLETED" | "ARCHIVED" } };

export type WhatsAppIdentityRepository = { findByWhatsAppPhone(phone: string): Promise<Candidate[]> };
export type WhatsAppIdentityResolution = { kind: "resolved"; identity: WhatsAppIdentity } | { kind: "unlinked" } | { kind: "ambiguous" };

export async function resolveWhatsAppIdentity(phone: string, repository: WhatsAppIdentityRepository): Promise<WhatsAppIdentityResolution> {
  const normalizedPhone = normalizeWhatsAppPhone(phone);
  const candidates = await repository.findByWhatsAppPhone(normalizedPhone);
  const active = candidates.filter((candidate) => candidate.trip.status === "ACTIVE");
  const selected = active.length ? active : candidates.filter((candidate) => candidate.trip.status === "PLANNED");
  if (!selected.length) return { kind: "unlinked" };
  if (selected.length !== 1) return { kind: "ambiguous" };
  return { kind: "resolved", identity: { userId: selected[0].userId, tripId: selected[0].tripId, phone: normalizedPhone } };
}
