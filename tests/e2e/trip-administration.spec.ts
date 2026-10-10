import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/cuenta/ingresar");
  await page.getByLabel("Email").fill("admin.ux@example.test");
  await page.getByRole("textbox", { name: "Contraseña", exact: true }).fill("LocalUxPassword123!");
  await page.getByRole("button", { name: "Ingresar a Nihao App" }).click();
  await expect(page).toHaveURL(/\/app(?:\/|$)/u);
}

test("admin asigna, desasigna y reasigna sin duplicar membresías", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "La mutación se ejecuta una sola vez en la base aislada");
  await signIn(page);
  await page.goto("/app/viajes/ux-trip/admin");
  await expect(page.getByRole("heading", { name: "Participantes y empresas" })).toBeVisible();
  await expect(page.getByText("Bruno Sin Empresa").first()).toBeVisible();
  await expect(page.getByText("Sin empresa", { exact: true }).first()).toBeVisible();

  const traveler = page.getByRole("combobox", { name: "Buscar viajero" });
  await traveler.fill("Ana Cuenta Nueva");
  await page.getByRole("option", { name: /Ana Cuenta Nueva/u }).click();
  await page.getByLabel("Empresa del viajero").selectOption({ label: "Empresa Norte" });
  await page.getByRole("button", { name: "Asignar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Viajero asignado a Empresa Norte");

  await traveler.fill("Admin Secundario");
  await expect(page.getByText("No encontramos viajeros con ese nombre o email.")).toBeVisible();
  await traveler.fill("Bruno Sin Empresa");
  await page.getByRole("option", { name: /Bruno Sin Empresa/u }).click();
  await page.getByLabel("Empresa del viajero").selectOption({ label: "Empresa Norte" });
  await page.getByRole("button", { name: "Asignar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Viajero asignado a Empresa Norte");

  const companyCard = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Empresa Norte" }) });
  page.once("dialog", (dialog) => dialog.accept());
  await companyCard.getByRole("button", { name: "Quitar de esta empresa" }).first().click();
  await expect(page.getByRole("status")).toContainText("Su membresía del viaje y su historial se conservaron");
  await expect(page.getByText("Bruno Sin Empresa").first()).toBeVisible();

  await traveler.fill("Bruno Sin Empresa");
  await page.getByRole("option", { name: /Bruno Sin Empresa/u }).click();
  await page.getByLabel("Empresa del viajero").selectOption({ label: "Empresa Sur" });
  await page.getByRole("button", { name: "Asignar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Viajero asignado a Empresa Sur");

  const duplicate = await page.evaluate(async () => {
    const response = await fetch("/api/bot/trips/ux-trip/admin/travelers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: "ux-traveler-unassigned", companyId: "ux-company-b" }) });
    return { status: response.status, body: await response.json() };
  });
  expect(duplicate.status).toBe(200);
  expect(duplicate.body.assignment.createdCompanyMembership).toBe(false);

  await page.screenshot({ path: "/home/rcoirini/proyectos-bs/nihao-audit-input/uat-final-ux-20261010/admin-desktop.png", fullPage: true });
  await traveler.fill("Carla");
  await expect(page.getByRole("option", { name: /Carla Asignada/u })).toBeVisible();
  await page.screenshot({ path: "/home/rcoirini/proyectos-bs/nihao-audit-input/uat-final-ux-20261010/admin-combobox.png", fullPage: true });

  await page.getByRole("button", { name: "Reportes" }).click();
  const href = await page.getByRole("link", { name: "Ver informe" }).getAttribute("href");
  expect(href).toBeTruthy();
  const pdf = await page.request.get(href!);
  expect(pdf.ok()).toBeTruthy();
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).byteLength).toBeGreaterThan(100_000);
});

test("administración sigue utilizable en teléfono sin scroll horizontal", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Esta comprobación corresponde al viewport móvil");
  await signIn(page);
  await page.goto("/app/viajes/ux-trip/admin");
  await expect(page.getByRole("heading", { name: "Participantes y empresas" })).toBeVisible();
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
  const traveler = page.getByRole("combobox", { name: "Buscar viajero" });
  await traveler.fill("Carla");
  await expect(page.getByRole("option", { name: /Carla Asignada/u })).toBeVisible();
  await page.screenshot({ path: "/home/rcoirini/proyectos-bs/nihao-audit-input/uat-final-ux-20261010/admin-mobile.png", fullPage: true });
});
