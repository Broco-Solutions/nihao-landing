import assert from "node:assert/strict";
import test from "node:test";
import { SupplierExtractionService } from "../../lib/bot/extraction/service.ts";
import type { ExtractionInput, ExtractionProvider } from "../../lib/bot/extraction/contract.ts";
import { EMPTY_TIER_1_DATA, type ExtractionCandidate, type SupplierCaptureRecord } from "../../lib/bot/types.ts";
import { formatWhatsAppCaptureReply } from "../../lib/channels/whatsapp/capture-formatter.ts";
import { resolveWhatsAppIdentity } from "../../lib/channels/whatsapp/identity.ts";
import { WhatsAppCaptureService, normalizeMediaMimeType, whatsappCaptureId, whatsappEvidenceId } from "../../lib/channels/whatsapp/whatsapp-capture-service.ts";
import { normalizeWhatsAppPhone } from "../../lib/bot/whatsapp-phone.ts";
import { ValidationError } from "../../lib/bot/validation.ts";
import { AuthorizationError } from "../../lib/bot/authorization.ts";
import { PrismaTripWhatsAppRepository } from "../../lib/bot/persistence/prisma-trip-whatsapp-repository.ts";
import { createAttachmentStorageKey, validateAttachmentFile } from "../../lib/bot/attachments.ts";
import type { WhatsAppCard, WhatsAppCardRepository } from "../../lib/channels/whatsapp/prisma-card-repository.ts";

const emptyFields = { companyName: null, city: null, province: null, contact: null, category: null, supplierType: "UNKNOWN" as const, fob: null, moq: null, leadTime: null, interestScore: null };
function record(id = "wa_capture", userId = "user-a", tripId = "trip-a"): SupplierCaptureRecord { return { id, userId, tripId, supplierId: null, status: "DRAFT", source: { type: "TEXT", text: "Proveedor ABC FOB USD 4.20 MOQ 500" }, fields: { ...emptyFields, companyName: "Guangzhou ABC", fob: { amount: 4.2, currency: "USD", unit: "unidad", rawText: "USD 4.20/unidad" }, moq: { quantity: 500, unit: "unidades", notes: null, rawText: "500 unidades" } }, missingFields: ["category"], reviewFields: ["supplierType"], acknowledgedUnknownFields: [], evidence: [], humanCorrectedFields: [], analyzedAttachmentIds: [], needsReanalysis: false, createdAt: "2026-01-01", updatedAt: "2026-01-01", confirmedAt: null }; }

test("normaliza WhatsApp sin inferir el código de país", () => {
  assert.equal(normalizeWhatsAppPhone("+54 (934) 123-45678"), "5493412345678");
  assert.equal(normalizeWhatsAppPhone("3412345678"), "3412345678", "el helper no agrega ni infiere prefijos");
  assert.throws(() => normalizeWhatsAppPhone("+54 abc"), ValidationError);
});

test("el binding sólo permite actualizar el WhatsApp del propio TripMember", async () => {
  const members = new Map([["trip-a:user-a", { whatsappPhone: null as string | null }]]);
  const repository = new PrismaTripWhatsAppRepository({ tripMember: {
    async findUnique({ where }: { where: { tripId_userId: { tripId: string; userId: string } } }) { return members.get(`${where.tripId_userId.tripId}:${where.tripId_userId.userId}`) ?? null; },
    async update({ where, data }: { where: { tripId_userId: { tripId: string; userId: string } }; data: { whatsappPhone: string | null } }) { const member = members.get(`${where.tripId_userId.tripId}:${where.tripId_userId.userId}`)!; member.whatsappPhone = data.whatsappPhone; return member; },
  } } as never);
  assert.deepEqual(await repository.updateForMember("user-a", "trip-a", "+54 934 123-45678"), { tripId: "trip-a", whatsappPhone: "5493412345678" });
  await assert.rejects(repository.updateForMember("user-b", "trip-a", "5493412345678"), AuthorizationError);
});

test("resuelve ACTIVE y hace fallback a un único PLANNED", async () => {
  const repository = { async findByWhatsAppPhone() { return [{ userId: "u-active", tripId: "active", trip: { status: "ACTIVE" as const } }, { userId: "u-plan", tripId: "plan", trip: { status: "PLANNED" as const } }]; } };
  assert.deepEqual(await resolveWhatsAppIdentity("5493412345678", repository), { kind: "resolved", identity: { userId: "u-active", tripId: "active", phone: "5493412345678" } });
  assert.deepEqual(await resolveWhatsAppIdentity("5493412345678", { async findByWhatsAppPhone() { return [{ userId: "u-plan", tripId: "plan", trip: { status: "PLANNED" as const } }]; } }), { kind: "resolved", identity: { userId: "u-plan", tripId: "plan", phone: "5493412345678" } });
});

test("número sin membresía y viajes ambiguos no se resuelven", async () => {
  assert.deepEqual(await resolveWhatsAppIdentity("5493412345678", { async findByWhatsAppPhone() { return []; } }), { kind: "unlinked" });
  assert.deepEqual(await resolveWhatsAppIdentity("5493412345678", { async findByWhatsAppPhone() { return [{ userId: "u1", tripId: "a", trip: { status: "ACTIVE" as const } }, { userId: "u2", tripId: "b", trip: { status: "ACTIVE" as const } }]; } }), { kind: "ambiguous" });
});

class Provider implements ExtractionProvider { readonly name = "mock"; calls = 0; readonly sources: string[] = []; fail = false; supports() { return true; } async extract(input: ExtractionInput): Promise<ExtractionCandidate> { this.calls++; this.sources.push(input.source.type); if (this.fail) throw new Error("Mistral unavailable"); return { rawSource: input.source, extractedFields: record().fields, reviewFields: ["supplierType"], evidence: [] }; } }

function setup(candidates = [{ userId: "user-a", tripId: "trip-a", trip: { status: "ACTIVE" as const } }]) {
  const captures = new Map<string, SupplierCaptureRecord>(); const provider = new Provider();
  const attachments = new Map<string, { id: string; captureId: string; tripId: string; userId: string; type: "BUSINESS_CARD" | "AUDIO" }>();
  const states = new Map<string, WhatsAppCard>(); const receipts = new Map<string, { status: "PROCESSING" | "COMPLETED" | "FAILED" | "IGNORED"; supplierCaptureId: string | null }>(); let uploads = 0; let transcriptions = 0; let extractionRuns = 0; let uploadFails = false;
  let lockTail: Promise<void> = Promise.resolve();
  const cards: WhatsAppCardRepository = {
    async withUserLock(_context, work) { const previous = lockTail; let unlock!: () => void; lockTail = new Promise<void>((resolve) => { unlock = resolve; }); await previous; try { return await work(); } finally { unlock(); } },
    async findActive(context) { return [...states.values()].find((card) => (card.state === "PENDING" || card.state === "ANALYZING") && captures.get(card.id)?.userId === context.userId && captures.get(card.id)?.tripId === context.tripId) ?? null; },
    async get(context, id) { const card = states.get(id); return card && captures.get(id)?.userId === context.userId && captures.get(id)?.tripId === context.tripId ? card : null; },
    async createPending(context, id, evidenceId) { const active = await this.findActive(context); if (active) return { card: active, created: false }; const capture = record(id, context.userId, context.tripId); capture.source = { type: "IMAGE_BUSINESS_CARD", attachmentId: evidenceId }; capture.fields = { ...EMPTY_TIER_1_DATA }; captures.set(id, capture); const card: WhatsAppCard = { id, state: "PENDING", analyzedAttachmentIds: [], updatedAt: new Date() }; states.set(id, card); return { card, created: true }; },
    async beginAnalyzeCommand(context, instance, messageId, staleBefore) { const key = `${instance}:${messageId}`; const existing = receipts.get(key); if (existing) return { kind: "existing", receipt: existing } as const; const active = await this.findActive(context); if (!active) { const receipt = { status: "IGNORED" as const, supplierCaptureId: null }; receipts.set(key, receipt); return { kind: "ignored", receipt } as const; } if (active.state === "ANALYZING" && active.updatedAt <= staleBefore) { for (const receipt of receipts.values()) if (receipt.supplierCaptureId === active.id && receipt.status === "PROCESSING") receipt.status = "FAILED"; active.state = "PENDING"; } const owned = active.state === "PENDING"; if (owned) { active.state = "ANALYZING"; active.updatedAt = new Date(); } const receipt = { status: owned ? "PROCESSING" as const : "IGNORED" as const, supplierCaptureId: active.id }; receipts.set(key, receipt); return { kind: owned ? "owned" as const : "ignored" as const, receipt }; },
    async settleAnalyzeCommand(context, instance, messageId, id, status) { const receipt = receipts.get(`${instance}:${messageId}`); const card = await this.get(context, id); if (!receipt || receipt.status !== "PROCESSING" || receipt.supplierCaptureId !== id || card?.state !== "ANALYZING") return false; receipt.status = status; card.state = status === "COMPLETED" ? "ANALYZED" : "PENDING"; card.updatedAt = new Date(); return true; },
    async deleteIfEmpty(context, id) { const card = await this.get(context, id); if (card?.state !== "PENDING" || [...attachments.values()].some((item) => item.captureId === id)) return false; captures.delete(id); states.delete(id); return true; },
  };
  const repository = { async hasTripAccess() { return true; }, async getCapture(_context: unknown, id: string) { return captures.get(id) ?? null; }, async createDraft(input: { clientCaptureId?: string; userId: string; tripId: string; extraction: { extractedFields: SupplierCaptureRecord["fields"]; rawSource: SupplierCaptureRecord["source"] } }) { const item = record(input.clientCaptureId, input.userId, input.tripId); item.source = input.extraction.rawSource; item.fields = input.extraction.extractedFields; captures.set(item.id, item); return item; }, async replaceExtraction(_context: unknown, id: string, extraction: { extractedFields: SupplierCaptureRecord["fields"] }, options?: { analyzedAttachmentIds?: string[] }) { const item = captures.get(id)!; item.fields = extraction.extractedFields; item.analyzedAttachmentIds = options?.analyzedAttachmentIds ?? []; return item; }, async correctField() { throw new Error("not used"); }, async confirm() { throw new Error("not used"); }, async listCaptures() { return []; } } as unknown as import("../../lib/bot/persistence/repository.ts").SupplierCaptureRepository & import("../../lib/bot/persistence/repository.ts").TripAccessRepository;
  const attachmentService = { async upload(input: { captureId: string; tripId: string; userId: string; clientEvidenceId?: string; type: "BUSINESS_CARD" | "AUDIO"; mimeType: string; size: number }) { if (uploadFails) throw new Error("R2 unavailable"); const mimeType = validateAttachmentFile(input.mimeType, input.size, input.type); createAttachmentStorageKey({ tripId: input.tripId, captureId: input.captureId, mimeType, id: input.clientEvidenceId }); uploads++; const id = input.clientEvidenceId!; const attachment = { id, captureId: input.captureId, tripId: input.tripId, userId: input.userId, type: input.type }; attachments.set(id, attachment); return attachment; }, async get(id: string) { return attachments.get(id) ?? null; }, async list(_context: unknown, captureId: string) { return [...attachments.values()].filter((item) => item.captureId === captureId); } };
  const transcription = { async transcribe() { transcriptions++; return { text: "Proveedor audio" , model: "mock" }; } };
  const extraction = new SupplierExtractionService([provider]); const extractMany = extraction.extractMany.bind(extraction);
  extraction.extractMany = async (inputs) => { extractionRuns++; return extractMany(inputs); };
  return { provider, captures, attachments, states, receipts, cards, get uploads() { return uploads; }, get transcriptions() { return transcriptions; }, get extractionRuns() { return extractionRuns; }, set uploadFails(value: boolean) { uploadFails = value; }, service: new WhatsAppCaptureService({ identities: { async findByWhatsAppPhone() { return candidates; } }, captures: repository, cards, attachments: attachmentService as never, transcription: transcription as never, extraction }) };
}

test("texto crea DRAFT con user/trip resueltos y nunca confirma", async () => {
  const fixture = setup(); const result = await fixture.service.capture({ instance: "nihao", messageId: "msg-1", phone: "5493412345678", text: "Proveedor ABC" });
  assert.equal(result.kind, "captured"); const item = fixture.captures.get(whatsappCaptureId("nihao", "msg-1"))!;
  assert.equal(item.userId, "user-a"); assert.equal(item.tripId, "trip-a"); assert.equal(item.status, "DRAFT"); assert.equal(item.confirmedAt, null);
});

test("mismo message id no duplica ni vuelve a extraer", async () => {
  const fixture = setup(); const input = { instance: "nihao", messageId: "same", phone: "5493412345678", text: "Proveedor ABC" };
  const result = await fixture.service.capture(input); await fixture.service.capture(input);
  assert.equal(result.kind, "captured");
  assert.equal(fixture.captures.size, 1); assert.equal(fixture.provider.calls, 1);
});

function imageInput(messageId: string) { return { instance: "nihao", messageId, phone: "5493412345678", type: "IMAGE" as const, media: { key: { id: messageId, remoteJid: "5493412345678@s.whatsapp.net", fromMe: false }, message: { imageMessage: {} } }, getMedia: async () => ({ bytes: new Uint8Array([0xff, 0xd8, 0xff]), mimeType: "image/jpeg" }) }; }
function analyzeInput(messageId: string) { return { instance: "nihao", messageId, phone: "5493412345678", type: "TEXT" as const, text: "analizar tarjeta" }; }

test("primera IMAGE crea tarjeta PENDING sin OCR y duplicado no sube otra vez", async () => {
  const fixture = setup(); const input = imageInput("image-1");
  const first = await fixture.service.capture(input); const duplicate = await fixture.service.capture(input);
  assert.match(first.text, /Foto recibida/); assert.equal(duplicate.text, first.text);
  const captureId = whatsappCaptureId("nihao", "image-1");
  assert.equal(fixture.states.get(captureId)?.state, "PENDING");
  assert.equal(fixture.captures.get(captureId)?.status, "DRAFT");
  assert.equal(fixture.captures.size, 1); assert.equal(fixture.uploads, 1); assert.equal(fixture.provider.calls, 0);
  assert.equal(fixture.attachments.get(whatsappEvidenceId("nihao", "image-1"))?.captureId, captureId);
});

test("deliveries IMAGE simultáneos comparten descarga y extracción", async () => {
  const fixture = setup(); let downloads = 0; let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  const input = { instance: "nihao", messageId: "image-concurrent", phone: "5493412345678", type: "IMAGE" as const, media: { key: { id: "image-concurrent", remoteJid: "5493412345678@s.whatsapp.net", fromMe: false }, message: { imageMessage: {} } }, getMedia: async () => { downloads++; await gate; return { bytes: new Uint8Array([0xff, 0xd8, 0xff]), mimeType: "image/jpeg" }; } };
  const first = fixture.service.capture(input); const second = fixture.service.capture(input); release(); await Promise.all([first, second]);
  assert.equal(downloads, 1); assert.equal(fixture.uploads, 1); assert.equal(fixture.provider.calls, 0);
});

test("dos primeras IMAGE concurrentes usan una captura y dos attachments", async () => {
  const fixture = setup(); await Promise.all([fixture.service.capture(imageInput("front")), fixture.service.capture(imageInput("back"))]);
  assert.equal(fixture.captures.size, 1); assert.equal(fixture.attachments.size, 2); assert.equal(fixture.uploads, 2);
  assert.equal(new Set([...fixture.attachments.values()].map((item) => item.captureId)).size, 1);
});

test("segunda y tercera IMAGE se acumulan; cuarta se rechaza sin upload", async () => {
  const fixture = setup(); await fixture.service.capture(imageInput("one"));
  const second = await fixture.service.capture(imageInput("two")); const third = await fixture.service.capture(imageInput("three"));
  const fourth = await fixture.service.capture(imageInput("four"));
  assert.match(second.text, /Segunda foto/); assert.match(third.text, /Tercera foto/); assert.match(fourth.text, /máximo de 3/);
  assert.equal(fixture.captures.size, 1); assert.equal(fixture.attachments.size, 3); assert.equal(fixture.uploads, 3); assert.equal(fixture.provider.calls, 0);
});

test("analizar tarjeta usa todas las imágenes una vez y deja DRAFT + ANALYZED", async () => {
  const fixture = setup(); await fixture.service.capture(imageInput("front")); await fixture.service.capture(imageInput("back"));
  const result = await fixture.service.capture(analyzeInput("command-1"));
  const duplicate = await fixture.service.capture(analyzeInput("command-1"));
  assert.match(result.text, /Tarjeta analizada ✅/); assert.match(result.text, /pendiente de revisión en Nihao\.$/);
  assert.match(duplicate.text, /ya fue analizada/);
  assert.equal(fixture.captures.size, 1); assert.equal(fixture.extractionRuns, 1); assert.equal(fixture.provider.calls, 2);
  const card = [...fixture.states.values()][0]; assert.equal(card.state, "ANALYZED");
  const capture = fixture.captures.get(card.id)!; assert.equal(capture.status, "DRAFT"); assert.equal(capture.analyzedAttachmentIds.length, 2);
  await fixture.service.capture(imageInput("front")); assert.equal(fixture.uploads, 2, "el retry tardío no reenvía evidencia");
});

test("comando sin tarjeta pendiente no crea captura ni llama OCR", async () => {
  const fixture = setup(); const result = await fixture.service.capture(analyzeInput("orphan-command"));
  assert.equal(result.text, "No tenés una tarjeta pendiente para analizar.");
  assert.equal(fixture.captures.size, 0); assert.equal(fixture.extractionRuns, 0);
  assert.deepEqual(fixture.receipts.get("nihao:orphan-command"), { status: "IGNORED", supplierCaptureId: null });
  await fixture.service.capture(imageInput("later-card"));
  await fixture.service.capture(analyzeInput("orphan-command"));
  assert.equal(fixture.extractionRuns, 0);
  assert.equal(fixture.states.get(whatsappCaptureId("nihao", "later-card"))?.state, "PENDING");
});

test("dos comandos concurrentes adquieren un solo análisis", async () => {
  const fixture = setup(); await fixture.service.capture(imageInput("concurrent-card"));
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  const original = fixture.provider.extract.bind(fixture.provider);
  fixture.provider.extract = async (input) => { await gate; return original(input); };
  const first = fixture.service.capture(analyzeInput("analyze-a"));
  await new Promise<void>((resolve) => setImmediate(resolve));
  const second = await fixture.service.capture(analyzeInput("analyze-b"));
  assert.match(second.text, /se está analizando/); release(); await first;
  assert.equal(fixture.extractionRuns, 1); assert.equal(fixture.provider.calls, 1);
  assert.equal(fixture.receipts.get("nihao:analyze-a")?.status, "COMPLETED");
  assert.equal(fixture.receipts.get("nihao:analyze-b")?.status, "IGNORED");
  await fixture.service.capture(imageInput("next-card"));
  await fixture.service.capture(analyzeInput("analyze-b"));
  assert.equal(fixture.extractionRuns, 1);
});

test("fallo de extracción vuelve a PENDING sin perder evidencia y permite retry", async () => {
  const fixture = setup(); await fixture.service.capture(imageInput("retry-card")); fixture.provider.fail = true;
  const failed = await fixture.service.capture(analyzeInput("retry-a"));
  assert.match(failed.text, /fotos siguen guardadas/); assert.equal([...fixture.states.values()][0].state, "PENDING"); assert.equal(fixture.attachments.size, 1);
  assert.equal(fixture.receipts.get("nihao:retry-a")?.status, "FAILED");
  fixture.provider.fail = false; const result = await fixture.service.capture(analyzeInput("retry-b"));
  assert.match(result.text, /Tarjeta analizada/); assert.equal([...fixture.states.values()][0].state, "ANALYZED");
  await fixture.service.capture(imageInput("third-card"));
  const runs = fixture.extractionRuns;
  await fixture.service.capture(analyzeInput("retry-a"));
  await fixture.service.capture(analyzeInput("retry-b"));
  assert.equal(fixture.extractionRuns, runs, "ningún receipt antiguo analiza una tarjeta nueva");
});

test("duplicado exacto PROCESSING no inicia un segundo extractor", async () => {
  const fixture = setup(); await fixture.service.capture(imageInput("processing-card"));
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  fixture.provider.extract = async (input) => { await gate; return { rawSource: input.source, extractedFields: record().fields, reviewFields: [], evidence: [] }; };
  const first = fixture.service.capture(analyzeInput("processing-command"));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(fixture.receipts.get("nihao:processing-command")?.status, "PROCESSING");
  const duplicate = await fixture.cards.beginAnalyzeCommand({ userId: "user-a", tripId: "trip-a" }, "nihao", "processing-command", new Date(Date.now() - 600_000));
  assert.equal(duplicate.kind, "existing"); assert.equal(duplicate.receipt.status, "PROCESSING");
  release(); await first;
  assert.equal(fixture.extractionRuns, 1);
});

test("ANALYZING rechaza otra IMAGE y stale ANALYZING se puede recuperar", async () => {
  const fixture = setup(); await fixture.service.capture(imageInput("busy-card"));
  const card = [...fixture.states.values()][0]; card.state = "ANALYZING";
  const busy = await fixture.service.capture(imageInput("busy-image")); assert.match(busy.text, /se está analizando/); assert.equal(fixture.attachments.size, 1);
  card.updatedAt = new Date(Date.now() - 11 * 60 * 1000);
  const result = await fixture.service.capture(analyzeInput("stale-command"));
  assert.match(result.text, /Tarjeta analizada/); assert.equal(card.state, "ANALYZED");
});

test("recovery de ANALYZING con extracción persistida no repite OCR", async () => {
  const fixture = setup(); await fixture.service.capture(imageInput("saved-card"));
  const card = [...fixture.states.values()][0]; const capture = fixture.captures.get(card.id)!;
  capture.analyzedAttachmentIds = [whatsappEvidenceId("nihao", "saved-card")];
  card.state = "ANALYZING"; card.updatedAt = new Date(Date.now() - 11 * 60 * 1000);
  const result = await fixture.service.capture(analyzeInput("recover-saved"));
  assert.match(result.text, /Tarjeta analizada/); assert.equal(card.state, "ANALYZED"); assert.equal(fixture.extractionRuns, 0);
});

test("nueva IMAGE luego de ANALYZED inicia otra captura; drafts Web/NULL no se mezclan", async () => {
  const fixture = setup(); const web = record("web-draft"); web.source = { type: "IMAGE_BUSINESS_CARD", attachmentId: "web-evidence" }; web.analyzedAttachmentIds = []; fixture.captures.set(web.id, web);
  assert.equal(await fixture.cards.findActive({ userId: "user-a", tripId: "trip-a" }), null);
  await fixture.service.capture(imageInput("old-card")); await fixture.service.capture(analyzeInput("old-command"));
  await fixture.service.capture(imageInput("new-card"));
  assert.equal(fixture.captures.size, 3); assert.equal(fixture.states.get(whatsappCaptureId("nihao", "old-card"))?.state, "ANALYZED");
  assert.equal(fixture.states.get(whatsappCaptureId("nihao", "new-card"))?.state, "PENDING");
  assert.equal(fixture.attachments.get(whatsappEvidenceId("nihao", "new-card"))?.captureId, whatsappCaptureId("nihao", "new-card"));
});

test("fallos antes de evidencia no dejan draft vacío; con evidencia no hay cleanup", async () => {
  const fixture = setup(); const failedDownload = { ...imageInput("missing-media"), getMedia: async () => { throw new Error("Evolution down"); } };
  assert.match((await fixture.service.capture(failedDownload)).text, /No pude descargar/); assert.equal(fixture.captures.size, 0);
  fixture.uploadFails = true; await fixture.service.capture(imageInput("failed-upload")); assert.equal(fixture.captures.size, 0);
  fixture.uploadFails = false; await fixture.service.capture(imageInput("kept-card")); fixture.uploadFails = true;
  await fixture.service.capture(imageInput("failed-second")); assert.equal(fixture.captures.size, 1); assert.equal(fixture.attachments.size, 1);
});

test("AUDIO crea DRAFT, usa transcripción existente, normaliza OGG y no repite", async () => {
  const fixture = setup(); let downloads = 0;
  const input = { instance: "nihao", messageId: "audio-1", phone: "5493412345678", type: "AUDIO" as const, media: { key: { id: "audio-1", remoteJid: "5493412345678@s.whatsapp.net", fromMe: false }, message: { audioMessage: {} } }, getMedia: async () => { downloads++; return { bytes: new Uint8Array([0x4f, 0x67, 0x67, 0x53]), mimeType: "audio/ogg; codecs=opus" }; } };
  const result = await fixture.service.capture(input); await fixture.service.capture(input);
  assert.equal(result.kind, "captured");
  assert.equal(downloads, 1);
  assert.equal(fixture.uploads, 1);
  assert.equal(fixture.transcriptions, 1);
  assert.equal(fixture.provider.calls, 1, fixture.provider.sources.join(","));
  assert.equal(normalizeMediaMimeType("audio/ogg; codecs=opus"), "audio/ogg");
});

test("devuelve las reglas existentes cuando imagen o audio supera el límite", async () => {
  const fixture = setup();
  const image = await fixture.service.capture({ instance: "nihao", messageId: "large-image", phone: "5493412345678", type: "IMAGE", media: { key: { id: "large-image", remoteJid: "x@s.whatsapp.net", fromMe: false }, message: { imageMessage: {} } }, getMedia: async () => ({ bytes: new Uint8Array(8 * 1024 * 1024 + 1), mimeType: "image/jpeg" }) });
  const audio = await fixture.service.capture({ instance: "nihao", messageId: "large-audio", phone: "5493412345678", type: "AUDIO", media: { key: { id: "large-audio", remoteJid: "x@s.whatsapp.net", fromMe: false }, message: { audioMessage: {} } }, getMedia: async () => ({ bytes: new Uint8Array(25 * 1024 * 1024 + 1), mimeType: "audio/ogg" }) });
  assert.match(image.text, /8 MB/); assert.match(audio.text, /25 MB/);
});

test("formatter sólo muestra los campos existentes", () => {
  const reply = formatWhatsAppCaptureReply(record()); assert.match(reply, /Guangzhou ABC/); assert.match(reply, /FOB/); assert.doesNotMatch(reply, /Provincia/); assert.match(reply, /pendiente de revisión/);
});

test("formatter incluye categoría, tipo de proveedor e interés", () => {
  const item = record(); item.fields.category = "Iluminación"; item.fields.supplierType = "FACTORY"; item.fields.interestScore = 4;
  const reply = formatWhatsAppCaptureReply(item); assert.match(reply, /Categoría: Iluminación/); assert.match(reply, /Tipo de proveedor: FACTORY/); assert.match(reply, /Interés: 4/);
});

test("resumen de tarjeta muestra sólo campos existentes y cierra con revisión humana", () => {
  const item = record(); item.fields.category = "Imprenta"; item.fields.supplierType = "FACTORY";
  item.fields.contact = "Marcelo Có"; item.fields.city = "Rosario"; item.fields.province = "Santa Fe";
  item.fields.moq = { quantity: 500, unit: "unidades", notes: null, rawText: "500 unidades" };
  item.fields.leadTime = { rawText: "30 días", days: 30 }; item.fields.interestScore = 3;
  const reply = formatWhatsAppCaptureReply(item, "Tarjeta analizada ✅", false);
  for (const label of ["Empresa:", "Categoría:", "Tipo de proveedor:", "Contacto:", "Ciudad:", "Provincia:", "FOB:", "MOQ:", "Entrega:", "Interés:"]) assert.match(reply, new RegExp(label));
  assert.doesNotMatch(reply, /Falta revisar/); assert.match(reply, /La captura quedó pendiente de revisión en Nihao\.$/);
});

test("error de extracción devuelve respuesta estable", async () => {
  const fixture = setup(); fixture.provider.fail = true; const result = await fixture.service.capture({ instance: "nihao", messageId: "broken", phone: "5493412345678", text: "Proveedor ABC" });
  assert.deepEqual(result, { kind: "failed", text: "No pude analizar ese mensaje. Probá nuevamente en unos segundos." });
});
