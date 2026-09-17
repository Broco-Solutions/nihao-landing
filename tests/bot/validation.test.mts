import test from "node:test";
import assert from "node:assert/strict";
import { ValidationError, parseExtractionRequest } from "../../lib/bot/validation.ts";

test("la entrada productiva no acepta userId como fuente de identidad", () => {
  assert.throws(
    () => parseExtractionRequest({ userId: "other-user", source: { type: "TEXT", text: "Proveedor ABC" } }),
    ValidationError,
  );
  const input = parseExtractionRequest({
    userId: "other-user",
    tripId: "trip-a",
    source: { type: "TEXT", text: "Proveedor ABC" },
  });
  assert.equal(input.tripId, "trip-a");
  assert.equal("userId" in input, false);
});
