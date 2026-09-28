import assert from "node:assert/strict";
import { test } from "node:test";
import { isTravelerOnboardingRequired } from "../../lib/bot/onboarding-policy.ts";

test("TRAVELER pendiente requiere onboarding y ADMIN nunca queda bloqueado", () => {
  assert.equal(isTravelerOnboardingRequired("TRAVELER", null), true);
  assert.equal(isTravelerOnboardingRequired("ADMIN", null), false);
});

test("TRAVELER completo entra directamente al viaje", () => {
  assert.equal(isTravelerOnboardingRequired("TRAVELER", new Date()), false);
  assert.equal(isTravelerOnboardingRequired("TRAVELER", new Date().toISOString()), false);
});
