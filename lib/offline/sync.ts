import { apiUrl } from "../api/origin.ts";
import type { LocalEvidence, OfflineCapture, CaptureStore } from "./capture-store";

export type SyncResult = { status: "synced" | "pending" | "auth" | "forbidden" | "invalid" | "server"; capture?: OfflineCapture; message?: string };

function networkError(error: unknown) { return error instanceof TypeError || (error instanceof Error && /network|fetch|failed|offline|timeout/i.test(error.message)); }

async function request(path: string, init?: RequestInit) {
  try { return await fetch(apiUrl(path), { credentials: "include", ...init }); } catch (error) { if (networkError(error)) throw new Error("network"); throw error; }
}

async function body(response: Response) { try { return await response.json() as { capture?: { id: string }; attachment?: { id: string }; error?: string }; } catch { return {}; } }

async function createRemoteCapture(item: OfflineCapture) {
  const response = await request("/api/bot/captures", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tripId: item.tripId, clientCaptureId: item.localId }) });
  const payload = await body(response);
  if (!response.ok || !payload.capture) throw Object.assign(new Error(payload.error ?? "No pudimos crear la captura"), { status: response.status });
  return payload.capture.id;
}

async function uploadEvidence(item: OfflineCapture, evidence: LocalEvidence) {
  if (!item.remoteCaptureId || evidence.remoteAttachmentId) return evidence;
  const form = new FormData(); form.set("tripId", item.tripId); form.set("type", evidence.type); form.set("clientEvidenceId", evidence.localId); form.set("file", new File([evidence.blob], `evidencia-${evidence.localId}`, { type: evidence.mimeType }));
  const response = await request(`/api/bot/captures/${encodeURIComponent(item.remoteCaptureId)}/attachments`, { method: "POST", body: form });
  const payload = await body(response);
  if (!response.ok || !payload.attachment) throw Object.assign(new Error(payload.error ?? "No pudimos sincronizar la evidencia"), { status: response.status });
  return { ...evidence, remoteAttachmentId: payload.attachment.id, status: "SYNCED" as const, error: undefined };
}

export async function syncOfflineCapture(store: CaptureStore, localId: string): Promise<SyncResult> {
  const original = await store.get(localId); if (!original) return { status: "synced" };
  let item: OfflineCapture = { ...original, status: "SYNCING", error: undefined }; await store.put(item);
  try {
    if (!item.remoteCaptureId) { item = { ...item, remoteCaptureId: await createRemoteCapture(item) }; await store.put(item); }
    for (const evidence of item.evidences.filter((candidate) => !candidate.remoteAttachmentId)) {
      const next = await uploadEvidence(item, evidence); item = { ...item, evidences: item.evidences.map((candidate) => candidate.localId === evidence.localId ? next : candidate), updatedAt: new Date().toISOString() }; await store.put(item);
    }
    const analysisEvidenceIds = item.evidences.filter((evidence) => (evidence.type === "BUSINESS_CARD" || evidence.type === "AUDIO") && evidence.remoteAttachmentId).map((evidence) => evidence.remoteAttachmentId);
    if (!item.textSynced && (item.text.trim() || analysisEvidenceIds.length)) {
      const response = await request("/api/bot/extractions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tripId: item.tripId, captureId: item.remoteCaptureId, text: item.text, businessCardAttachmentIds: item.evidences.filter((evidence) => evidence.type === "BUSINESS_CARD" && evidence.remoteAttachmentId).map((evidence) => evidence.remoteAttachmentId), audioAttachmentIds: item.evidences.filter((evidence) => evidence.type === "AUDIO" && evidence.remoteAttachmentId).map((evidence) => evidence.remoteAttachmentId) }) });
      const payload = await body(response); if (!response.ok || !payload.capture) throw Object.assign(new Error(payload.error ?? "No pudimos procesar la captura"), { status: response.status });
      item = { ...item, textSynced: true }; await store.put(item);
    }
    await store.delete(item.localId); return { status: "synced", capture: item };
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status: number }).status) : 0;
    const result: SyncResult["status"] = status === 401 ? "auth" : status === 403 ? "forbidden" : status >= 400 && status < 500 ? "invalid" : status >= 500 ? "server" : "pending";
    const retryable = result === "pending" || result === "server" || result === "auth";
    const attempts = (item.attempts ?? 0) + 1;
    const retryAt = retryable && result !== "auth" ? new Date(Date.now() + Math.min(300_000, 30_000 * 2 ** Math.min(attempts - 1, 4))).toISOString() : undefined;
    const failed = { ...item, status: "ERROR" as const, retryable, attempts, retryAt, error: status === 401 ? "Necesitás iniciar sesión nuevamente" : error instanceof Error && error.message === "network" ? "Sin conexión" : "No pudimos sincronizar" };
    await store.put(failed); return { status: result, capture: failed, message: failed.error };
  }
}

export async function syncPendingCaptures(store: CaptureStore, userId: string, tripId?: string, force = false): Promise<SyncResult[]> {
  const now = Date.now(); const pending = (await store.list(userId, tripId)).filter((item) => item.retryable !== false && (force || !item.retryAt || new Date(item.retryAt).getTime() <= now)); const results: SyncResult[] = [];
  for (const item of pending) results.push(await syncOfflineCapture(store, item.localId));
  return results;
}
