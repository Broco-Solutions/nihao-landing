import { createHmac, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createAgentEnvironment, localAgentDatabase } from "../../evals/whatsapp-agent/environment.ts";
import type { BurstMessage, BurstSnapshot } from "../../lib/channels/whatsapp/burst-types.ts";

const secret = process.env.BETTER_AUTH_SECRET;
const base = process.env.EVAL_AGENT_DATABASE_URL;
test.skip(!secret || !base, "Requiere PostgreSQL aislado y sesión de prueba");
test.describe.configure({ mode: "serial" });

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
  await expect(page.getByRole("heading", { name: "Evidencias de WhatsApp" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "tvsellerschina" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Por resolver (1)" })).toBeVisible();
  await expect(page.getByLabel(/Nombre del producto/u)).toHaveValue("Televisores");
  await expect(page.getByLabel("MOQ · Opcional", { exact: true })).toHaveValue("250");
  await expect(page.getByLabel("Unidad MOQ · Opcional")).toHaveValue("");
  await expect(page.getByLabel("Precio cotizado")).toHaveValue("600");
  await expect(page.getByLabel("Unidad del precio")).toHaveValue("unidad");
  await expect(page.getByLabel("FOB explícito")).toBeVisible();
  await expect(page.getByLabel("FOB explícito")).toHaveValue("");
  await page.getByRole("button", { name: "Guardar negociación y resolver" }).click();
  await expect(page.getByRole("status")).toContainText("Producto guardado como borrador");
  await expect(page.getByRole("link", { name: "Ver resultado" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Por resolver (0)" })).toBeVisible();
  await page.getByRole("tab", { name: "Resueltas" }).click();
  await expect(page.getByText("Valen 600 usd cada uno")).toBeVisible();
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
  await expect(page.getByText("Borrador revisado · Sin confirmar")).toBeVisible();
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
  await burst([null, "Se llama HAPPY PACK"]);
  await session(page, env.userId);
  await page.goto(`/app/viajes/${tripId}?section=evidencias`);
  await expect(page.getByRole("heading", { name: "HAPPY PACK" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Sólo proveedor/u })).toBeChecked();
  await expect(page.getByLabel("Nombre del proveedor *")).toHaveValue("HAPPY PACK");
  await page.getByRole("button", { name: "Guardar proveedor y resolver" }).click();
  await expect(page.getByRole("status")).toContainText("No se creó ningún producto");
  const happyPack = await db!.supplierCapture.findFirstOrThrow({ where: { tripId, companyName: "HAPPY PACK" } });
  expect(await db!.supplierProduct.count({ where: { captureId: happyPack.id } })).toBe(0);

  await db!.whatsAppBurst.updateMany({ where: { userId: env.userId, status: { in: ["OPEN", "PROCESSING", "WAITING", "COMMITTING"] } }, data: { status: "DONE" } });
  await burst([null, "Proveedor descartable"]);
  await page.reload();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Descartar selección" }).click();
  await expect(page.getByRole("status")).toContainText("originales siguen en Historial");
  await page.getByRole("tab", { name: "Descartadas" }).click();
  await expect(page.getByRole("heading", { name: "Negociación descartada" })).toBeVisible();
  await page.getByRole("button", { name: "Recuperar negociación" }).click();
  await expect(page.getByRole("tab", { name: /Por resolver \(1\)/u })).toBeVisible();
});
