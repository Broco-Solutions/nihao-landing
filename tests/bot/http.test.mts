import test from "node:test";
import assert from "node:assert/strict";
import { AuthConfigurationError, AuthenticationRequiredError } from "../../lib/auth/errors.ts";
import { AuthorizationError } from "../../lib/bot/authorization.ts";
import { apiError } from "../../lib/bot/http.ts";

test("la API diferencia sesión requerida y acceso de viaje denegado", () => {
  assert.equal(apiError(new AuthenticationRequiredError()).status, 401);
  assert.equal(apiError(new AuthorizationError()).status, 403);
  assert.equal(apiError(new AuthConfigurationError()).status, 503);
});
