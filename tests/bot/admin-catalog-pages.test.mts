import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TravelersPage from "../../app/[locale]/(product)/app/viajeros/page.tsx";
import CompaniesPage from "../../app/[locale]/(product)/app/empresas/page.tsx";

test("las páginas de administración cargan sin consultar la sesión durante el render del servidor", () => {
  const travelers = (TravelersPage as unknown as { default: typeof TravelersPage }).default;
  const companies = (CompaniesPage as unknown as { default: typeof CompaniesPage }).default;
  assert.match(renderToStaticMarkup(createElement(travelers)), /Administrar viajeros/);
  assert.match(renderToStaticMarkup(createElement(companies)), /Administrar empresas/);
});
