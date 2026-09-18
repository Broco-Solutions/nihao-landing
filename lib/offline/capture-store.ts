export type LocalEvidenceType = "BUSINESS_CARD" | "PRODUCT_IMAGE" | "AUDIO";
export type LocalEvidenceStatus = "LOCAL" | "SYNCING" | "SYNCED" | "ERROR";

export type LocalEvidence = {
  localId: string;
  remoteAttachmentId?: string;
  type: LocalEvidenceType;
  blob: Blob;
  mimeType: string;
  size: number;
  createdAt: string;
  status: LocalEvidenceStatus;
  error?: string;
};

export type OfflineCapture = {
  localId: string;
  userId: string;
  tripId: string;
  remoteCaptureId?: string;
  text: string;
  textSynced: boolean;
  evidences: LocalEvidence[];
  createdAt: string;
  updatedAt: string;
  status: "LOCAL" | "SYNCING" | "ERROR";
  error?: string;
  retryable?: boolean;
  attempts?: number;
  retryAt?: string;
};

export interface CaptureStore {
  get(localId: string): Promise<OfflineCapture | null>;
  list(userId: string, tripId?: string): Promise<OfflineCapture[]>;
  put(capture: OfflineCapture): Promise<void>;
  delete(localId: string): Promise<void>;
}

const DB_NAME = "nihao-offline-captures";
const STORE_NAME = "captures";
let databasePromise: Promise<IDBDatabase> | null = null;

function database(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("El almacenamiento local no está disponible"));
  if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: "localId" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("No pudimos abrir el almacenamiento local"));
  });
  return databasePromise;
}

function transaction(mode: IDBTransactionMode, action: (store: IDBObjectStore, resolve: () => void, reject: (error: unknown) => void) => void): Promise<void> {
  return database().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    action(tx.objectStore(STORE_NAME), resolve, reject);
    tx.onerror = () => reject(tx.error ?? new Error("No pudimos actualizar el almacenamiento local"));
  }));
}

export const indexedDbCaptureStore: CaptureStore = {
  get: (localId) => database().then((db) => new Promise((resolve, reject) => { const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(localId); request.onsuccess = () => resolve((request.result as OfflineCapture | undefined) ?? null); request.onerror = () => reject(request.error); })),
  list: (userId, tripId) => database().then((db) => new Promise((resolve, reject) => { const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll(); request.onsuccess = () => resolve((request.result as OfflineCapture[]).filter((item) => item.userId === userId && (!tripId || item.tripId === tripId))); request.onerror = () => reject(request.error); })),
  put: (capture) => transaction("readwrite", (store, resolve, reject) => { const request = store.put(capture); request.onsuccess = resolve; request.onerror = () => reject(request.error); }),
  delete: (localId) => transaction("readwrite", (store, resolve, reject) => { const request = store.delete(localId); request.onsuccess = resolve; request.onerror = () => reject(request.error); }),
};

export function createOfflineCapture(userId: string, tripId: string, localId = crypto.randomUUID()): OfflineCapture {
  const now = new Date().toISOString();
  return { localId, userId, tripId, text: "", textSynced: false, evidences: [], createdAt: now, updatedAt: now, status: "LOCAL", retryable: true, attempts: 0 };
}

export function createMemoryCaptureStore(): CaptureStore {
  const captures = new Map<string, OfflineCapture>();
  return { async get(localId) { return captures.get(localId) ?? null; }, async list(userId, tripId) { return [...captures.values()].filter((item) => item.userId === userId && (!tripId || item.tripId === tripId)); }, async put(capture) { captures.set(capture.localId, capture); }, async delete(localId) { captures.delete(localId); } };
}
