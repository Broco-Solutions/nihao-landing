import { createOfflineCapture, type CaptureStore } from "./capture-store.ts";

const PREFIX = "nihao:app:capture:v2:";
export function captureAutosaveKey(userId: string, tripId: string, companyId: string) {
  return `${PREFIX}${[userId, tripId, companyId].map(encodeURIComponent).join(":")}`;
}

export function readCaptureAutosave(value: string | null): { text: string; remoteCaptureId?: string } {
  if (!value) return { text: "" };
  try {
    const data = JSON.parse(value) as { version?: number; text?: unknown; remoteCaptureId?: unknown };
    if (data?.version === 1 && typeof data.text === "string") return { text: data.text, ...(typeof data.remoteCaptureId === "string" ? { remoteCaptureId: data.remoteCaptureId } : {}) };
  } catch { /* A previous owner-scoped plain text draft remains recoverable. */ }
  return { text: value };
}

export function writeCaptureAutosave(storage: Pick<Storage, "setItem">, key: string, text: string, remoteCaptureId?: string) {
  storage.setItem(key, JSON.stringify({ version: 1, text, ...(remoteCaptureId ? { remoteCaptureId } : {}) }));
}

/** Archive only this owner's plain-text drafts before clearing session caches.
 * IndexedDB evidence is deliberately retained and remains filtered by owner. */
export async function archiveCaptureAutosaves(storage: Pick<Storage, "length" | "key" | "getItem" | "removeItem">, store: CaptureStore, userId: string) {
  const ownerPrefix = `${PREFIX}${encodeURIComponent(userId)}:`;
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((key): key is string => Boolean(key?.startsWith(ownerPrefix)));
  for (const key of keys) {
    const [tripId, companyId] = key.slice(ownerPrefix.length).split(":").map(decodeURIComponent);
    const storedValue = storage.getItem(key);
    const { text, remoteCaptureId } = readCaptureAutosave(storedValue);
    if (text.trim() && tripId && companyId) {
      const pending = await store.list(userId, tripId);
      if (!pending.some((capture) => capture.companyId === companyId && capture.text === text)) {
        // Deterministic ID makes a retry after sign-out failure safe.
        const localId = `autosave:${encodeURIComponent(userId)}:${encodeURIComponent(tripId)}:${encodeURIComponent(companyId)}`;
        const existing = await store.get(localId);
        if (existing && existing.userId !== userId) throw new Error("El borrador pertenece a otra cuenta");
        await store.put({ ...(existing ?? createOfflineCapture(userId, tripId, localId, companyId)), ...(remoteCaptureId ? { remoteCaptureId } : {}), text, textSynced: false });
      }
    }
    // Preserve a concurrent edit instead of removing newer text.
    if (storage.getItem(key) === storedValue) storage.removeItem(key);
  }
}
