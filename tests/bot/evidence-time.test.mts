import assert from "node:assert/strict";
import test from "node:test";
import { formatEvidenceTimeRange } from "../../lib/channels/whatsapp/evidence-time.ts";

test("muestra fecha y hora para una fuente", () => {
  assert.equal(
    formatEvidenceTimeRange(["2026-10-12T11:38:40.000Z"]),
    "12 oct 2026, 19:38 · hora de China",
  );
});

test("muestra un rango horario ordenado para fuentes del mismo día", () => {
  assert.equal(formatEvidenceTimeRange([
    "2026-10-12T12:02:00.000Z",
    "2026-10-12T11:58:00.000Z",
  ]), "12 oct 2026, 19:58–20:02 · hora de China");
});

test("muestra ambas fechas cuando las fuentes abarcan días distintos", () => {
  assert.equal(formatEvidenceTimeRange([
    "2026-10-13T03:10:00.000Z",
    "2026-10-12T11:58:00.000Z",
  ]), "12 oct 2026, 19:58 – 13 oct 2026, 11:10 · hora de China");
});
