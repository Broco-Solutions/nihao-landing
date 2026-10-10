import assert from "node:assert/strict";
import test from "node:test";
import { betterAuthAdvancedOptions } from "../../lib/auth/auth.ts";

test("Better Auth usa la IP cliente confiable provista por Railway", () => {
  assert.deepEqual(betterAuthAdvancedOptions(), {
    ipAddress: { ipAddressHeaders: ["x-real-ip"] },
  });
});

test("la cabecera de IP se conserva junto con la cookie entre subdominios", () => {
  assert.deepEqual(betterAuthAdvancedOptions(".nihaonegocios.com"), {
    ipAddress: { ipAddressHeaders: ["x-real-ip"] },
    crossSubDomainCookies: { enabled: true, domain: ".nihaonegocios.com" },
  });
});
