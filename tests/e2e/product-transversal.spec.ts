import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

const shots = "/home/rcoirini/proyectos-bs/nihao-audit-input/uat-operational-ux-20261011";
const password = "LocalUxPassword123!";

async function signIn(page: Page, email: string) {
  await page.goto("/cuenta/ingresar");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Contraseña", exact: true }).fill(password);
  await page.getByRole("button", { name: "Ingresar a Nihao App" }).click();
  await expect(page).toHaveURL(/\/app(?:\/|$)/u);
}

async function resetSyntheticOnboarding() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL es obligatoria para el recorrido aislado");
  const url = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.endsWith("/nihao_ux")) {
    throw new Error("El recorrido transversal sólo puede modificar PostgreSQL local nihao_ux");
  }
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query('UPDATE "TripMember" SET "onboardingCompletedAt" = NULL WHERE "tripId" = $1 AND "userId" = $2', ["ux-trip", "ux-traveler-flow"]);
    if (result.rowCount !== 1) throw new Error("No encontramos la membresía sintética del recorrido transversal");
  } finally {
    await client.end();
  }
}

async function chooseSearchable(page: Page, label: string, query: string, option: RegExp, searchLabel = "Buscar…") {
  const trigger = page.getByRole("combobox", { name: label, exact: true });
  await trigger.click();
  await page.getByRole("textbox", { name: searchLabel, exact: true }).fill(query);
  await page.getByRole("option", { name: option }).click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
}

test("recorrido transversal de administración conserva membresía e historial", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Las mutaciones se ejecutan una sola vez en PostgreSQL aislado");
  await signIn(page, "admin.ux@example.test");

  const suffix = Date.now().toString(36);
  const tripName = `Viaje transversal ${suffix}`;
  const northName = `Empresa transversal Norte ${suffix}`;
  const southName = `Empresa transversal Sur ${suffix}`;

  await page.getByRole("button", { name: "Nuevo viaje" }).click();
  await page.getByLabel("Nombre").fill(tripName);
  await page.getByLabel("Inicio").fill("2027-04-01");
  await page.getByLabel("Fin").fill("2027-04-30");
  await page.getByRole("button", { name: "Crear y entrar" }).click();
  await expect(page).toHaveURL(/\/app\/viajes\/[^/]+\/gestion/u);
  const tripId = (await page.evaluate(async () => (await (await fetch("/api/bot/trips")).json()).trips.find((trip: { name: string }) => trip.name === document.querySelector("h1")?.textContent)?.id)) as string;
  await expect(page.getByText("Todavía no hay empresas asignadas a este viaje.")).toBeVisible();

  for (const companyName of [northName, southName]) {
    await page.goto("/app/empresas");
    await page.getByRole("textbox", { name: "Nueva empresa" }).fill(companyName);
    await page.getByRole("button", { name: "Crear", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Empresa creada");
    await page.getByLabel("Buscar en el catálogo").fill(companyName);
    const card = page.getByText(companyName, { exact: true }).locator("xpath=ancestor::article");
    await card.getByLabel(`Administrar ${companyName}`).click();
    await expect(card.getByText("Esta empresa no está asignada a ningún viaje.")).toBeVisible();
    await chooseSearchable(page, "Viaje", tripName, new RegExp(tripName, "u"));
    await card.getByRole("button", { name: "Agregar al viaje" }).click();
    await expect(page.getByRole("status")).toContainText("Empresa incorporada al viaje");
  }

  await page.goto(`/app/viajes/${tripId}/admin`);
  await expect(page.getByText("2", { exact: true }).last()).toBeVisible();
  await chooseSearchable(page, "Buscar viajero", "Lucía Recorrido", /Lucía Recorrido/u, "Nombre o email");
  await page.getByRole("combobox", { name: "Empresa del viajero" }).click();
  await page.getByRole("option", { name: new RegExp(northName, "u") }).click();
  await page.getByRole("button", { name: "Asignar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(northName);

  await page.getByRole("combobox", { name: "Empresa del viajero" }).click();
  await page.getByRole("option", { name: new RegExp(southName, "u") }).click();
  await chooseSearchable(page, "Buscar viajero", "Lucía Recorrido", /Lucía Recorrido/u, "Nombre o email");
  await page.getByRole("button", { name: "Asignar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(southName);

  const north = page.getByRole("heading", { name: northName }).locator("xpath=ancestor::details");
  await north.getByRole("heading", { name: northName }).click();
  const row = north.getByText("Lucía Recorrido", { exact: true }).locator("xpath=ancestor::div[button[contains(normalize-space(.), 'Quitar de esta empresa')]][1]");
  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "Quitar de esta empresa" }).click();
  await expect(page.getByRole("status")).toContainText("Su membresía del viaje y su historial se conservaron");

  const persisted = await page.evaluate(async ({ tripId, northName, southName }) => {
    const response = await fetch(`/api/bot/trips/${tripId}/admin`);
    const data = await response.json();
    const member = data.members.find((item: { name: string }) => item.name === "Lucía Recorrido");
    const companies = data.companies.filter((company: { userIds: string[] }) => company.userIds.includes(member.userId)).map((company: { name: string }) => company.name);
    return { ok: response.ok, role: member.role, companies, expected: { northName, southName } };
  }, { tripId, northName, southName });
  expect(persisted).toMatchObject({ ok: true, role: "TRAVELER" });
  expect(persisted.companies).toEqual([southName]);

  await page.getByRole("button", { name: "Proveedores", exact: true }).click();
  await expect(page.getByText("Todavía no hay proveedores registrados.")).toBeVisible();
  await page.getByRole("button", { name: "Reportes" }).click();
  await expect(page.getByText("Informe actual", { exact: true })).toBeVisible();
  for (const label of ["Descargar PDF", "Descargar Excel"]) {
    const href = await page.getByRole("link", { name: label }).getAttribute("href");
    expect(href).toBeTruthy();
    const response = await page.request.get(href!);
    expect(response.ok()).toBeTruthy();
  }

  await page.goto("/app/viajeros");
  await page.getByText("Invitar viajero nuevo", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Enviar invitación" })).toBeVisible();
  await page.getByLabel("Nombre").fill("Invitación cancelada");
  await page.getByLabel("Email").fill(`cancel-${suffix}@example.test`);
  await page.getByLabel("WhatsApp").fill("+598 99 000 001");
  await page.getByText("Invitar viajero nuevo", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Enviar invitación" })).not.toBeVisible();
  await page.screenshot({ path: `${shots}/transversal-admin-desktop.png`, fullPage: true });
});

test("viajero completa onboarding, revisa y confirma proveedor y producto", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Las mutaciones se ejecutan una sola vez en PostgreSQL aislado");
  await resetSyntheticOnboarding();
  const suffix = Date.now().toString(36);
  const supplierName = `Proveedor Transversal ${suffix}`;
  const productName = `Producto AT-200 ${suffix}`;
  await signIn(page, "traveler.flow@example.test");
  await page.goto("/app/viajes/ux-trip/onboarding");
  await expect(page.getByRole("heading", { name: "Bienvenido a Nihao" })).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Empezar" }).click();
  await expect(page).toHaveURL(/\/app\/viajes\/ux-trip$/u);

  const capture = await page.evaluate(async () => {
    const response = await fetch("/api/bot/captures", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tripId: "ux-trip", companyId: "ux-company-a", clientCaptureId: `ux-flow-${Date.now()}` }) });
    return { ok: response.ok, body: await response.json() };
  });
  expect(capture.ok).toBeTruthy();
  const captureId = capture.body.capture.id as string;
  await page.goto(`/app/viajes/ux-trip/proveedores/nuevo?captureId=${encodeURIComponent(captureId)}`);
  await expect(page.getByRole("heading", { name: "Capturá y revisá" })).toBeVisible();

  const editField = async (field: string, value: string) => {
    const fieldButton = page.locator("button").filter({ has: page.getByText(field, { exact: true }) }).first();
    await fieldButton.click();
    const editor = page.getByRole("region", { name: `Editar ${field}` });
    await editor.getByLabel(field).fill(value);
    await editor.getByRole("button", { name: "Guardar" }).dispatchEvent("click");
    await expect(editor).not.toBeVisible();
  };
  await editField("Empresa", supplierName);
  await editField("Persona de contacto", "ventas@transversal.example");
  await expect(page.getByRole("heading", { name: "Proveedor cargado" })).toBeVisible();

  await page.getByRole("button", { name: "Agregar producto" }).click();
  await page.getByLabel("Nombre del producto").fill(productName);
  await page.getByLabel("FOB", { exact: true }).fill("8.50");
  await page.getByLabel("MOQ", { exact: true }).fill("500");
  await page.getByLabel("Lead time").fill("21 días");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText(productName, { exact: true })).toBeVisible();
  const confirmProduct = page.getByRole("button", { name: "Confirmar producto" });
  if (await confirmProduct.isVisible()) await confirmProduct.click();
  await expect(page.getByText("Pendiente de revisión", { exact: true })).not.toBeVisible();

  await page.getByRole("link", { name: "Volver al viaje" }).click();
  await expect(page).toHaveURL(/\/app\/viajes\/ux-trip$/u);
  await page.getByRole("button", { name: "Proveedores", exact: true }).click();
  await expect(page.getByText(supplierName, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Productos" }).click();
  await expect(page.getByText(productName, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reportes" }).click();
  await page.getByText("Proveedores confirmados", { exact: true }).click();
  await expect(page.getByText(supplierName, { exact: true })).toBeVisible();
  await page.getByText("Productos confirmados", { exact: true }).click();
  await expect(page.getByText(productName, { exact: true })).toBeVisible();
  await page.screenshot({ path: `${shots}/transversal-traveler-desktop.png`, fullPage: true });
});

for (const projectName of ["tablet", "mobile"] as const) {
  test(`recorrido transversal mantiene navegación y controles visibles en ${projectName}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== projectName, `Esta comprobación corresponde a ${projectName}`);
    await signIn(page, "admin.ux@example.test");
    await page.goto("/app/viajes/ux-trip/admin");
    await expect(page.getByRole("heading", { name: "Participantes y empresas" })).toBeVisible();
    await page.getByLabel("Buscar participantes").fill("Viajero Denso 27");
    await expect(page.getByRole("heading", { name: "Viajero Denso 27", exact: true })).toBeVisible();
    await page.getByLabel("Buscar participantes").fill("");
    await page.getByLabel("Buscar empresas participantes").fill("Empresa Densa 13");
    await expect(page.getByRole("heading", { name: "Empresa Densa 13" })).toBeVisible();
    const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
    await page.screenshot({ path: `${shots}/transversal-admin-${projectName}.png`, fullPage: true });
  });
}
