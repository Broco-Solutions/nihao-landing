import assert from "node:assert/strict";
import { test } from "node:test";
import { invitationDeliveryMessage, invitationResendMessage } from "../../components/app/invitation-feedback.ts";
import { invitationLink } from "../../lib/bot/invitation-http.ts";
import { hashInvitationToken, InvitationService, type CreateInvitationInput, type InvitationRecord, type InvitationRepository } from "../../lib/bot/invitations.ts";
import { invitationEmailContent, sendTripInvitationEmail, type InvitationEmailClient } from "../../lib/bot/invitation-email.ts";

const originalFrom = process.env.INVITATION_EMAIL_FROM;
const originalApiKey = process.env.RESEND_API_KEY;

function configureEmail() {
  process.env.INVITATION_EMAIL_FROM = "Nihao <invitaciones@example.test>";
  process.env.RESEND_API_KEY = "test-key";
}

function restoreEmail() {
  if (originalFrom === undefined) delete process.env.INVITATION_EMAIL_FROM; else process.env.INVITATION_EMAIL_FROM = originalFrom;
  if (originalApiKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = originalApiKey;
}

function input(overrides: Partial<Parameters<typeof sendTripInvitationEmail>[0]> = {}) {
  return { invitationId: "inv-1", recipientEmail: "traveler@example.com", invitationUrl: "https://staging.example.test/invitacion/token-not-persisted", expiresAt: new Date("2026-10-20T10:00:00Z"), updatedAt: new Date("2026-10-13T10:00:00Z"), operation: "CREATE" as const, tripName: "<Cantón & Co>", ...overrides };
}

class MemoryInvitations implements InvitationRepository {
  invites: Array<InvitationRecord & { tokenHash: string }> = [];
  async create(value: CreateInvitationInput & { email: string; tokenHash: string; expiresAt: Date }) {
    const invitation = { id: "inv-1", tripId: value.tripId, email: value.email, name: value.name ?? null, status: "PENDING" as const, expiresAt: value.expiresAt, acceptedAt: null, createdAt: new Date(), updatedAt: new Date(), tokenHash: value.tokenHash };
    this.invites.push(invitation);
    return { invitation, reused: false };
  }
  async list() { return this.invites; }
  async resend(_adminUserId: string, _tripId: string, invitationId: string, tokenHash: string, expiresAt: Date) {
    const invitation = this.invites.find((item) => item.id === invitationId)!;
    Object.assign(invitation, { tokenHash, expiresAt, updatedAt: new Date() });
    return invitation;
  }
  async getPublic(tokenHash: string) { const invitation = this.invites.find((item) => item.tokenHash === tokenHash); return invitation ? { ...invitation } : null; }
  async accept(): Promise<never> { throw new Error("not needed"); }
}

test("envía email de invitación con contenido escapado e idempotency key estable", async () => {
  configureEmail();
  const calls: Parameters<InvitationEmailClient["send"]>[0][] = [];
  const delivery = await sendTripInvitationEmail(input(), { async send(value) { calls.push(value); } });
  assert.equal(delivery, "SENT");
  assert.equal(calls.length, 1);
  assert.match(calls[0].subject, /<Cantón & Co>/);
  assert.match(calls[0].html, /&lt;Cantón &amp; Co&gt;/);
  assert.equal(calls[0].idempotencyKey, "trip-invitation-inv-1-1791885600000");
  assert.doesNotMatch(calls[0].idempotencyKey, /token-not-persisted/);
  restoreEmail();
});

test("un fallo de provider no elimina la invitación ya persistida", async () => {
  configureEmail();
  const repository = new MemoryInvitations();
  const service = new InvitationService(repository);
  const created = await service.create({ adminUserId: "admin", tripId: "trip-a", email: "traveler@example.com" });
  const delivery = await sendTripInvitationEmail(input({ invitationId: created.invitation.id }), { async send() { throw new Error("provider down"); } });
  assert.equal(delivery, "FAILED");
  assert.equal(repository.invites.length, 1);
  assert.notEqual(repository.invites[0].tokenHash, created.token);
  restoreEmail();
});

test("configuración de email ausente falla de forma controlada sin llamar a la red", async () => {
  delete process.env.INVITATION_EMAIL_FROM;
  delete process.env.RESEND_API_KEY;
  const delivery = await sendTripInvitationEmail(input());
  assert.equal(delivery, "FAILED");
  restoreEmail();
});

test("cada variable requerida ausente falla de forma controlada", async () => {
  configureEmail();
  delete process.env.RESEND_API_KEY;
  assert.equal(await sendTripInvitationEmail(input()), "FAILED");
  configureEmail();
  delete process.env.INVITATION_EMAIL_FROM;
  assert.equal(await sendTripInvitationEmail(input()), "FAILED");
  restoreEmail();
});

test("regenerar envía el nuevo enlace mediante el provider", async () => {
  configureEmail();
  const repository = new MemoryInvitations();
  const service = new InvitationService(repository);
  const created = await service.create({ adminUserId: "admin", tripId: "trip-a", email: "traveler@example.com" });
  const resent = await service.resend("admin", "trip-a", created.invitation.id);
  const calls: Parameters<InvitationEmailClient["send"]>[0][] = [];
  const delivery = await sendTripInvitationEmail(input({ invitationId: resent.invitation.id, operation: "RESEND", updatedAt: resent.invitation.updatedAt }), { async send(value) { calls.push(value); } });
  assert.equal(delivery, "SENT");
  assert.equal(calls.length, 1);
  assert.match(calls[0].idempotencyKey, /^trip-invitation-inv-1-/);
  restoreEmail();
});

test("regenerar conserva el nuevo token válido aunque falle el email", async () => {
  configureEmail();
  const repository = new MemoryInvitations();
  const service = new InvitationService(repository);
  const created = await service.create({ adminUserId: "admin", tripId: "trip-a", email: "traveler@example.com" });
  const resent = await service.resend("admin", "trip-a", created.invitation.id);
  const delivery = await sendTripInvitationEmail(input({ invitationId: resent.invitation.id, operation: "RESEND", updatedAt: resent.invitation.updatedAt }), { async send() { throw new Error("provider down"); } });
  assert.equal(delivery, "FAILED");
  assert.notEqual(created.token, resent.token);
  assert.equal(await repository.getPublic(hashInvitationToken(created.token!)), null);
  assert.ok(await repository.getPublic(hashInvitationToken(resent.token)));
  restoreEmail();
});

test("PUBLIC_APP_URL construye el link de invitación y la UI conserva fallback manual", () => {
  const previous = process.env.PUBLIC_APP_URL;
  process.env.PUBLIC_APP_URL = "https://staging.nihaonegocios.com";
  assert.equal(invitationLink("opaque-token"), "https://staging.nihaonegocios.com/invitacion/opaque-token");
  if (previous === undefined) delete process.env.PUBLIC_APP_URL; else process.env.PUBLIC_APP_URL = previous;
  assert.equal(invitationDeliveryMessage("SENT", false), "Invitación enviada por email.");
  assert.equal(invitationDeliveryMessage("FAILED", false), "Invitación creada, pero no pudimos enviar el email.");
  assert.match(invitationResendMessage("FAILED"), /Copialo/);
});

test("la plantilla incluye versiones HTML y texto plano sin insertar HTML dinámico", () => {
  const content = invitationEmailContent(input());
  assert.match(content.html, /Aceptar invitación/);
  assert.match(content.text, /Aceptar invitación:/);
  assert.match(content.html, /&lt;Cantón &amp; Co&gt;/);
});
