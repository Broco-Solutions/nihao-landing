import assert from "node:assert/strict";
import test from "node:test";
import { parsePassportNumber, ValidationError } from "../../lib/bot/validation.ts";

test("el pasaporte se normaliza, puede quitarse y valida el límite", () => {
  assert.equal(parsePassportNumber("  AB1234567  "), "AB1234567");
  assert.equal(parsePassportNumber(""), null);
  assert.equal(parsePassportNumber(null), null);
  assert.throws(() => parsePassportNumber(undefined), ValidationError);
  assert.throws(() => parsePassportNumber("x".repeat(65)), ValidationError);
});
