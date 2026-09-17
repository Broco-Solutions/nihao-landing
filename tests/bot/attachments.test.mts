import test from "node:test";
import assert from "node:assert/strict";
import { AttachmentService, MAX_ATTACHMENT_SIZE, createAttachmentStorageKey, validateAttachmentContent, validateAttachmentFile, type AttachmentRepository } from "../../lib/bot/attachments.ts";
import { AuthenticationRequiredError } from "../../lib/auth/errors.ts";
import { AuthorizationError } from "../../lib/bot/authorization.ts";
import { apiError } from "../../lib/bot/http.ts";
import type { StorageObjectInput, StorageProvider } from "../../lib/bot/storage/provider.ts";
import type { AttachmentType, SupplierAttachmentRecord } from "../../lib/bot/types.ts";
import { ValidationError } from "../../lib/bot/validation.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DevelopmentTextExtractionAdapter } from "../../lib/bot/extraction/development-text-adapter.ts";
import { SupplierExtractionService } from "../../lib/bot/extraction/service.ts";
import { FileSupplierCaptureRepository } from "../../lib/bot/persistence/file-repository.ts";

class MemoryStorage implements StorageProvider {
  objects = new Map<string, Uint8Array>();
  deleted: string[] = [];
  async put(input: StorageObjectInput) { this.objects.set(input.key, input.body as Uint8Array); }
  async get() { return null; }
  async delete(key: string) { this.objects.delete(key); this.deleted.push(key); }
  async signedUrl({ key, expiresInSeconds }: { key: string; expiresInSeconds: number }) { return `https://private.invalid/${key}?expires=${expiresInSeconds}`; }
}

class MemoryAttachments implements AttachmentRepository {
  allowed = new Set(["user-a:trip-a", "user-b:trip-a"]);
  captures = new Map([
    ["capture-a", { id: "capture-a", tripId: "trip-a", createdById: "user-a" }],
    ["capture-b", { id: "capture-b", tripId: "trip-a", createdById: "user-b" }],
  ]);
  attachments: SupplierAttachmentRecord[] = [];
  reanalysis: Array<{ captureId: string; attachmentId: string }> = [];
  async hasTripAccess({ userId, tripId }: { userId: string; tripId: string }) { return this.allowed.has(`${userId}:${tripId}`); }
  async getTripMemberRole({ userId }: { userId: string; tripId: string }) { return userId === "user-b" ? "ADMIN" as const : userId === "user-a" ? "TRAVELER" as const : null; }
  async getCapture(id: string) { return this.captures.get(id) ?? null; }
  async create(input: { supplierCaptureId: string; type: AttachmentType; storageKey: string; mimeType: string; size: number }) {
    const capture = this.captures.get(input.supplierCaptureId)!;
    const record: SupplierAttachmentRecord = { id: `attachment-${this.attachments.length + 1}`, userId: capture.createdById, tripId: capture.tripId, captureId: capture.id, type: input.type, storageKey: input.storageKey, mimeType: input.mimeType, size: input.size, createdAt: new Date(0).toISOString() };
    this.attachments.push(record);
    return record;
  }
  async list(captureId: string) { return this.attachments.filter((item) => item.captureId === captureId); }
  async get(id: string) { return this.attachments.find((item) => item.id === id) ?? null; }
  async deleteMetadata(id: string) { this.attachments = this.attachments.filter((item) => item.id !== id); }
  async markCaptureForReanalysis(captureId: string, attachmentId: string) { this.reanalysis.push({ captureId, attachmentId }); }
}

test("el endpoint de upload convierte una sesión ausente en 401", () => {
  assert.equal(apiError(new AuthenticationRequiredError("Tenés que iniciar sesión")).status, 401);
});

test("valida MIME y tamaño antes de guardar", () => {
  assert.throws(() => validateAttachmentFile("application/pdf", 100), ValidationError);
  assert.throws(() => validateAttachmentFile("image/jpeg", MAX_ATTACHMENT_SIZE + 1), ValidationError);
  assert.equal(validateAttachmentFile("image/webp", 200), "image/webp");
  assert.doesNotThrow(() => validateAttachmentContent("image/png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])));
  assert.throws(() => validateAttachmentContent("image/jpeg", new TextEncoder().encode("not an image")), ValidationError);
});

test("genera storageKey server-side seguro sin usar filename del navegador", () => {
  const key = createAttachmentStorageKey({ tripId: "trip-a", captureId: "capture-a", mimeType: "image/jpeg", id: "12345678-safe" });
  assert.equal(key, "trips/trip-a/captures/capture-a/12345678-safe.jpg");
  assert.ok(!key.includes(".."));
  assert.throws(() => createAttachmentStorageKey({ tripId: "../trip", captureId: "capture-a", mimeType: "image/png" }), ValidationError);
});

test("rechaza upload fuera del Trip y sobre una captura ajena", async () => {
  const service = new AttachmentService(new MemoryAttachments(), new MemoryStorage());
  const file = { captureId: "capture-a", type: "BUSINESS_CARD", mimeType: "image/jpeg", size: 3, body: new Uint8Array([0xff, 0xd8, 0xff]) };
  await assert.rejects(service.upload({ ...file, userId: "outside", tripId: "trip-a" }), AuthorizationError);
  await assert.rejects(service.upload({ ...file, captureId: "capture-b", userId: "user-a", tripId: "trip-a" }), AuthorizationError);
});

test("persiste metadata, lista URL firmada y elimina objeto y registro", async () => {
  const repository = new MemoryAttachments();
  const storage = new MemoryStorage();
  const service = new AttachmentService(repository, storage);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const created = await service.upload({ userId: "user-a", tripId: "trip-a", captureId: "capture-a", type: "PRODUCT_IMAGE", mimeType: "image/png", size: png.length, body: png });
  assert.equal(created.type, "PRODUCT_IMAGE");
  assert.equal(created.mimeType, "image/png");
  assert.equal(created.size, png.length);
  assert.match(created.storageKey, /^trips\/trip-a\/captures\/capture-a\/[a-f0-9-]+\.png$/);
  assert.match(created.url, /expires=300$/);
  assert.equal(storage.objects.size, 1);

  const listed = await service.list({ userId: "user-b", tripId: "trip-a" }, "capture-a");
  assert.equal(listed.length, 1);
  assert.match(listed[0].url, /^https:\/\/private\.invalid\//);

  await service.delete({ userId: "user-a", tripId: "trip-a" }, "capture-a", created.id);
  assert.equal(repository.attachments.length, 0);
  assert.deepEqual(storage.deleted, [created.storageKey]);
  assert.deepEqual(repository.reanalysis, [], "una foto de producto no participa de la extracción estructurada");
});

test("una captura conserva una colección de tarjetas, audios y fotos", async () => {
  const repository = new MemoryAttachments();
  const service = new AttachmentService(repository, new MemoryStorage());
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
  await service.upload({ userId: "user-a", tripId: "trip-a", captureId: "capture-a", type: "BUSINESS_CARD", mimeType: "image/png", size: png.length, body: png });
  await service.upload({ userId: "user-a", tripId: "trip-a", captureId: "capture-a", type: "BUSINESS_CARD", mimeType: "image/png", size: png.length, body: png });
  await service.upload({ userId: "user-a", tripId: "trip-a", captureId: "capture-a", type: "PRODUCT_IMAGE", mimeType: "image/png", size: png.length, body: png });
  await service.upload({ userId: "user-a", tripId: "trip-a", captureId: "capture-a", type: "AUDIO", mimeType: "audio/webm", size: webm.length, body: webm });
  await service.upload({ userId: "user-a", tripId: "trip-a", captureId: "capture-a", type: "AUDIO", mimeType: "audio/webm", size: webm.length, body: webm });
  const attachments = await service.list({ userId: "user-a", tripId: "trip-a" }, "capture-a");
  assert.equal(attachments.filter((item) => item.type === "BUSINESS_CARD").length, 2);
  assert.equal(attachments.filter((item) => item.type === "PRODUCT_IMAGE").length, 1);
  assert.equal(attachments.filter((item) => item.type === "AUDIO").length, 2);
  assert.ok(attachments.every((item) => item.captureId === "capture-a"));
});

test("un viajero no puede listar adjuntos de una captura ajena", async () => {
  const repository = new MemoryAttachments();
  const service = new AttachmentService(repository, new MemoryStorage());
  await assert.rejects(service.list({ userId: "user-a", tripId: "trip-a" }, "capture-b"), AuthorizationError);
});

test("flujo productivo Trip → Capture → Attachment → Confirm", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "nihao-product-flow-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const captures = new FileSupplierCaptureRepository(path.join(directory, "database.json"));
  const extraction = await new SupplierExtractionService([new DevelopmentTextExtractionAdapter()]).extract({ source: { type: "TEXT", text: "Fábrica Bright Co, FOB 9 USD, mínimo 200." } });
  const capture = await captures.createDraft({ userId: "user-a", tripId: "trip-a", tripName: "Cantón", extraction });

  const attachmentRepository = new MemoryAttachments();
  attachmentRepository.captures.set(capture.id, { id: capture.id, tripId: capture.tripId, createdById: capture.userId });
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff]);
  const attachment = await new AttachmentService(attachmentRepository, new MemoryStorage()).upload({ userId: "user-a", tripId: "trip-a", captureId: capture.id, type: "BUSINESS_CARD", mimeType: "image/jpeg", size: jpeg.length, body: jpeg });
  assert.equal(attachment.captureId, capture.id);

  await captures.correctField({ userId: "user-a", tripId: "trip-a", captureId: capture.id, field: "category", value: "Iluminación", acknowledgedUnknown: false });
  const confirmed = await captures.confirm({ userId: "user-a", tripId: "trip-a" }, capture.id);
  assert.equal(confirmed.capture.status, "CONFIRMED");
  assert.equal(confirmed.supplier.category, "Iluminación");
});
