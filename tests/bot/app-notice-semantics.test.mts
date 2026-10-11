import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppNotice, type AppNoticeTone } from "../../components/app/AppNotice.tsx";

const expected: Record<AppNoticeTone, { role: string; palette: string }> = {
  success: { role: "status", palette: "bg-emerald-50" },
  error: { role: "alert", palette: "bg-red-50" },
  warning: { role: "status", palette: "bg-amber-50" },
  info: { role: "status", palette: "bg-sky-50" },
};

for (const [tone, semantics] of Object.entries(expected) as Array<[AppNoticeTone, { role: string; palette: string }]>) {
  test(`AppNotice renders ${tone} with semantic role, icon and palette`, () => {
    const markup = renderToStaticMarkup(AppNotice({ tone, title: "Estado", children: "Detalle de la operación" }));
    assert.match(markup, new RegExp(`role="${semantics.role}"`));
    assert.match(markup, new RegExp(`data-tone="${tone}"`));
    assert.match(markup, new RegExp(semantics.palette));
    assert.match(markup, /aria-live="(?:polite|assertive)"/);
    assert.match(markup, /aria-hidden="true"/);
    assert.match(markup, /Detalle de la operación/);
  });
}

test("trip feedback distinguishes a completed save from a failed save", () => {
  const source = readFileSync(new URL("../../components/app/TripInsightsView.tsx", import.meta.url), "utf8");
  assert.match(source, /tone: "success", message: "Evaluación guardada\."/);
  assert.match(source, /tone: "error", message: caught instanceof Error/);
  assert.doesNotMatch(source, /Evaluación guardada[^\n]+bg-nihao-soft/);
});

test("primary actions keep the Nihao brand style", () => {
  const source = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /\.app-primary-button/);
  assert.match(source, /\.app-primary-button \{ background: var\(--color-nihao\); color: white; \}/);
});
