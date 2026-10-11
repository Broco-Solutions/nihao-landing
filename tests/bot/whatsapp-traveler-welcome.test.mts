import assert from "node:assert/strict";
import { test } from "node:test";
import { EvolutionRequestError, EvolutionTimeoutError } from "../../lib/channels/evolution/client.ts";
import { PrismaTravelerWelcomeService, travelerWelcomeText, WHATSAPP_OPERATIONAL_CONSENT_SCOPE } from "../../lib/channels/whatsapp/traveler-welcome.ts";

function memory() {
  const member = { role: "TRAVELER", onboardingCompletedAt: null as Date | null, trip: { status: "PLANNED" }, user: { name: "Ana María", whatsappPhone: null as string | null } };
  let companyCount = 1;
  const consents = new Map<string, { revokedAt: Date | null; grantedAt: Date; version: string; origin: string }>();
  const welcomes = new Map<string, Record<string, unknown>>();
  const welcomeKey = (userId: string, tripId: string) => `${userId}:${tripId}`;
  const consentKey = (userId: string, phone: string, scope: string) => `${userId}:${phone}:${scope}`;
  const prisma = {
    tripMember: {
      async findUnique() { return member; },
      async findMany() { return [{ tripId: "trip" }]; },
    },
    tripCompanyMember: { async count() { return companyCount; } },
    whatsAppOperationalConsent: {
      async findUnique(input: { where: { userId_phone_scope: { userId: string; phone: string; scope: string } } }) { return consents.get(consentKey(input.where.userId_phone_scope.userId, input.where.userId_phone_scope.phone, input.where.userId_phone_scope.scope)) ?? null; },
      async upsert(input: { where: { userId_phone_scope: { userId: string; phone: string; scope: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) {
        const key = consentKey(input.where.userId_phone_scope.userId, input.where.userId_phone_scope.phone, input.where.userId_phone_scope.scope);
        const current = consents.get(key);
        const value = { revokedAt: null, grantedAt: new Date(), version: "test", origin: "test", ...(current ?? {}), ...(current ? input.update : input.create) } as { revokedAt: Date | null; grantedAt: Date; version: string; origin: string };
        consents.set(key, value); return value;
      },
    },
    whatsAppTravelerWelcome: {
      async findUnique(input: { where: { userId_tripId: { userId: string; tripId: string } } }) { return welcomes.get(welcomeKey(input.where.userId_tripId.userId, input.where.userId_tripId.tripId)) ?? null; },
      async upsert(input: { where: { userId_tripId: { userId: string; tripId: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) {
        const key = welcomeKey(input.where.userId_tripId.userId, input.where.userId_tripId.tripId);
        const current = welcomes.get(key);
        const value = { id: key, ...(current ?? {}), ...(current ? input.update : input.create) };
        welcomes.set(key, value); return value;
      },
      async updateMany(input: { where: Record<string, unknown>; data: Record<string, unknown> }) {
        let count = 0;
        for (const [key, row] of welcomes) {
          if (Object.entries(input.where).every(([field, expected]) => row[field] === expected)) { welcomes.set(key, { ...row, ...input.data }); count++; }
        }
        return { count };
      },
      async findFirst(input: { where: Record<string, unknown> }) {
        return [...welcomes.values()].find((row) => Object.entries(input.where).every(([field, expected]) => typeof expected === "object" ? row[field] !== null : row[field] === expected)) ?? null;
      },
      async update(input: { where: { id: string }; data: Record<string, unknown> }) {
        const row = welcomes.get(input.where.id)!; const value = { ...row, ...input.data }; welcomes.set(input.where.id, value); return value;
      },
    },
  };
  return { service: new PrismaTravelerWelcomeService(prisma as never), member, consents, welcomes, setCompanyCount(value: number) { companyCount = value; } };
}

test("la plantilla usa sólo el primer nombre válido y conserva un saludo genérico", () => {
  assert.match(travelerWelcomeText("Ana María Pérez"), /^¡Hola, \*Ana\*!/u);
  assert.match(travelerWelcomeText(""), /^¡Hola! 👋🇨🇳/u);
  assert.match(travelerWelcomeText("persona@example.test"), /^¡Hola! 👋🇨🇳/u);
  assert.match(travelerWelcomeText("Ana"), /\*¿Empezamos\?\*/u);
});

test("la elegibilidad espera onboarding, teléfono y consentimiento exacto sin enviar al invitar", async () => {
  const env = memory();
  assert.equal(await env.service.reevaluate("user", "trip"), "PENDING_ELIGIBILITY");
  env.member.onboardingCompletedAt = new Date();
  assert.equal(await env.service.reevaluate("user", "trip"), "PENDING_PHONE");
  env.member.user.whatsappPhone = "5493412345678";
  assert.equal(await env.service.reevaluate("user", "trip"), "PENDING_CONSENT");
  await env.service.setConsent("user", "trip", true, "ONBOARDING");
  assert.equal((await env.service.state("user", "trip")).status, "WAITING_FOR_CONTACT");
  assert.equal(env.welcomes.size, 1, "una invitación o reevaluación no crea duplicados");
});

test("el consentimiento no se hereda al cambiar de número y la cuenta sin empresa no es elegible", async () => {
  const env = memory(); env.member.onboardingCompletedAt = new Date(); env.member.user.whatsappPhone = "5493412345678";
  await env.service.setConsent("user", "trip", true, "TRIP_WEB");
  env.member.user.whatsappPhone = "5493412345679";
  assert.equal(await env.service.reevaluate("user", "trip"), "PENDING_CONSENT");
  assert.equal(env.consents.has(`user:5493412345678:${WHATSAPP_OPERATIONAL_CONSENT_SCOPE}`), true);
  env.setCompanyCount(0);
  assert.equal(await env.service.reevaluate("user", "trip"), "CANCELLED");
});

test("dos eventos concurrentes activan y envían una sola bienvenida durable", async () => {
  const env = memory(); env.member.onboardingCompletedAt = new Date(); env.member.user.whatsappPhone = "5493412345678";
  await env.service.setConsent("user", "trip", true, "ONBOARDING");
  const activated = await Promise.all([env.service.activateFromInbound("user", "trip", "5493412345678"), env.service.activateFromInbound("user", "trip", "5493412345678")]);
  assert.equal(activated.filter(Boolean).length, 1);
  const sends: string[] = [];
  assert.equal(await env.service.flushReady(async (_phone, text, onMessageId) => { sends.push(text); onMessageId("provider-1"); }), true);
  assert.equal(await env.service.flushReady(async () => assert.fail("no debe reenviar")), false);
  assert.equal(sends.length, 1);
  assert.equal((await env.service.state("user", "trip")).status, "ACCEPTED");
  assert.equal(await env.service.applyDeliveryStatus("provider-1", "DELIVERED"), true);
  assert.equal((await env.service.state("user", "trip")).status, "DELIVERED");
});

test("un timeout queda como entrega incierta y un rechazo confirmado queda fallido sin reenvío ciego", async () => {
  for (const error of [new EvolutionTimeoutError(), new EvolutionRequestError(400)]) {
    const env = memory(); env.member.onboardingCompletedAt = new Date(); env.member.user.whatsappPhone = "5493412345678";
    await env.service.setConsent("user", "trip", true, "ONBOARDING"); await env.service.activateFromInbound("user", "trip", "5493412345678");
    await env.service.flushReady(async () => { throw error; });
    assert.equal((await env.service.state("user", "trip")).status, error instanceof EvolutionRequestError ? "FAILED" : "DELIVERY_UNKNOWN");
    assert.equal(await env.service.flushReady(async () => assert.fail("no debe reenviar")), false);
  }
});
