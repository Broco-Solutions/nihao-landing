import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DevelopmentTextExtractionAdapter } from "../../lib/bot/extraction/development-text-adapter.ts";
import { SupplierExtractionService } from "../../lib/bot/extraction/service.ts";
import { FileSupplierCaptureRepository } from "../../lib/bot/persistence/file-repository.ts";

test("corrige un solo campo, confirma y aísla usuarios y viajes", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "nihao-bot-test-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const repository = new FileSupplierCaptureRepository(path.join(directory, "database.json"));
  const extraction = await new SupplierExtractionService([new DevelopmentTextExtractionAdapter()]).extract({
    source: { type: "TEXT", text: "Esta fábrica se llama ABC Lighting, FOB 7 dólares por unidad, mínimo 300 y tarda 4 semanas." },
  });
  const capture = await repository.createDraft({ userId: "user-a", tripId: "trip-a", tripName: "Cantón", extraction });
  const corrected = await repository.correctField({
    userId: "user-a", tripId: "trip-a", captureId: capture.id, field: "category", value: "Iluminación", acknowledgedUnknown: false,
  });

  assert.equal(corrected.fields.category, "Iluminación");
  assert.equal(corrected.fields.companyName, "ABC Lighting");
  const confirmed = await repository.confirm({ userId: "user-a", tripId: "trip-a" }, capture.id);
  assert.equal(confirmed.capture.status, "CONFIRMED");
  assert.equal((await repository.listSuppliers({ userId: "user-a", tripId: "trip-a" })).length, 1);
  assert.equal((await repository.listSuppliers({ userId: "user-b", tripId: "trip-a" })).length, 0);
  assert.equal((await repository.listSuppliers({ userId: "user-a", tripId: "trip-b" })).length, 0);
});

test("permite confirmar categoría No sé como pendiente explícito", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "nihao-bot-unknown-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const repository = new FileSupplierCaptureRepository(path.join(directory, "database.json"));
  const extraction = await new SupplierExtractionService([new DevelopmentTextExtractionAdapter()]).extract({ source: { type: "TEXT", text: "Fábrica sin datos adicionales" } });
  const capture = await repository.createDraft({ userId: "user-a", tripId: "trip-a", tripName: "Cantón", extraction });
  const acknowledged = await repository.correctField({ userId: "user-a", tripId: "trip-a", captureId: capture.id, field: "category", value: null, acknowledgedUnknown: true });
  assert.ok(acknowledged.acknowledgedUnknownFields.includes("category"));
  const result = await repository.confirm({ userId: "user-a", tripId: "trip-a" }, capture.id);
  assert.ok(result.supplier.pendingFields.includes("category"));
});
