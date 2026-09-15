import test from "node:test";
import assert from "node:assert/strict";
import { AttachmentTranscriptionService, type TranscriptionProvider } from "../../lib/bot/transcription.ts";

test("reutiliza una transcripción persistida sin leer R2 ni cobrar otra llamada", async () => {
  let reads = 0; let calls = 0;
  const attachments = { get: async () => ({ id: "audio-a", userId: "user-a", tripId: "trip-a", captureId: "capture-a", type: "AUDIO" as const, storageKey: "trips/trip-a/audio.webm", mimeType: "audio/webm", size: 4, transcription: "ABC Lighting", transcriptionModel: "voxtral-mini-2602", createdAt: "2026-01-01" }) };
  const storage = { put: async () => undefined, get: async () => { reads++; return null; }, delete: async () => undefined, signedUrl: async () => "" };
  const provider: TranscriptionProvider = { transcribe: async () => { calls++; return { text: "nuevo", model: "voxtral-mini-2602" }; } };
  const service = new AttachmentTranscriptionService(attachments, storage, provider);
  assert.deepEqual(await service.transcribe("audio-a"), { text: "ABC Lighting", model: "voxtral-mini-2602" });
  assert.equal(reads, 0); assert.equal(calls, 0);
});

test("deduplica transcripciones simultáneas y persiste el resultado", async () => {
  let calls = 0; let saved = 0; let release!: () => void;
  const attachments = { get: async () => ({ id: "audio-a", userId: "user-a", tripId: "trip-a", captureId: "capture-a", type: "AUDIO" as const, storageKey: "trips/trip-a/audio.webm", mimeType: "audio/webm", size: 4, transcription: null, transcriptionModel: null, createdAt: "2026-01-01" }), saveTranscription: async () => { saved++; return {} as never; } };
  const storage = { put: async () => undefined, get: async () => new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1, 2])); controller.close(); } }), delete: async () => undefined, signedUrl: async () => "" };
  const provider: TranscriptionProvider = { transcribe: async () => { calls++; await new Promise<void>((resolve) => { release = resolve; }); return { text: "ABC Lighting", model: "voxtral-mini-2602" }; } };
  const service = new AttachmentTranscriptionService(attachments, storage, provider);
  const first = service.transcribe("audio-a"); const second = service.transcribe("audio-a"); await new Promise((resolve) => setTimeout(resolve, 0)); release();
  assert.deepEqual(await Promise.all([first, second]), [{ text: "ABC Lighting", model: "voxtral-mini-2602" }, { text: "ABC Lighting", model: "voxtral-mini-2602" }]);
  assert.equal(calls, 1); assert.equal(saved, 1);
});
