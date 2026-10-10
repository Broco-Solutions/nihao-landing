import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PasswordInput } from "../../components/app/PasswordInput.tsx";

test("el control de contraseña empieza oculto y el botón no envía el formulario", () => {
  const markup = renderToStaticMarkup(createElement(PasswordInput, {
    name: "password",
    autoComplete: "new-password",
    visibilityLabel: "nueva contraseña",
  }));

  assert.match(markup, /type="password"/u);
  assert.match(markup, /autoComplete="new-password"/u);
  assert.match(markup, /type="button"/u);
  assert.match(markup, /aria-label="Mostrar nueva contraseña"/u);
  assert.match(markup, /aria-pressed="false"/u);
});

test("cada campo de contraseña renderiza su propio control accesible", () => {
  const markup = renderToStaticMarkup(createElement("form", null,
    createElement(PasswordInput, { name: "password", visibilityLabel: "nueva contraseña" }),
    createElement(PasswordInput, { name: "confirmation", visibilityLabel: "confirmación de contraseña" }),
  ));

  assert.equal((markup.match(/type="password"/gu) ?? []).length, 2);
  assert.equal((markup.match(/type="button"/gu) ?? []).length, 2);
  assert.match(markup, /aria-label="Mostrar nueva contraseña"/u);
  assert.match(markup, /aria-label="Mostrar confirmación de contraseña"/u);
});
