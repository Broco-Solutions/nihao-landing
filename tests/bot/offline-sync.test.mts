import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryCaptureStore, createOfflineCapture, type OfflineCapture } from "../../lib/offline/capture-store.ts";
import { syncOfflineCapture } from "../../lib/offline/sync.ts";

function pendingCapture(userId = "user-a", localId = "capture-local"): OfflineCapture {
  const capture = createOfflineCapture(userId, "trip-a", localId);
  return { ...capture, text: "MOQ 200", evidences: [{ localId: "evidence-local", type: "BUSINESS_CARD", blob: new Blob(["image"], { type: "image/png" }), mimeType: "image/png", size: 5, createdAt: capture.createdAt, status: "LOCAL" }] };
}

test("el almacenamiento local persiste blobs, sobrevive un reload lógico y aísla usuarios", async () => {
  const store = createMemoryCaptureStore();
  await store.put(pendingCapture());
  await store.put(pendingCapture("user-b", "capture-other"));
  assert.equal((await store.list("user-a", "trip-a")).length, 1);
  assert.equal((await store.list("user-b", "trip-a")).length, 1);
  assert.equal((await store.get("capture-local"))?.evidences[0]?.blob.size, 5);
  await store.delete("capture-local");
  assert.equal(await store.get("capture-local"), null);
});

test("sincroniza una captura y sus evidencias, y limpia el estado local", async () => {
  const store = createMemoryCaptureStore(); await store.put(pendingCapture()); const calls: string[] = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => { const path = String(input); calls.push(path); if (path.endsWith("/api/bot/captures")) return Response.json({ capture: { id: "remote-capture" } }, { status: 201 }); if (path.includes("/attachments")) return Response.json({ attachment: { id: "remote-evidence" } }, { status: 201 }); return Response.json({ capture: { id: "remote-capture" } }, { status: 201 }); };
  try { const result = await syncOfflineCapture(store, "capture-local"); assert.equal(result.status, "synced"); assert.equal(await store.get("capture-local"), null); assert.equal(calls.filter((path) => path.includes("attachments")).length, 1); } finally { globalThis.fetch = previousFetch; }
});

test("una sesión vencida conserva la queue y un retry de procesamiento no vuelve a subir la evidencia", async () => {
  const store = createMemoryCaptureStore(); await store.put(pendingCapture()); let extractionAttempts = 0; let uploads = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => { const path = String(input); if (path.endsWith("/api/bot/captures")) return Response.json({ capture: { id: "remote-capture" } }, { status: 201 }); if (path.includes("attachments")) { uploads += 1; return Response.json({ attachment: { id: "remote-evidence" } }, { status: 201 }); } if (path.includes("extractions")) { extractionAttempts += 1; return extractionAttempts === 1 ? new Response(JSON.stringify({ error: "fallo" }), { status: 500 }) : new Response(JSON.stringify({ error: "sesión" }), { status: 401 }); } return new Response(JSON.stringify({ error: "sesión" }), { status: 401 }); };
  try { const first = await syncOfflineCapture(store, "capture-local"); assert.equal(first.status, "server"); const second = await syncOfflineCapture(store, "capture-local"); assert.equal(second.status, "auth"); assert.equal(uploads, 1); assert.equal(extractionAttempts, 2); assert.equal((await store.get("capture-local"))?.evidences[0]?.remoteAttachmentId, "remote-evidence"); } finally { globalThis.fetch = previousFetch; }
});
