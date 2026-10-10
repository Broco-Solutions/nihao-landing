import assert from "node:assert/strict";
import test from "node:test";
import { createOfflineCapture, indexedDbCaptureStore } from "../../lib/offline/capture-store.ts";

test("IndexedDB confirma una captura sólo al completar la transacción", async () => {
  const transactions: Array<{ error: Error | null; oncomplete?: () => void; onabort?: () => void; onerror?: () => void; abort(): void; objectStore(): { put(): object } }> = [];
  const db = {
    transaction() {
      const tx = {
        error: null as Error | null,
        oncomplete: undefined as (() => void) | undefined,
        onabort: undefined as (() => void) | undefined,
        onerror: undefined as (() => void) | undefined,
        abort() { this.onabort?.(); },
        objectStore() { return { put() { return {}; } }; },
      };
      transactions.push(tx);
      return tx;
    },
  };
  const previous = globalThis.indexedDB;
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: { open() {
    const request = { result: db, onsuccess: undefined as (() => void) | undefined };
    queueMicrotask(() => request.onsuccess?.());
    return request;
  } } });
  try {
    const capture = createOfflineCapture("uat-user", "uat-trip", "uat-local");
    let acknowledged = false;
    const first = indexedDbCaptureStore.put(capture).then(() => { acknowledged = true; });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(transactions.length, 1);
    assert.equal(acknowledged, false);
    transactions[0].oncomplete?.();
    await first;
    assert.equal(acknowledged, true);

    const second = indexedDbCaptureStore.put(capture);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(transactions.length, 2);
    transactions[1].error = new Error("quota exceeded");
    transactions[1].onabort?.();
    await assert.rejects(second, /quota exceeded/);
  } finally {
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: previous });
  }
});
