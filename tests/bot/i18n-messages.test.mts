import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

function keys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key));
}

test("todos los idiomas exponen las mismas claves de mensajes", async () => {
  const locales = ["es", "en", "it"];
  const messages = await Promise.all(locales.map(async (locale) => JSON.parse(await readFile(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")) as unknown));
  const expected = keys(messages[0]).sort();
  for (const [index, message] of messages.entries()) {
    assert.deepEqual(keys(message).sort(), expected, `faltan o sobran claves en ${locales[index]}`);
  }
});
