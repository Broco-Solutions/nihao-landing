import { createHmac, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createAgentEnvironment, localAgentDatabase } from "../../evals/whatsapp-agent/environment.ts";
import type { BurstMessage, BurstSnapshot } from "../../lib/channels/whatsapp/burst-types.ts";

const secret = process.env.BETTER_AUTH_SECRET;
const base = process.env.EVAL_AGENT_DATABASE_URL;
test.skip(!secret || !base, "Requiere PostgreSQL aislado y sesión de prueba");
test.describe.configure({ mode: "serial", timeout: 120_000 });

const db = base ? localAgentDatabase() : null;
let env: Awaited<ReturnType<typeof createAgentEnvironment>>;
let tripId = "", companyId = "", captureId = "", adminId = "", firstBurstId = "";
const tokens: string[] = [];

async function session(page: Page, userId: string) {
  const token = randomUUID();
  tokens.push(token);
  await db!.session.create({ data: { id: randomUUID(), token, userId, expiresAt: new Date(Date.now() + 3600_000) } });
  const signed = `${token}.${createHmac("sha256", secret!).update(token).digest("base64")}`;
  await page.context().addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(signed), domain: "localhost", path: "/", httpOnly: true }]);
}

async function burst(texts: Array<string | null>) {
  await db!.whatsAppBurst.updateMany({ where: { userId: env.userId, phone: "5491112345678", status: { in: ["OPEN", "PROCESSING", "WAITING", "COMMITTING"] } }, data: { status: "DONE" } });
  const messages: BurstMessage[] = texts.map((text, index) => {
    const id = randomUUID();
    const type = text === null ? "IMAGE" : "TEXT";
    return { id, sequence: index + 1, sentAt: new Date(Date.now() + index * 4000), envelope: { instance: "uat-browser", phone: "5491112345678", messageId: id, type, text, media: null, sentAt: new Date().toISOString() }, reading: { complete: true, segments: [], ...(text === null ? { imageKind: "OTHER" as const, visual: "Fotografía de un televisor", storageKey: `uat-browser/${id}.jpg`, mimeType: "image/jpeg" } : {}) } };
  });
  const snapshot: BurstSnapshot = { id: randomUUID(), instance: "uat-browser", phone: "5491112345678", userId: env.userId, revision: messages.length, leaseId: randomUUID(), status: "PROCESSING", state: { tripId, operationalContext: { tripId, companyId }, groups: [], pendingRefs: [], controlIds: [], question: null }, messages };
  await env.persist(snapshot);
  if (texts[0] === null) await db!.whatsAppBurstMessage.update({ where: { id: messages[0].id }, data: { storageStatus: "STORED" } });
  return snapshot;
}

test.beforeAll(async () => {
  if (!db) return;
  env = await createAgentEnvironment(db, { trips: [{ id: "trip", name: "UAT negociación", companies: [{ id: "company", name: "Importadora" }] }] });
  tripId = env.id("trip"); companyId = env.id("company"); adminId = randomUUID();
  await db.user.create({ data: { id: adminId, name: "Administrador", email: `${adminId}@example.test`, role: "ADMIN" } });
  await db.tripMember.create({ data: { tripId, userId: adminId, role: "ADMIN" } });
  const capture = await db.supplierCapture.create({ data: { tripId, companyId, createdById: env.userId, sourceType: "TEXT", status: "DRAFT", companyName: "tvsellerschina", category: "televisores", missingFields: ["contact"], reviewFields: [], acknowledgedUnknownFields: [], evidence: [] } });
  captureId = capture.id;
  firstBurstId = (await burst([null, "Una empresa vende televisores", "Se llama tvsellerschina", "Moq 250", "Valen 600 usd cada uno"])).id;
});

test.afterAll(async () => {
  if (!db || !env) return;
  await db.session.deleteMany({ where: { token: { in: tokens } } });
  await db.tripMember.deleteMany({ where: { userId: adminId } });
  await env.cleanup();
  await db.user.deleteMany({ where: { id: adminId } });
  await db.$disconnect();
});

test("viajero revisa y guarda cinco mensajes desde una sola ficha", async ({ page }) => {
  await session(page, env.userId);
  await page.goto(`/app/viajes/${tripId}?section=evidencias`);
  await expect(page.getByRole("heading", { name: "Evidencias de WhatsApp" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "tvsellerschina" })).toBeVisible();
  await expect(page.getByText(/, \d{2}:\d{2}–\d{2}:\d{2} · hora de China$/u).first()).toBeVisible();
  await expect(page.getByRole("tab", { name: "Por resolver (1)" })).toBeVisible();
  await expect(page.getByLabel(/Nombre del producto/u)).toHaveCount(0);
  await page.getByRole("button", { name: "Revisar / Resolver" }).click();
  await expect(page.getByLabel(/Nombre del producto/u)).toHaveValue("");
  await page.getByLabel(/Nombre del producto/u).fill("Televisores");
  await expect(page.getByLabel("MOQ · Opcional", { exact: true })).toHaveValue("250");
  await expect(page.getByLabel("Unidad MOQ · Opcional")).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "Precio cotizado · Opcional" })).toHaveValue("600");
  await expect(page.getByLabel("Unidad del precio")).toHaveValue("unidad");
  await expect(page.getByLabel("FOB explícito")).toBeVisible();
  await expect(page.getByLabel("FOB explícito")).toHaveValue("");
  await page.getByRole("button", { name: "Guardar negociación y resolver" }).click();
  await expect(page.getByRole("status")).toContainText("Producto guardado como borrador");
  await expect(page.getByRole("link", { name: "Ver resultado" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Por resolver (0)" })).toBeVisible();
  await page.getByRole("tab", { name: "Resueltas" }).click();
  await expect(page.getByText("Precio cotizado: USD 600 / unidad.")).toBeVisible();
  await page.getByRole("button", { name: "Productos", exact: true }).click();
  await expect(page.getByText("Precio cotizado: USD 600 / unidad")).toBeVisible();
  const product = await db!.supplierProduct.findFirstOrThrow({ where: { captureId } });
  expect(product.fobAmount).toBeNull();
  expect(product.moqUnit).toBeNull();
});

test("ADMIN resuelve una negociación adicional y revisa el borrador desde su ficha", async ({ page }) => {
  await db!.whatsAppBurst.update({ where: { id: firstBurstId }, data: { status: "DONE" } });
  await burst(["Moq 300", "Valen 650 usd cada uno"]);
  await session(page, adminId);
  await page.goto(`/app/viajes/${tripId}?section=evidencias`);
  await expect(page.getByRole("tab", { name: "Por resolver (1)" })).toBeVisible();
  await page.getByRole("button", { name: "Revisar / Resolver" }).click();
  await page.getByRole("radio", { name: /Elegir proveedor existente/u }).check();
  await page.getByRole("combobox", { name: "Proveedor existente, obligatorio" }).click();
  await page.getByRole("option", { name: /tvsellerschina/u }).click();
  await page.getByRole("radio", { name: "Elegir existente" }).check();
  await page.getByRole("combobox", { name: "Producto existente, obligatorio" }).click();
  await page.getByRole("option", { name: /Televisores/u }).click();
  await page.getByRole("button", { name: "Guardar negociación y resolver" }).click();
  await expect(page.getByRole("tab", { name: "Por resolver (0)" })).toBeVisible();
  await page.goto(`/app/viajes/${tripId}/admin/capturas/${captureId}`);
  await expect(page.getByRole("heading", { name: "tvsellerschina" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar proveedor" })).toBeDisabled();
  await page.getByRole("button", { name: "Marcar borrador revisado" }).click();
  await expect(page.getByText("Borrador revisado · Sin confirmar")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Persona de contacto/u }).click();
  const editor = page.getByRole("region", { name: "Editar Persona de contacto" });
  await editor.getByLabel("Persona de contacto").fill("sales@example.test");
  await editor.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Proveedor confirmado")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
});

test("viajero resuelve una tarjeta sin producto y recupera un descarte agrupado", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await burst([null, "Se llama HAPPY PACK"]);
  await session(page, env.userId);
  await page.goto(`/app/viajes/${tripId}?section=evidencias`);
  await expect(page.getByRole("heading", { name: "HAPPY PACK" })).toBeVisible();
  await page.getByRole("button", { name: "Revisar / Resolver" }).click();
  await expect(page.getByRole("radio", { name: /Sólo proveedor/u })).toBeChecked();
  await expect(page.getByLabel("Nombre del proveedor *")).toHaveValue("HAPPY PACK");
  await page.getByRole("button", { name: "Guardar proveedor y resolver" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Información guardada" })).toContainText("No se creó ningún producto");
  const happyPack = await db!.supplierCapture.findFirstOrThrow({ where: { tripId, companyName: "HAPPY PACK" } });
  expect(await db!.supplierProduct.count({ where: { captureId: happyPack.id } })).toBe(0);

  await db!.whatsAppBurst.updateMany({ where: { userId: env.userId, status: { in: ["OPEN", "PROCESSING", "WAITING", "COMMITTING"] } }, data: { status: "DONE" } });
  await burst([null, "Proveedor descartable"]);
  await page.reload();
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  await expect(page.getByLabel("Nombre del proveedor *")).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Confirmar descarte (2)" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "La selección quedó descartada" }),
  ).toContainText("originales siguen en Historial");
  await page.getByRole("tab", { name: "Descartadas" }).click();
  await expect(page.getByText("Los originales siguen conservados.")).toBeVisible();
  await page.getByRole("button", { name: "Recuperar negociación" }).click();
  await expect(page.getByRole("tab", { name: /Por resolver \(1\)/u })).toBeVisible();
  const width390 = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(width390.scroll).toBeLessThanOrEqual(width390.client + 1);
  await page.setViewportSize({ width: 360, height: 780 });
  const width360 = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(width360.scroll).toBeLessThanOrEqual(width360.client + 1);
});

test("descarte individual tolera un fallo de red y permite recuperar el original", async ({ page }) => {
  await burst([null]);
  await session(page, env.userId);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(`/app/viajes/${tripId}?section=evidencias`);
  await expect(page.getByRole("heading", { name: "Fotografía pendiente de identificar" })).toBeVisible();
  const photoCard = page.locator("article").filter({ has: page.getByRole("heading", { name: "Fotografía pendiente de identificar" }) });
  const resolvePath = /\/whatsapp-evidence\/[^/]+\/resolve$/u;
  await page.route(resolvePath, (route) => route.abort("failed"));
  page.once("dialog", (dialog) => dialog.accept());
  await photoCard.getByRole("button", { name: "Descartar", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /Failed to fetch|No pudimos descartar/u })).toBeVisible();
  await page.unroute(resolvePath);
  page.once("dialog", (dialog) => dialog.accept());
  await photoCard.getByRole("button", { name: "Descartar", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Evidencia descartada" })).toBeVisible();
  await page.getByRole("tab", { name: "Descartadas" }).click();
  await page.locator("article").filter({ has: page.getByRole("heading", { name: "Fotografía pendiente de identificar" }) }).getByRole("button", { name: "Revisar detalles" }).click();
  await page.getByRole("button", { name: "Recuperar evidencia" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Evidencia recuperada" })).toBeVisible();
});

test("móvil: un producto automático se puede finalizar y reabrir sin perder el vínculo", async ({ page }) => {
  const snapshot = await burst(["Aca encontre almohadones que me interesan cargalos como producto"]);
  const messageId = snapshot.messages[0].id;
  await db!.whatsAppBurstMessage.update({ where: { id: messageId }, data: { reading: { segments: [{ candidate: { extractedFields: { category: "almohadones" } } }] } } });
  const product = await db!.supplierProduct.create({ data: { captureId, name: "almohadones", status: "DRAFT", sourceEvidence: [{ messageId }] } });
  await db!.whatsAppAgentOperation.create({ data: { id: randomUUID(), burstId: snapshot.id, revision: 1, tool: "create_product_draft", status: "COMPLETED", arguments: { tripId, companyId, evidence: [{ messageId }] }, result: { id: product.id, captureId } } });
  await session(page, env.userId);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/app/viajes/${tripId}?section=evidencias`);
  const card = page.locator("article").filter({ has: page.getByRole("heading", { name: "almohadones" }) });
  await expect(card.getByText(/Registro vinculado: almohadones/u)).toBeVisible();
  await expect(card.getByRole("link", { name: "Abrir registro vinculado" })).toBeVisible();
  await card.getByRole("button", { name: "Finalizar revisión" }).click();
  await page.getByRole("tab", { name: "Resueltas" }).click();
  const resolved = page.locator("article").filter({ has: page.getByRole("heading", { name: "almohadones" }) });
  await expect(resolved.getByText("Resuelta")).toBeVisible();
  await resolved.getByRole("button", { name: "Reabrir revisión" }).click();
  await page.getByRole("tab", { name: /Por resolver/u }).click();
  await expect(page.locator("article").filter({ has: page.getByRole("heading", { name: "almohadones" }) }).getByRole("button", { name: "Finalizar revisión" })).toBeVisible();
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
});
