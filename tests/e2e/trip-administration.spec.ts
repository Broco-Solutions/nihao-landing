import { expect, test, type Page } from "@playwright/test";

const shots = "/home/rcoirini/proyectos-bs/nihao-audit-input/uat-operational-ux-20261011";
const travelerShots = "/home/rcoirini/proyectos-bs/nihao-audit-input/uat-traveler-card-compact-20261011";

async function signIn(page: Page) {
  await page.goto("/cuenta/ingresar");
  await page.getByLabel("Email").fill("admin.ux@example.test");
  await page.getByRole("textbox", { name: "Contraseña", exact: true }).fill("LocalUxPassword123!");
  await page.getByRole("button", { name: "Ingresar a Nihao App" }).click();
  await expect(page).toHaveURL(/\/app(?:\/|$)/u);
}

async function chooseSearchable(page: Page, label: string, query: string, option: RegExp, searchLabel = "Nombre o email") {
  const trigger = page.getByRole("combobox", { name: label });
  await trigger.click();
  const search = page.getByRole("textbox", { name: searchLabel, exact: true });
  await search.fill(query);
  await page.getByRole("option", { name: option }).click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
}

async function choose(page: Page, label: string, option: RegExp) {
  const trigger = page.getByRole("combobox", { name: label });
  await trigger.click();
  await page.getByRole("option", { name: option }).click();
}

test("admin asigna, desasigna y reasigna sin duplicar membresías", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "La mutación se ejecuta una sola vez en la base aislada");
  await signIn(page);
  await page.evaluate(async () => {
    const removeCompany = (userId: string, companyId: string) => fetch(`/api/bot/trips/ux-trip/companies/${companyId}/members/${userId}`, { method: "DELETE" });
    await Promise.allSettled([removeCompany("ux-traveler-new", "ux-company-a"), removeCompany("ux-traveler-new", "ux-company-b"), removeCompany("ux-traveler-unassigned", "ux-company-a"), removeCompany("ux-traveler-unassigned", "ux-company-b")]);
    await fetch("/api/bot/trips/ux-trip/admin/travelers/ux-traveler-new", { method: "DELETE" });
  });
  await page.goto("/app/viajes/ux-trip/admin");
  await expect(page.getByRole("heading", { name: "Participantes y empresas" })).toBeVisible();
  await expect(page.getByText("Bruno Sin Empresa").first()).toBeVisible();
  await expect(page.getByText("Sin empresa", { exact: true }).first()).toBeVisible();

  const brunoActivityCard = page.getByText("Bruno Sin Empresa", { exact: true }).first().locator("xpath=ancestor::article");
  await brunoActivityCard.getByRole("button", { name: "Ver actividad" }).click();
  await expect(page.getByText("Actividad del viajero")).toBeVisible();
  await expect(page.getByText("Bruno Sin Empresa", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Requiere atención/u })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Registradas" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Historial" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Descartadas" })).toHaveCount(0);
  await page.getByRole("button", { name: "Gestionar viaje" }).click();

  await chooseSearchable(page, "Buscar viajero", "Ana Cuenta Nueva", /Ana Cuenta Nueva/u);
  await choose(page, "Empresa del viajero", /Empresa Norte/u);
  await page.getByRole("button", { name: "Asignar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Viajero asignado a Empresa Norte");

  const traveler = page.getByRole("combobox", { name: "Buscar viajero" });
  await traveler.click();
  await page.getByRole("textbox", { name: "Nombre o email" }).fill("Admin Secundario");
  await expect(page.getByText("No encontramos viajeros con ese nombre o email.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(traveler).toHaveAttribute("aria-expanded", "false");

  await chooseSearchable(page, "Buscar viajero", "Bruno Sin Empresa", /Bruno Sin Empresa/u);
  await choose(page, "Empresa del viajero", /Empresa Norte/u);
  await page.getByRole("button", { name: "Asignar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Viajero asignado a Empresa Norte");

  await page.getByLabel("Buscar empresas participantes").fill("Empresa Norte");
  const companyHeading = page.getByRole("heading", { name: "Empresa Norte", exact: true });
  const companyCard = companyHeading.locator("xpath=ancestor::details");
  await companyHeading.click();
  const brunoRow = companyCard.getByText("Bruno Sin Empresa", { exact: true }).locator("xpath=ancestor::div[button[contains(normalize-space(.), 'Quitar de esta empresa')]][1]");
  page.once("dialog", (dialog) => dialog.accept());
  await brunoRow.getByRole("button", { name: "Quitar de esta empresa" }).click();
  await expect(page.getByRole("status")).toContainText("Su membresía del viaje y su historial se conservaron");

  await chooseSearchable(page, "Buscar viajero", "Bruno Sin Empresa", /Bruno Sin Empresa/u);
  await choose(page, "Empresa del viajero", /Empresa Sur/u);
  await page.getByRole("button", { name: "Asignar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Viajero asignado a Empresa Sur");

  const duplicate = await page.evaluate(async () => {
    const response = await fetch("/api/bot/trips/ux-trip/admin/travelers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: "ux-traveler-unassigned", companyId: "ux-company-b" }) });
    return { status: response.status, body: await response.json() };
  });
  expect(duplicate.status).toBe(200);
  expect(duplicate.body.assignment.createdCompanyMembership).toBe(false);

  await page.screenshot({ path: `${shots}/admin-desktop.png`, fullPage: true });
  await traveler.click();
  await page.getByRole("textbox", { name: "Nombre o email" }).fill("Carla");
  await expect(page.getByRole("option", { name: /Carla Asignada/u })).toBeVisible();
  await page.screenshot({ path: `${shots}/admin-combobox-open.png`, fullPage: true });
  await page.keyboard.press("Enter");
  await expect(traveler).toContainText("Carla Asignada");
  await page.getByRole("button", { name: "Limpiar Buscar viajero" }).click();
  await expect(traveler).toContainText("Elegí una opción");
  await traveler.click();
  await page.mouse.click(4, 4);
  await expect(traveler).toHaveAttribute("aria-expanded", "false");

  await page.getByRole("button", { name: "Reportes" }).click();
  await expect(page.getByText("Informe actual", { exact: true })).toBeVisible();
  await expect(page.getByText("Información pendiente de revisión")).toBeVisible();
  const href = await page.getByRole("link", { name: "Abrir PDF" }).getAttribute("href");
  expect(href).toBeTruthy();
  const pdf = await page.request.get(href!);
  expect(pdf.ok()).toBeTruthy();
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).byteLength).toBeGreaterThan(100_000);
  await page.screenshot({ path: `${shots}/reports-integrated-desktop.png`, fullPage: true });
});

test("admin gestiona empresas y viajeros desde sus fichas", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Las mutaciones se ejecutan una sola vez en la base aislada");
  await signIn(page);
  await page.goto("/app/empresas");

  const companyName = `Empresa Temporal UX ${Date.now()}`;
  await page.getByRole("textbox", { name: "Nueva empresa" }).fill(companyName);
  await page.getByRole("button", { name: "Crear", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Empresa creada");
  await page.getByLabel("Buscar en el catálogo").fill(companyName);
  const companyCard = page.getByText(companyName, { exact: true }).locator("xpath=ancestor::article");
  page.once("dialog", (dialog) => dialog.accept(`${companyName} Renombrada`));
  await companyCard.getByRole("button", { name: "Renombrar" }).click();
  await expect(page.getByRole("status")).toContainText("Nombre actualizado");

  await page.getByLabel("Buscar en el catálogo").fill("Empresa Norte");
  await page.getByLabel("Administrar Empresa Norte").click();
  await expect(page.getByRole("heading", { name: "Viaje UX aislado" })).toBeVisible();
  await chooseSearchable(page, "Agregar viajero existente", "Bruno", /Bruno Sin Empresa/u, "Buscar…");
  await page.getByRole("button", { name: "Asignar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Viajero asignado");

  const northCard = page.getByText("Empresa Norte", { exact: true }).locator("xpath=ancestor::article");
  const brunoRow = northCard.getByText("Bruno Sin Empresa", { exact: true }).locator("xpath=ancestor::div[button[contains(normalize-space(.), 'Quitar')]][1]");
  page.once("dialog", (dialog) => dialog.accept());
  await brunoRow.getByRole("button", { name: "Quitar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Asociación quitada");
  await page.screenshot({ path: `${shots}/companies-management-desktop.png`, fullPage: true });

  await page.goto("/app/viajeros");
  await expect(page.getByRole("heading", { name: "Administrar viajeros" })).toBeVisible();
  const travelerCard = page.getByText("Bruno Sin Empresa", { exact: true }).locator("xpath=ancestor::article");
  await expect(travelerCard.getByRole("button", { name: "Administrar", exact: true })).toHaveAttribute("aria-expanded", "false");
  await travelerCard.getByRole("button", { name: "Administrar", exact: true }).click();
  await expect(travelerCard.getByText("Viajes y empresas", { exact: true })).toBeVisible();
  await expect(travelerCard.getByRole("button", { name: "Editar viajero", exact: true })).toBeVisible();
  await expect(travelerCard.getByRole("combobox", { name: "Empresa", exact: true })).toHaveCount(0);
  await expect(travelerCard.getByRole("combobox", { name: "Viaje", exact: true })).toHaveCount(0);
  await page.screenshot({ path: `${travelerShots}/traveler-card-desktop.png`, fullPage: true });

  await travelerCard.getByRole("button", { name: "Agregar otra empresa", exact: true }).click();
  await expect(travelerCard.getByRole("combobox", { name: "Empresa", exact: true })).toBeVisible();
  await travelerCard.getByRole("button", { name: "Cancelar", exact: true }).last().click();
  await expect(travelerCard.getByRole("combobox", { name: "Empresa", exact: true })).toHaveCount(0);

  await travelerCard.getByRole("button", { name: "Agregar a otro viaje", exact: true }).click();
  await expect(travelerCard.getByRole("combobox", { name: "Viaje", exact: true })).toBeVisible();
  await page.screenshot({ path: `${travelerShots}/traveler-add-trip-desktop.png`, fullPage: true });
  await travelerCard.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(travelerCard.getByText("Viajes y empresas", { exact: true })).toHaveCount(0);
});

for (const projectName of ["mobile", "tablet"] as const) {
  test(`administración es usable sin scroll horizontal en ${projectName}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== projectName, `Esta comprobación corresponde a ${projectName}`);
    await signIn(page);
    await page.goto("/app/viajes/ux-trip/admin");
    await expect(page.getByRole("heading", { name: "Participantes y empresas" })).toBeVisible();
    const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
    const traveler = page.getByRole("combobox", { name: "Buscar viajero" });
    await traveler.click();
    await page.getByRole("textbox", { name: "Nombre o email" }).fill("Carla");
    await expect(page.getByRole("option", { name: /Carla Asignada/u })).toBeVisible();
    const panel = page.getByRole("listbox", { name: "Buscar viajero" });
    await expect(panel).toBeVisible();
    const bounds = await panel.boundingBox();
    const viewport = page.viewportSize();
    expect(bounds).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport!.height);
    await page.screenshot({ path: `${shots}/admin-${projectName}-dropdown.png`, fullPage: true });
    await page.keyboard.press("Escape");
    await expect(traveler).toHaveAttribute("aria-expanded", "false");
  });
}

for (const projectName of ["mobile", "tablet", "desktop"] as const) {
  test(`ficha de viajero compacta y sin desbordes en ${projectName}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== projectName, `Esta comprobación corresponde a ${projectName}`);
    await signIn(page);
    await page.goto("/app/viajeros");
    const travelerCard = page.getByText("Bruno Sin Empresa", { exact: true }).locator("xpath=ancestor::article");
    await expect(travelerCard.getByRole("button", { name: "Editar viajero", exact: true })).toBeVisible();
    await expect(travelerCard.getByRole("button", { name: "Administrar", exact: true })).toHaveAttribute("aria-expanded", "false");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${travelerShots}/traveler-card-${projectName}-closed.png`, fullPage: true });
    await travelerCard.getByRole("button", { name: "Administrar", exact: true }).click();
    await expect(travelerCard.getByText("Viajes y empresas", { exact: true })).toBeVisible();
    const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
    await expect(travelerCard.getByRole("combobox", { name: "Empresa", exact: true })).toHaveCount(0);
    await travelerCard.getByRole("button", { name: "Agregar otra empresa", exact: true }).click();
    await expect(travelerCard.getByRole("combobox", { name: "Empresa", exact: true })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${travelerShots}/traveler-card-${projectName}-company-form.png`, fullPage: true });
    await travelerCard.getByRole("button", { name: "Cancelar", exact: true }).last().click();
    await travelerCard.getByRole("button", { name: "Agregar a otro viaje", exact: true }).click();
    await expect(travelerCard.getByRole("combobox", { name: "Viaje", exact: true })).toBeVisible();
    await travelerCard.getByRole("button", { name: "Cerrar", exact: true }).click();
    await expect(travelerCard.getByText("Viajes y empresas", { exact: true })).toHaveCount(0);
  });
}
