import { SupplierExtractionService } from "../../lib/bot/extraction/service.ts";
import { EMPTY_TIER_1_DATA, type SupplierCaptureRecord } from "../../lib/bot/types.ts";
import { calculateMissingFields } from "../../lib/bot/tier1.ts";
import { processWhatsAppWebhook } from "../../lib/channels/evolution/webhook.ts";
import { WhatsAppCaptureService, whatsappCaptureId } from "../../lib/channels/whatsapp/whatsapp-capture-service.ts";
import type { WhatsAppCard, WhatsAppCardRepository } from "../../lib/channels/whatsapp/prisma-card-repository.ts";
import type { EvalCase } from "../core/types.ts";

function caseResult(caseId: string, pass: boolean, metadata: Record<string, unknown> = {}, xfail = false): EvalCase {
  return { caseId, suite: "channel", status: xfail ? (pass ? "XPASS" : "XFAIL") : pass ? "PASS" : "FAIL",
    correctFields: [], missingExpectedFields: [], wrongFields: [], hallucinatedFields: [], reviewExpected: [], reviewActual: [], reviewCorrect: null,
    latencyMs: 0, model: null, metadata };
}
function fixture() {
  const captures = new Map<string, SupplierCaptureRecord>(); const states = new Map<string, WhatsAppCard>();
  const attachments = new Map<string, { id: string; captureId: string; tripId: string; userId: string; type: "BUSINESS_CARD" }>();
  const receipts = new Map<string, { status: "PROCESSING" | "COMPLETED" | "FAILED" | "IGNORED"; supplierCaptureId: string | null }>();
  let extractCalls = 0; let uploads = 0;
  let tail: Promise<void> = Promise.resolve();
  const cards: WhatsAppCardRepository = {
    async withUserLock(_context, work) { const previous = tail; let done!: () => void; tail = new Promise<void>((resolve) => { done = resolve; }); await previous; try { return await work(); } finally { done(); } },
    async findActive() { return [...states.values()].find((card) => card.state === "PENDING" || card.state === "ANALYZING") ?? null; },
    async get(_context, id) { return states.get(id) ?? null; },
    async createPending(context, id, evidenceId) { const active = await this.findActive(context); if (active) return { card: active, created: false }; const card: WhatsAppCard = { id, state: "PENDING", analyzedAttachmentIds: [], updatedAt: new Date() }; states.set(id, card); captures.set(id, makeCapture(id, context.userId, context.tripId, evidenceId)); return { card, created: true }; },
    async beginAnalyzeCommand(context, instance, messageId) { const key = `${instance}:${messageId}`; const existing = receipts.get(key); if (existing) return { kind: "existing" as const, receipt: existing }; const card = await this.findActive(context); if (!card) { const receipt = { status: "IGNORED" as const, supplierCaptureId: null }; receipts.set(key, receipt); return { kind: "ignored" as const, receipt }; } const owned = card.state === "PENDING"; if (owned) card.state = "ANALYZING"; const receipt = { status: owned ? "PROCESSING" as const : "IGNORED" as const, supplierCaptureId: card.id }; receipts.set(key, receipt); return { kind: owned ? "owned" as const : "ignored" as const, receipt }; },
    async settleAnalyzeCommand(_context, instance, messageId, id, status) { const receipt = receipts.get(`${instance}:${messageId}`); const card = states.get(id); if (!receipt || receipt.status !== "PROCESSING" || card?.state !== "ANALYZING") return false; receipt.status = status; card.state = status === "COMPLETED" ? "ANALYZED" : "PENDING"; return true; },
    async deleteIfEmpty(_context, id) { if ([...attachments.values()].some((item) => item.captureId === id)) return false; states.delete(id); captures.delete(id); return true; },
  };
  const repository = {
    async hasTripAccess() { return true; }, async getCapture(_context: unknown, id: string) { return captures.get(id) ?? null; },
    async createDraft(input: { userId: string; tripId: string; clientCaptureId?: string; extraction: { extractedFields: SupplierCaptureRecord["fields"]; rawSource: SupplierCaptureRecord["source"]; missingFields: SupplierCaptureRecord["missingFields"]; reviewFields: SupplierCaptureRecord["reviewFields"]; evidence: SupplierCaptureRecord["evidence"] } }) {
      const id = input.clientCaptureId ?? `draft-${captures.size}`; const capture = makeCapture(id, input.userId, input.tripId); capture.source = input.extraction.rawSource; capture.fields = input.extraction.extractedFields; capture.missingFields = input.extraction.missingFields; capture.reviewFields = input.extraction.reviewFields; capture.evidence = input.extraction.evidence; captures.set(id, capture); return capture;
    },
    async replaceExtraction(_context: unknown, id: string, extraction: { extractedFields: SupplierCaptureRecord["fields"]; reviewFields: SupplierCaptureRecord["reviewFields"]; missingFields: SupplierCaptureRecord["missingFields"]; evidence: SupplierCaptureRecord["evidence"] }, options?: { analyzedAttachmentIds?: string[] }) { const capture = captures.get(id)!; capture.fields = extraction.extractedFields; capture.reviewFields = extraction.reviewFields; capture.missingFields = extraction.missingFields; capture.evidence = extraction.evidence; capture.analyzedAttachmentIds = options?.analyzedAttachmentIds ?? []; return capture; },
  };
  const attachmentService = { async get(id: string) { return attachments.get(id) ?? null; }, async list(_context: unknown, id: string) { return [...attachments.values()].filter((item) => item.captureId === id); }, async upload(input: { captureId: string; clientEvidenceId?: string; tripId: string; userId: string }) { uploads++; const value = { id: input.clientEvidenceId!, captureId: input.captureId, tripId: input.tripId, userId: input.userId, type: "BUSINESS_CARD" as const }; attachments.set(value.id, value); return value; } };
  const extraction = new SupplierExtractionService([{ name: "channel-fake", supports: () => true, async extract(input) { extractCalls++; return { rawSource: input.source, extractedFields: {}, reviewFields: [], evidence: [] }; } }]);
  const service = new WhatsAppCaptureService({ identities: { async findByWhatsAppPhone() { return [{ userId: "eval-user", tripId: "eval-trip", trip: { status: "ACTIVE" } }]; } }, captures: repository as never, cards, attachments: attachmentService as never, extraction });
  return { service, captures, states, receipts, attachments, get extractCalls() { return extractCalls; }, get uploads() { return uploads; } };
}
function makeCapture(id: string, userId: string, tripId: string, evidenceId?: string): SupplierCaptureRecord {
  return { id, userId, tripId, supplierId: null, status: "DRAFT", source: evidenceId ? { type: "IMAGE_BUSINESS_CARD", attachmentId: evidenceId } : { type: "TEXT", text: "" },
    fields: { ...EMPTY_TIER_1_DATA }, missingFields: calculateMissingFields(EMPTY_TIER_1_DATA), reviewFields: [], acknowledgedUnknownFields: [], evidence: [], humanCorrectedFields: [], analyzedAttachmentIds: [], needsReanalysis: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), confirmedAt: null };
}
const phone = "5493412345678";
function text(messageId: string, value: string) { return { instance: "eval", messageId, phone, type: "TEXT" as const, text: value }; }
function image(messageId: string) { return { instance: "eval", messageId, phone, type: "IMAGE" as const,
  media: { key: { id: messageId, remoteJid: `${phone}@s.whatsapp.net`, fromMe: false }, message: { imageMessage: {} } },
  getMedia: async () => ({ bytes: new Uint8Array([0xff, 0xd8, 0xff]), mimeType: "image/jpeg" }) }; }
export async function runChannel(): Promise<EvalCase[]> {
  const results: EvalCase[] = []; const f = fixture();
  let replies = 0;
  await processWhatsAppWebhook({ event: "messages.upsert", instance: "eval", data: { key: { id: "ping", remoteJid: `${phone}@s.whatsapp.net`, fromMe: false }, message: { conversation: "ping nihao" } } }, "eval",
    () => ({ async sendText() { replies++; }, async getMedia() { throw new Error("not called"); } } as never), () => f.service);
  results.push(caseResult("C01-ping", replies === 1 && f.captures.size === 0));
  const noPending = await f.service.capture(text("command-empty", "analizar tarjeta"));
  results.push(caseResult("C02-command-without-pending", noPending.text === "No tenés una tarjeta pendiente para analizar." && f.captures.size === 0 && f.receipts.get("eval:command-empty")?.status === "IGNORED"));
  await f.service.capture(image("front")); await f.service.capture(text("command-valid", "analizar tarjeta")); const calls = f.extractCalls;
  await f.service.capture(text("command-valid", "analizar tarjeta"));
  results.push(caseResult("C03-duplicate-command", calls === 1 && f.extractCalls === calls));
  await f.service.capture(image("new-front")); await f.service.capture(image("new-back")); await f.service.capture(image("third")); const fourth = await f.service.capture(image("fourth"));
  results.push(caseResult("C04-fourth-image", fourth.text.includes("máximo de 3") && f.uploads === 4));
  results.push(caseResult("C05-new-image-after-analyzed", f.states.get(whatsappCaptureId("eval", "front"))?.state === "ANALYZED" && f.states.get(whatsappCaptureId("eval", "new-front"))?.state === "PENDING"));
  const before = f.captures.size; await f.service.capture(text("hello", "Hola"));
  results.push(caseResult("C06-hola", f.captures.size === before, { knownIssue: "MEDIUM / PENDING BEFORE PILOT" }, true));
  return results;
}
