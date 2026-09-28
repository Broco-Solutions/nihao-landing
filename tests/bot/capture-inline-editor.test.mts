import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const reviewSource = await readFile(new URL("../../components/app/CaptureFieldReview.tsx", import.meta.url), "utf8");
const captureSource = await readFile(new URL("../../components/app/ProductCapture.tsx", import.meta.url), "utf8");
const editorSource = await readFile(new URL("../../components/app/Tier1Editor.tsx", import.meta.url), "utf8");

test("Editar renderiza el editor inline sólo para el campo seleccionado", () => {
  assert.match(reviewSource, /editing === field \? <section/);
  assert.match(reviewSource, /renderEditor\(field\)/);
  assert.match(reviewSource, /aria-expanded=\{editing === field\}/);
});

test("un único estado de edición reemplaza el editor al cambiar de campo", () => {
  assert.match(captureSource, /const \[editing, setEditing\] = useState<Tier1Field \| null>\(null\)/);
  assert.match(captureSource, /<CaptureFieldReview capture=\{capture\} editing=\{editing\} onEdit=\{setEditing\}/);
  assert.match(reviewSource, /editing === field/);
});

test("Cancelar cierra el editor sin invocar el PATCH", () => {
  assert.match(captureSource, /onCancel=\{\(\) => setEditing\(null\)\}/);
  assert.match(editorSource, /<button disabled=\{busy\} onClick=\{onCancel\} type="button"[^>]*>Cancelar<\/button>/);
});

test("Guardar conserva el flujo de corrección existente y el foco móvil", () => {
  assert.match(captureSource, /onSave=\{correct\}/);
  assert.match(captureSource, /method: "PATCH"/);
  assert.match(editorSource, /autoFocus/);
  assert.match(editorSource, /scrollIntoView\(\{ block: "nearest", behavior: "smooth" \}\)/);
});
