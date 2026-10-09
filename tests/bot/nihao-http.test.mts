import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { createAgentEnvironment, localAgentDatabase } from "../../evals/whatsapp-agent/environment.ts";

const origin = process.env.NIHAO_HTTP_TEST_ORIGIN;
const secret = process.env.NIHAO_HTTP_TEST_AUTH_SECRET;

test("HTTP local: authenticated capture/product lifecycle and permissions", { skip: !origin || !secret || !process.env.EVAL_AGENT_DATABASE_URL }, async t => {
  const url = new URL(origin!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "HTTP smoke is exclusively local");
  const db = localAgentDatabase();
  const env = await createAgentEnvironment(db, { trips: [{ id: "trip", name: "HTTP synthetic", companies: [{ id: "company", name: "Broco" }, { id: "foreign", name: "Foreign" }], suppliers: [{ id: "foreign-supplier", captureId: "foreign-capture", name: "Foreign", companyId: "foreign", city: "Ningbo" }] }] });
  const tripId = env.id("trip"), companyId = env.id("company");
  const token = randomUUID();
  const signed = encodeURIComponent(`${token}.${createHmac("sha256", secret!).update(token).digest("base64")}`);
  const cookie = `better-auth.session_token=${signed}`;
  let captureId = "", supplierId = "", productId = "";
  async function request(path: string, method = "GET", body?: unknown, auth: string | null = cookie) {
    const response = await fetch(new URL(path, url), { method, headers: { ...(auth ? { cookie: auth } : {}), ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }
  const captures = "/api/bot/captures";
  const context = { tripId };
  try {
    await db.session.create({ data: { id: randomUUID(), token, userId: env.userId, expiresAt: new Date(Date.now() + 3600_000) } });
    await db.tripCompanyMember.delete({ where: { companyId_userId: { companyId: env.id("foreign"), userId: env.userId } } });
    await t.test("anonymous and forged sessions cannot read or mutate", async () => {
      assert.equal((await request(`${captures}?tripId=${tripId}`, "GET", undefined, null)).status, 401);
      assert.equal((await request(captures, "POST", { tripId, companyId }, "better-auth.session_token=forged")).status, 401);
    });
    await t.test("creation is replayable through the real POST contract", async () => {
      const clientCaptureId = randomUUID();
      const first = await request(captures, "POST", { tripId, companyId, clientCaptureId }); assert.equal(first.status, 201);
      const repeated = await request(captures, "POST", { tripId, companyId, clientCaptureId }); assert.equal(repeated.status, 201);
      captureId = first.body.capture.id; assert.equal(repeated.body.capture.id, captureId); assert.equal(first.body.capture.status, "DRAFT");
      assert.equal(await db.supplierCapture.count({ where: { id: captureId } }), 1);
    });
    await t.test("correction promotes automatically, reviewed confirmation updates supplier", async () => {
      const name = await request(`${captures}/${captureId}`, "PATCH", { ...context, field: "companyName", value: "HTTP Dragon" }); assert.equal(name.status, 200); assert.equal(name.body.capture.status, "DRAFT");
      const contact = await request(`${captures}/${captureId}`, "PATCH", { ...context, field: "contact", value: "sales@http.test" }); assert.equal(contact.status, 200); assert.equal(contact.body.capture.status, "CONFIRMED");
      supplierId = (await db.supplier.findUniqueOrThrow({ where: { captureId } })).id;
      const details = await request(`${captures}/${captureId}/details`, "PATCH", { ...context, notes: "Reviewed notes", website: "https://http.test" }); assert.equal(details.status, 200);
      assert.equal((await db.supplier.findUniqueOrThrow({ where: { id: supplierId } })).notes, null, "automatic confirmation does not overwrite supplier");
      const confirmed = await request(`${captures}/${captureId}/confirm`, "POST", context); assert.equal(confirmed.status, 200); assert.equal(confirmed.body.supplier.id, supplierId); assert.equal(confirmed.body.supplier.notes, "Reviewed notes");
      assert.equal((await request(`${captures}/${captureId}/confirm`, "POST", context)).body.supplier.id, supplierId);
    });
    await t.test("product HTTP contracts preserve partial fields, notes and image restriction", async () => {
      const created = await request(`${captures}/${captureId}/products`, "POST", { ...context, name: "Silla HTTP", fob: { amount: 18, currency: "USD", unit: null, rawText: "USD 18" }, moq: { quantity: 200, unit: null, notes: null, rawText: "200" }, leadTime: { days: 30, rawText: "30 días" }, notes: "Original" }); assert.equal(created.status, 201, JSON.stringify(created.body)); productId = created.body.product.id;
      const updated = await request(`${captures}/${captureId}/products/${productId}`, "PATCH", { ...context, notes: "Additional" }); assert.equal(updated.status, 200); assert.equal(updated.body.product.fob.amount, 18); assert.equal(updated.body.product.moq.quantity, 200); assert.match(updated.body.product.notes, /Original/); assert.match(updated.body.product.notes, /Additional/);
      const file = await db.supplierAttachment.create({ data: { supplierCaptureId: captureId, type: "PRODUCT_IMAGE", mimeType: "image/jpeg", size: 20, storageKey: `http-synthetic/${randomUUID()}` } });
      const link = `${captures}/${captureId}/attachments/${file.id}`;
      assert.equal((await request(link, "PATCH", { ...context, productId })).status, 200);
      assert.equal((await request(`${captures}/${captureId}/products/${productId}?tripId=${tripId}`, "DELETE")).status, 400);
      assert.equal((await request(link, "PATCH", { ...context, productId: null })).status, 200);
      const listed = await request(`${captures}/${captureId}/products?tripId=${tripId}`); assert.equal(listed.status, 200); assert.equal(listed.body.products.length, 1);
    });
    await t.test("validation, missing resources and foreign company retain HTTP errors", async () => {
      assert.equal((await request(`${captures}/${captureId}/products/${productId}`, "PATCH", { ...context, fob: { amount: -1 } })).status, 400);
      assert.equal((await request(`${captures}/${randomUUID()}`, "PATCH", { ...context, field: "city", value: "Foshan" })).status, 404);
      assert.equal((await request(`${captures}/${env.id("foreign-capture")}/details`, "PATCH", { ...context, notes: "Wrong" })).status, 403);
      assert.equal((await request(`/api/bot/suppliers/${env.id("foreign-supplier")}?tripId=${tripId}`)).status, 404);
      assert.equal((await request(`${captures}/${env.id("foreign-capture")}/products`, "POST", { ...context, name: "Wrong" })).status, 403);
    });
    await t.test("reanalysis blocks reviewed confirmation and deleted captures cannot resurrect", async () => {
      await db.supplierCapture.update({ where: { id: captureId }, data: { needsReanalysis: true } });
      assert.equal((await request(`${captures}/${captureId}/confirm`, "POST", context)).status, 409);
      await db.supplierCapture.update({ where: { id: captureId }, data: { needsReanalysis: false } });
      assert.equal((await request(`${captures}/${captureId}/products/${productId}?tripId=${tripId}`, "DELETE")).status, 204);
      assert.equal((await request(`/api/bot/suppliers/${supplierId}?tripId=${tripId}`, "DELETE")).status, 204);
      assert.equal((await request(`${captures}/${captureId}/confirm`, "POST", context)).status, 409);
      assert.equal((await request(`${captures}/${captureId}/details`, "PATCH", { ...context, notes: "Wrong" })).status, 409);
      assert.equal(await db.supplier.count({ where: { captureId } }), 0); assert.equal(await db.supplierAttachment.count({ where: { supplierCaptureId: captureId } }), 1);
    });
  } finally {
    await db.session.deleteMany({ where: { userId: env.userId } });
    await env.cleanup(); await db.$disconnect();
  }
});
