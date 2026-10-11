import { expect, test, type Page } from "@playwright/test";

const shots = "/home/rcoirini/proyectos-bs/nihao-audit-input/uat-web-ux-20261011";
const password = "LocalUxPassword123!";

async function signIn(page: Page) {
  await page.goto("/cuenta/ingresar");
  await page.getByLabel("Email").fill("admin.ux@example.test");
  await page.getByRole("textbox", { name: "Contraseña", exact: true }).fill(password);
  await page.getByRole("button", { name: "Ingresar a Nihao App" }).click();
  await expect(page).toHaveURL(/\/app(?:\/|$)/u);
}

for (const viewport of ["desktop", "tablet", "mobile"] as const) {
  test(`proveedores y productos comparten navegación y filtros en ${viewport}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== viewport, `Vista ${viewport}`);
    await signIn(page);
    await page.goto("/app/viajes/ux-trip/admin/proveedores");
    await expect(page).toHaveURL(/\/app\/viajes\/[^/?]+\?section=proveedores/u);
    await expect(page.getByRole("heading", { name: "Proveedores", exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("Proveedor, contacto, categoría o ciudad")).toBeVisible();
    await page.getByRole("button", { name: "Más filtros" }).click();
    await page.getByRole("combobox", { name: "Orden" }).click();
    await expect(page.getByRole("option", { name: "Nombre A–Z" })).toBeVisible();
    await page.keyboard.press("Escape");
    const comparisonChoices = page.getByRole("checkbox", { name: /para comparar/u });
    if (await comparisonChoices.count() >= 2) {
      await comparisonChoices.nth(0).check();
      await comparisonChoices.nth(1).check();
      await expect(page.getByRole("heading", { name: "Comparación de seleccionados" })).toBeVisible();
    }
    const supplierDimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(supplierDimensions.scroll).toBeLessThanOrEqual(supplierDimensions.client + 1);
    await page.screenshot({ path: `${shots}/trip-suppliers-${viewport}.png` });
    await page.getByRole("button", { name: "Productos", exact: true }).click();
    await expect(page).toHaveURL(/section=productos/u);
    await expect(page.getByPlaceholder("Producto, modelo o proveedor")).toBeVisible();
    const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
    await page.screenshot({ path: `${shots}/trip-products-${viewport}.png` });
  });
}
