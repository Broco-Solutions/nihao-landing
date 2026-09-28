import assert from "node:assert/strict";
import { test } from "node:test";
import { InvitationAcceptedError, InvitationAlreadyMemberError, InvitationEmailMismatchError, InvitationExpiredError, InvitationInvalidError, InvitationService, type AcceptInvitationResult, type CreateInvitationInput, type InvitationRecord, type InvitationRepository } from "../../lib/bot/invitations.ts";

type Member = { tripId: string; userId: string; email: string; role: "ADMIN" | "TRAVELER" };
class MemoryInvitations implements InvitationRepository {
  invites: InvitationRecord[] = [];
  members: Member[] = [];
  roles = new Map<string, "ADMIN" | "TRAVELER">();
  tripNames = new Map<string, string>();
  private next = 1;
  async create(input: CreateInvitationInput & { email: string; tokenHash: string; expiresAt: Date }) {
    if (this.roles.get(`${input.adminUserId}:${input.tripId}`) !== "ADMIN") throw new Error("forbidden");
    if (this.members.some((member) => member.tripId === input.tripId && member.email === input.email)) throw new InvitationAlreadyMemberError("member");
    const current = this.invites.find((item) => item.tripId === input.tripId && item.email === input.email && item.status === "PENDING");
    if (current && current.expiresAt > new Date()) return { invitation: current, reused: true };
    if (current) current.status = "EXPIRED";
    const old = this.invites.find((item) => item.tripId === input.tripId && item.email === input.email && item.status === "EXPIRED");
    const invitation = old ?? { id: `inv-${this.next++}`, tripId: input.tripId, email: input.email, name: input.name ?? null, status: "PENDING" as const, expiresAt: input.expiresAt, acceptedAt: null, createdAt: new Date(), updatedAt: new Date() };
    Object.assign(invitation, { name: input.name ?? null, tokenHash: input.tokenHash, status: "PENDING", expiresAt: input.expiresAt, acceptedAt: null, updatedAt: new Date() });
    if (!old) this.invites.push(invitation);
    return { invitation, reused: false };
  }
  async list(adminUserId: string, tripId: string) { if (this.roles.get(`${adminUserId}:${tripId}`) !== "ADMIN") throw new Error("forbidden"); return this.invites.filter((item) => item.tripId === tripId); }
  async resend(adminUserId: string, tripId: string, invitationId: string, tokenHash: string, expiresAt: Date) { if (this.roles.get(`${adminUserId}:${tripId}`) !== "ADMIN") throw new Error("forbidden"); const item = this.invites.find((value) => value.id === invitationId && value.tripId === tripId); if (!item) throw new InvitationInvalidError("invalid"); if (item.status === "ACCEPTED") throw new InvitationAcceptedError("accepted"); Object.assign(item, { tokenHash, expiresAt, status: "PENDING", acceptedAt: null }); return item; }
  async getPublic(tokenHash: string, now: Date) { const item = this.invites.find((value) => (value as InvitationRecord & { tokenHash?: string }).tokenHash === tokenHash); if (!item) return null; if (item.status === "PENDING" && item.expiresAt <= now) item.status = "EXPIRED"; const { tokenHash: ignoredTokenHash, ...publicItem } = item as InvitationRecord & { tokenHash?: string }; void ignoredTokenHash; return { ...publicItem, tripName: this.tripNames.get(item.tripId) }; }
  async accept(tokenHash: string, userId: string, userEmail: string, now: Date): Promise<AcceptInvitationResult> {
    const item = this.invites.find((value) => (value as InvitationRecord & { tokenHash?: string }).tokenHash === tokenHash);
    if (!item) throw new InvitationInvalidError("invalid");
    if (item.status === "ACCEPTED") throw new InvitationAcceptedError("accepted");
    if (item.status === "EXPIRED" || item.expiresAt <= now) { item.status = "EXPIRED"; throw new InvitationExpiredError("expired"); }
    if (item.email !== userEmail) throw new InvitationEmailMismatchError("mismatch");
    const member = this.members.find((value) => value.tripId === item.tripId && value.userId === userId);
    if (member?.role === "ADMIN") throw new InvitationAlreadyMemberError("member");
    if (!member) this.members.push({ tripId: item.tripId, userId, email: userEmail, role: "TRAVELER" });
    item.status = "ACCEPTED"; item.acceptedAt = now;
    return { tripId: item.tripId, invitationId: item.id, alreadyMember: Boolean(member), onboardingRequired: !member };
  }
}

function setup() {
  const repository = new MemoryInvitations();
  repository.roles.set("admin:trip-a", "ADMIN"); repository.roles.set("traveler:trip-a", "TRAVELER"); repository.tripNames.set("trip-a", "Canton Fair");
  return { repository, service: new InvitationService(repository) };
}

test("ADMIN crea invitación y nunca persiste el token", async () => {
  const { repository, service } = setup();
  const result = await service.create({ adminUserId: "admin", tripId: "trip-a", email: " Guest@Example.com ", name: "Guest" });
  assert.equal(result.invitation.email, "guest@example.com"); assert.ok(result.token); assert.notEqual((repository.invites[0] as InvitationRecord & { tokenHash: string }).tokenHash, result.token); assert.equal(repository.invites.length, 1);
});

test("TRAVELER y ADMIN de otro viaje no pueden invitar", async () => {
  const { service } = setup();
  await assert.rejects(service.create({ adminUserId: "traveler", tripId: "trip-a", email: "a@b.com" }));
  await assert.rejects(service.create({ adminUserId: "admin", tripId: "trip-b", email: "a@b.com" }));
});

test("email ya miembro no duplica invitación", async () => { const { repository, service } = setup(); repository.members.push({ tripId: "trip-a", userId: "u1", email: "member@example.com", role: "TRAVELER" }); await assert.rejects(service.create({ adminUserId: "admin", tripId: "trip-a", email: "member@example.com" }), InvitationAlreadyMemberError); assert.equal(repository.invites.length, 0); });

test("aceptación válida crea TRAVELER con onboarding pendiente y es idempotencia segura", async () => { const { repository, service } = setup(); const created = await service.create({ adminUserId: "admin", tripId: "trip-a", email: "traveler@example.com" }); const accepted = await service.accept(created.token!, "u2", "TRAVELER@example.com"); assert.equal(accepted.tripId, "trip-a"); assert.equal(accepted.onboardingRequired, true); assert.deepEqual(repository.members, [{ tripId: "trip-a", userId: "u2", email: "traveler@example.com", role: "TRAVELER" }]); await assert.rejects(service.accept(created.token!, "u2", "traveler@example.com"), InvitationAcceptedError); });

test("rechaza email distinto, token inválido y vencido", async () => { const { service } = setup(); const created = await service.create({ adminUserId: "admin", tripId: "trip-a", email: "right@example.com" }); await assert.rejects(service.accept(created.token!, "u3", "wrong@example.com"), InvitationEmailMismatchError); await assert.rejects(service.accept("invalid", "u3", "right@example.com"), InvitationInvalidError); const expired = await service.create({ adminUserId: "admin", tripId: "trip-a", email: "old@example.com" }); await assert.rejects(service.accept(expired.token!, "u4", "old@example.com", new Date(Date.now() + 8 * 24 * 60 * 60 * 1000)), InvitationExpiredError); });

test("regenerar invalida token anterior y permite el nuevo", async () => { const { service } = setup(); const created = await service.create({ adminUserId: "admin", tripId: "trip-a", email: "new@example.com" }); const resent = await service.resend("admin", "trip-a", created.invitation.id); await assert.rejects(service.accept(created.token!, "u5", "new@example.com"), InvitationInvalidError); const accepted = await service.accept(resent.token, "u5", "new@example.com"); assert.equal(accepted.tripId, "trip-a"); });

test("ADMIN puede listar sus invitaciones y el estado público no expone hash", async () => { const { service } = setup(); const created = await service.create({ adminUserId: "admin", tripId: "trip-a", email: "public@example.com" }); assert.equal((await service.list("admin", "trip-a")).length, 1); const publicView = await service.getPublic(created.token!); assert.equal(publicView.tripName, "Canton Fair"); assert.equal("tokenHash" in publicView, false); });

test("dos reintentos concurrentes no crean dos membresías", async () => { const { repository, service } = setup(); const created = await service.create({ adminUserId: "admin", tripId: "trip-a", email: "race@example.com" }); const results = await Promise.allSettled([service.accept(created.token!, "race-user", "race@example.com"), service.accept(created.token!, "race-user", "race@example.com")]); assert.equal(results.filter((result) => result.status === "fulfilled").length, 1); assert.equal(repository.members.filter((member) => member.userId === "race-user").length, 1); });
