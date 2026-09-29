import assert from "node:assert/strict";
import test from "node:test";
import { MistralBatchAnalyzer } from "../../lib/channels/whatsapp/batch-association.ts";

function analyzer(response: unknown) {
  return new MistralBatchAnalyzer({ async post() { return { choices: [{ message: { content: JSON.stringify(response) } }] }; } });
}

test("un audio con dos proveedores se divide en fragmentos verificables", async () => {
  const transcript = "Alfa Tools ofrece MOQ 500. Beta Textiles tiene FOB 4 dólares.";
  const result = await analyzer({ segments: ["Alfa Tools ofrece MOQ 500.", "Beta Textiles tiene FOB 4 dólares."] }).segmentAudio(transcript);
  assert.deepEqual(result, { segments: ["Alfa Tools ofrece MOQ 500.", "Beta Textiles tiene FOB 4 dólares."], confident: true });
});

test("acepta fragmentos de Mistral con texto y proveedor sin confiar en la etiqueta", async () => {
  const transcript = "Alfa Tools ofrece MOQ 500. Beta Textiles tiene FOB 4 dólares.";
  const result = await analyzer({ segments: [
    { provider: "Alfa Tools", text: "Alfa Tools ofrece MOQ 500." },
    { provider: "Beta Textiles", text: "Beta Textiles tiene FOB 4 dólares." },
  ] }).segmentAudio(transcript);
  assert.deepEqual(result, { segments: ["Alfa Tools ofrece MOQ 500.", "Beta Textiles tiene FOB 4 dólares."], confident: true });
});

test("una segmentación que inventa o pierde texto pide aclaración", async () => {
  const transcript = "Alfa Tools ofrece MOQ 500. Beta Textiles tiene FOB 4 dólares.";
  const result = await analyzer({ segments: ["Alfa Tools ofrece MOQ 500."] }).segmentAudio(transcript);
  assert.deepEqual(result, { segments: [transcript], confident: false });
});

test("varios fragmentos de audio se agrupan por proveedor y no duplican IDs", async () => {
  const evidence = [
    { id: "audio-1-a", type: "AUDIO" as const, text: "Alfa Tools ofrece MOQ 500", ocrText: null },
    { id: "audio-1-b", type: "AUDIO" as const, text: "Beta Textiles tiene FOB 4 dólares", ocrText: null },
    { id: "audio-2-a", type: "AUDIO" as const, text: "Alfa Tools entrega en 20 días", ocrText: null },
  ];
  const result = await analyzer({ groups: [
    { name: "Alfa Tools", messageIds: ["audio-1-a", "audio-2-a"] },
    { name: "Beta Textiles", messageIds: ["audio-1-b"] },
  ], suggestions: [], imageKinds: {} }).analyze(evidence);
  assert.deepEqual(result.groups, [
    { name: "Alfa Tools", messageIds: ["audio-1-a", "audio-2-a"] },
    { name: "Beta Textiles", messageIds: ["audio-1-b"] },
  ]);
  assert.equal(result.suggestions.length, 0);
});
