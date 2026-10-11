import assert from "node:assert/strict";
import test from "node:test";
import { archiveCaptureAutosaves, captureAutosaveKey } from "../../lib/offline/autosave.ts";
import { createMemoryCaptureStore, createOfflineCapture } from "../../lib/offline/capture-store.ts";
import { cookieMutationOriginAllowed, stagingCookiePrefix } from "../../lib/auth/request-origin.ts";
import { betterAuthAdvancedOptions } from "../../lib/auth/auth.ts";
import { demoReadOnlyResponse, DEMO_SUPPLIERS } from "../../lib/bot/demo-readonly.ts";

function storage() {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, key: (i: number) => [...values.keys()][i] ?? null, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
test("logout archives only the owner's draft and preserves pending originals", async () => {
  const local = storage(), store = createMemoryCaptureStore();
  const own = captureAutosaveKey("owner:1", "trip", "company"), other = captureAutosaveKey("other", "trip", "company");
  local.setItem(own, "Nota privada"); local.setItem(other, "Otra cuenta"); local.setItem("nihao:app:capture:trip:company", "Borrador viejo sin dueño");
  await store.put({ ...createOfflineCapture("owner:1", "trip", "offline-photo", "company"), evidences: [{ localId: "image", type: "BUSINESS_CARD", blob: new Blob(["original"]), mimeType: "image/jpeg", size: 8, status: "LOCAL", createdAt: new Date().toISOString() }] });
  await archiveCaptureAutosaves(local, store, "owner:1");
  assert.equal(local.getItem(own), null); assert.equal(local.getItem(other), "Otra cuenta"); assert.equal(local.getItem("nihao:app:capture:trip:company"), "Borrador viejo sin dueño");
  const drafts = await store.list("owner:1", "trip"); assert.equal(drafts.length, 2); assert.equal(drafts.find(c => c.localId === "offline-photo")?.evidences.length, 1); assert.ok(drafts.some(c => c.text === "Nota privada")); assert.equal((await store.list("other")).length, 0);
  local.setItem(own, "Nota privada"); await archiveCaptureAutosaves(local, store, "owner:1"); assert.equal((await store.list("owner:1")).length, 2);
});
test("failed archival does not discard owner text", async () => {
  const local = storage(), key = captureAutosaveKey("u", "t", "c"); local.setItem(key, "preservar");
  const store = createMemoryCaptureStore(); store.put = async () => { throw new Error("quota"); };
  await assert.rejects(archiveCaptureAutosaves(local, store, "u"), /quota/); assert.equal(local.getItem(key), "preservar");
});
test("cookie mutations enforce exact origins while machine webhook has no browser cookie", () => {
  const trusted = new Set(["https://www.nihaonegocios.com"]);
  const req = (origin?: string, cookie = true) => ({ method: "POST", url: "https://api.nihaonegocios.com/api/bot/captures", headers: new Headers({ ...(origin ? { origin } : {}), ...(cookie ? { cookie: "session=x" } : {}) }) });
  assert.equal(cookieMutationOriginAllowed(req("https://www.nihaonegocios.com"), trusted), true);
  assert.equal(cookieMutationOriginAllowed(req("https://api.nihaonegocios.com"), trusted), true);
  for (const origin of [undefined, "null", "https://staging.nihaonegocios.com", "https://www.nihaonegocios.com.evil.test", "https://www.nihaonegocios.com/path"]) assert.equal(cookieMutationOriginAllowed(req(origin), trusted), false);
  assert.equal(cookieMutationOriginAllowed(req(undefined, false), trusted), true);
});
test("staging keeps its shared web/API cookie scope but never reads production session names", () => {
  for (const env of [{ NIHAO_RUNTIME_ENV: "staging" }, { RAILWAY_ENVIRONMENT_NAME: "staging" }, { VERCEL_ENV: "preview" }]) {
    assert.equal(stagingCookiePrefix(env), "nihao-staging");
    assert.equal(betterAuthAdvancedOptions(".nihaonegocios.com", stagingCookiePrefix(env)).cookiePrefix, "nihao-staging");
  }
  for (const env of [{}, { VERCEL_ENV: "production" }, { RAILWAY_ENVIRONMENT_NAME: "production" }]) {
    assert.equal(stagingCookiePrefix(env), undefined);
    assert.equal("cookiePrefix" in betterAuthAdvancedOptions(".nihaonegocios.com", stagingCookiePrefix(env)), false);
  }
});
test("demo cannot store visitors' notes and returns fixed samples", async () => {
  const response = demoReadOnlyResponse(); assert.equal(response.status, 405); assert.equal((await response.json()).code, "DEMO_READ_ONLY"); assert.equal(DEMO_SUPPLIERS.length, 1); assert.equal(DEMO_SUPPLIERS[0].userId, "demo-sample");
});
