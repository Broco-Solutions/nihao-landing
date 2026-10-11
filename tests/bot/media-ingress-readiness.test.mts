import test from "node:test";
import assert from "node:assert/strict";
import { MediaIngressError, boundedRequestBody, readBoundedBytes, validateOriginalMedia, withMediaIngress } from "../../lib/channels/whatsapp/media-ingress.ts";
import { createEvolutionClient } from "../../lib/channels/evolution/client.ts";
import { audioContainerHasOnlyAudio } from "../../lib/bot/audio-container.ts";
import { validateAttachmentContent } from "../../lib/bot/attachments.ts";
import { parseEvolutionWebhook } from "../../lib/channels/evolution/webhook.ts";
import { handleBurstWebhook } from "../../lib/channels/whatsapp/burst-webhook.ts";
import { imageRelevanceGate, visualDisposition, parseVisualReading } from "../../lib/channels/whatsapp/multimodal-reading.ts";
import { BurstReader } from "../../lib/channels/whatsapp/burst-reader.ts";
import type { VisualReading } from "../../lib/channels/whatsapp/ingestion-types.ts";
import type { BurstEnvelope, BurstMessage, BurstReading } from "../../lib/channels/whatsapp/burst-types.ts";

const webm = (type = 2) => new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x80, 0x18, 0x53, 0x80, 0x67, 0x8a, 0x16, 0x54, 0xae, 0x6b, 0x85, 0xae, 0x83, 0x83, 0x81, type]);
const box = (type: string, bytes: Uint8Array) => { const result = new Uint8Array(bytes.length + 8); new DataView(result.buffer).setUint32(0, result.length); result.set(Buffer.from(type), 4); result.set(bytes, 8); return result; };
const mp4 = (handler: string) => { const info = new Uint8Array(12); info.set(Buffer.from(handler), 8); return Buffer.concat([box("ftyp", Buffer.from("M4A ")), box("moov", box("trak", box("mdia", box("hdlr", info))))]); };

test("chunked ingress rejects and cancels before retaining oversized body", async () => {
  let cancelled = false; const stream = new ReadableStream<Uint8Array>({ pull(c) { c.enqueue(new Uint8Array(8)); }, cancel() { cancelled = true; } });
  await assert.rejects(readBoundedBytes(stream, { maxBytes: 10 }), (e: unknown) => e instanceof MediaIngressError && e.code === "MEDIA_TOO_LARGE");
  assert.equal(cancelled, true);
});
test("request without Content-Length still has a body limit", async () => {
  await assert.rejects(boundedRequestBody(new Request("https://example.test", { method: "POST", body: "longbody" }), 4), MediaIngressError);
});
test("stalled original stream times out and releases reader", async () => {
  let cancelled = false; const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  await assert.rejects(readBoundedBytes(stream, { maxBytes: 10, timeoutMs: 5 }), /timeout/u); assert.equal(cancelled, true);
});
test("MP4/WebM tracks reject video disguised as audio and header-only files", () => {
  for (const [mime, audio, video] of [["audio/webm", webm(), webm(1)], ["audio/mp4", mp4("soun"), mp4("vide")]] as const) {
    assert.doesNotThrow(() => validateAttachmentContent(mime, audio));
    assert.throws(() => validateAttachmentContent(mime, video), /video/u);
  }
  assert.equal(audioContainerHasOnlyAudio(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]), "webm"), false);
  assert.throws(() => validateOriginalMedia("IMAGE", "video/mp4", mp4("vide")), MediaIngressError);
});
test("Evolution response rejects an encoded excess before Base64 decoding", async () => {
  const client = createEvolutionClient({ apiUrl: "https://evolution.invalid", apiKey: "local", instance: "test", fetch: async () => new Response("{}", { headers: { "content-length": String(100 * 1024 * 1024) } }) });
  await assert.rejects(client.getMedia({ message: { key: { id: "one", remoteJid: "test", fromMe: false }, message: { imageMessage: {} } } }), (e: unknown) => e instanceof MediaIngressError && e.code === "MEDIA_TOO_LARGE");
});
test("ingress saturation is retryable and queued work completes without dropping", async () => {
  const before = process.env.WHATSAPP_INGRESS_CONCURRENCY; process.env.WHATSAPP_INGRESS_CONCURRENCY = "1";
  try {
    let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; }); let secondStarted = false;
    const first = withMediaIngress("first", async () => { await pending; return { bytes: new Uint8Array(1) }; });
    const second = withMediaIngress("second", async () => { secondStarted = true; return { bytes: new Uint8Array(1) }; });
    assert.equal(secondStarted, false); release(); await Promise.all([first, second]); assert.equal(secondStarted, true);
  } finally { if (before === undefined) delete process.env.WHATSAPP_INGRESS_CONCURRENCY; else process.env.WHATSAPP_INGRESS_CONCURRENCY = before; }
});
test("native video is a durable typed rejection without download or original persistence", async () => {
  const payload = { event: "messages.upsert", instance: "test", data: { key: { id: "video-one", remoteJid: "123@s.whatsapp.net", fromMe: false }, message: { videoMessage: { caption: "mi visita" } } } };
  const event = parseEvolutionWebhook(payload, "test"); assert.equal(event.kind, "message"); if (event.kind !== "message") return; assert.equal(event.message.type, "VIDEO");
  let envelope!: BurstEnvelope; let originals = 0;
  const response = await handleBurstWebhook(payload, "test", () => ({ async receive(value) { envelope = value; return true; }, async persistOriginal() { originals++; }, async processDue() {} }), () => {});
  assert.equal(response?.status, 200); assert.equal(envelope.type, "TEXT"); assert.equal(envelope.unsupportedType, "VIDEO"); assert.equal(envelope.unsupportedCaption, "mi visita"); assert.equal(envelope.text, null); assert.equal(originals, 0);
});
const other = (relevance: "RELATED" | "UNRELATED" | "UNCERTAIN", readability: VisualReading["readability"] = "readable"): VisualReading => ({ type: "OTHER", side: "UNKNOWN_SIDE", confidence: .95, readability, visual: "soporte visible", card: null, product: null, relevance, relevanceReason: "contexto verificado" });
test("physical OTHER, legibility and commercial relevance remain independent", () => {
  const gate = (v: VisualReading) => imageRelevanceGate({ segments: [], disposition: visualDisposition(v), ingestion: { status: "PARSED", stage: "parsed", attempts: [], loadIds: [], classification: v } });
  assert.equal(gate(parseVisualReading(other("UNRELATED"))), "UNRELATED");
  assert.equal(gate(parseVisualReading(other("UNRELATED", "unreadable"))), "ASK_CONTEXT");
  assert.equal(gate(parseVisualReading(other("RELATED"))), "ATTACH_EXISTING_ONLY");
  assert.equal(gate(parseVisualReading(other("UNCERTAIN"))), "ASK_CONTEXT");
});
test("unrelated legible image retains original and skips commercial extraction", async () => {
  const png = new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]); let savedOriginal = false; let extractions = 0;
  const reader = new BurstReader({ multimodal: true, storage: { async put() { savedOriginal = true; }, async get() { return new ReadableStream({ start(c) { c.enqueue(png); c.close(); } }); }, async delete() {}, async signedUrl() { return "https://private.invalid"; } }, client: { async getMedia() { return { bytes: png, mimeType: "image/png" }; } }, analyzer: { async readImage() { return "texto de un meme"; }, async segmentAudio() { throw new Error("not needed"); } }, transcription: { async transcribe() { throw new Error("not needed"); } }, extraction: { async extractReading() { extractions++; throw new Error("unrelated cannot extract supplier"); } }, mistral: { async post() { return { choices: [{ message: { content: JSON.stringify(other("UNRELATED")) } }] }; } } });
  const message: BurstMessage = { id: "irrelevant-image", sequence: 1, sentAt: null, envelope: { instance: "test", messageId: "irrelevant", phone: "123", type: "IMAGE", text: null, media: { key: { id: "irrelevant", remoteJid: "123", fromMe: false }, message: { imageMessage: {} } }, sentAt: null }, reading: null };
  const checkpoints: BurstReading[] = [];
  const reading = await reader.read(message, async (r) => { checkpoints.push(r); });
  assert.equal(savedOriginal, true); assert.equal(reading.disposition?.relevance, "UNRELATED"); assert.equal(reading.ingestion?.status, "PARSED"); assert.equal(extractions, 0); assert.ok(checkpoints.length > 0);
});
