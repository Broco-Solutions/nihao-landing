import { expect, test, type Page } from "@playwright/test";

const shots = "/home/rcoirini/proyectos-bs/nihao-audit-input/uat-international-phone-input-20261011";

async function signIn(page: Page) {
  await page.goto("/cuenta/ingresar");
  await page.getByLabel("Email").fill("admin.ux@example.test");
  await page.getByRole("textbox", { name: "Contraseña", exact: true }).fill("LocalUxPassword123!");
  await page.getByRole("button", { name: "Ingresar a Nihao App" }).click();
  await expect(page).toHaveURL(/\/app(?:\/|$)/u, { timeout: 30_000 });
}

test("selector internacional valida, detecta país y conserva el layout responsive", async ({ page }, testInfo) => {
  await signIn(page);
  await page.goto("/app/viajeros");
  await page.getByText("Invitar viajero nuevo", { exact: true }).click();

  const country = page.getByRole("combobox", { name: "País de WhatsApp (opcional)" });
  const phone = page.getByRole("textbox", { name: "WhatsApp (opcional) — número nacional" });
  await expect(country).toContainText("Argentina");

  await phone.fill("+598 99 123 456");
  await expect(country).toContainText("Uruguay");
  await expect(phone).toHaveValue("99 123 456");

  await country.click();
  const search = page.getByRole("textbox", { name: "País, código ISO o prefijo" });
  await search.fill("China");
  const panel = page.getByRole("listbox", { name: "País de WhatsApp (opcional)" });
  const bounds = await panel.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport!.height);
  await page.screenshot({ path: `${shots}/phone-input-country-open-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole("option", { name: /China \(\+86\)/u }).click();
  await expect(country).toContainText("China");
  await phone.fill("138 0013 8000");
  await phone.blur();
  await expect(page.getByText("Revisá el número para China.")).not.toBeVisible();

  await phone.fill("123");
  await phone.blur();
  await expect(page.getByText("Revisá el número para China.")).toBeVisible();

  await country.click();
  await page.getByRole("textbox", { name: "País, código ISO o prefijo" }).fill("AR");
  await page.getByRole("option", { name: /Argentina \(\+54\)/u }).click();
  await phone.fill("");

  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
  await page.screenshot({ path: `${shots}/phone-input-${testInfo.project.name}.png`, fullPage: true });
});
