import test from "node:test";
import assert from "node:assert/strict";
import { handleBurstWebhook } from "../../lib/channels/whatsapp/burst-webhook.ts";
import { validateBurstPlan, MistralBurstInterpreter } from "../../lib/channels/whatsapp/burst-interpreter.ts";
import { orderedBurstMessages, type BurstCatalog, type BurstMessage, type BurstSnapshot, type BurstReading } from "../../lib/channels/whatsapp/burst-types.ts";
import { BurstReader } from "../../lib/channels/whatsapp/burst-reader.ts";

const catalog: BurstCatalog = { trips: [{ id: "trip", name: "China", companies: [{ id: "broco", name: "Broco Solutions" }, { id: "kendal", name: "Kendal Salud" }] }] };
function message(id: string, type: "IMAGE" | "AUDIO" | "TEXT", text: string, sequence: number): BurstMessage {
  return { id, sequence, sentAt: new Date(1_000 * sequence), envelope: { instance: "nihao", messageId: id, phone: "5491112345678", type, text: type === "TEXT" ? text : null, media: null, sentAt: null }, reading: { segments: [{ id: `${id}:1`, text }], complete: true } };
}
function snapshot(messages = [message("p1", "IMAGE", "Alfa Tools", 1), message("a1", "AUDIO", "Esta fábrica de la foto anterior tiene MOQ 500", 2), message("p2", "IMAGE", "Beta Medical", 3), message("a2", "AUDIO", "La tarjeta anterior corresponde a material médico", 4)]): BurstSnapshot {
  return { id: "burst", instance: "nihao", phone: "5491112345678", userId: "user", revision: messages.length, status: "PROCESSING", leaseId: "lease", state: { tripId: null, groups: [], controlIds: [], question: null, pendingRefs: [] }, messages };
}
function proposal() { return { tripId: "trip", groups: [{ id: "g1", name: "Alfa Tools", refs: ["p1:1", "a1:1"], companyId: null, certain: true, reason: "El audio se refiere a la fábrica de la foto anterior" }, { id: "g2", name: "Beta Medical", refs: ["p2:1", "a2:1"], companyId: null, certain: true, reason: "El audio identifica la tarjeta anterior y su rubro" }], controlIds: [], pendingRefs: [] }; }
const payload = (id = "m1", text = "listo") => ({ event: "MESSAGES_UPSERT", instance: "nihao", data: { key: { id, remoteJid: "5491112345678@s.whatsapp.net", fromMe: false }, messageTimestamp: 1790944800, message: { conversation: text } } });

test("ráfaga de audio acepta OGG/Opus de Evolution con parámetros MIME y conserva la transcripción", async () => {
  for (const mimeType of ["audio/ogg", "audio/ogg; codecs=opus", " AUDIO/OGG ; codecs=opus"]) {
    const objects = new Map<string, Uint8Array>();
    let downloads = 0; let transcriptions = 0;
    const m = message("opus-audio", "AUDIO", "", 1);
    m.reading = null;
    m.envelope.media = { key: { id: m.id, remoteJid: "5491112345678@s.whatsapp.net", fromMe: false }, message: { audioMessage: { mimetype: mimeType } } };
    const transcript = "El proveedor Alfa Tools tiene MOQ de 500 unidades.";
    const reader = new BurstReader({
      client: { async getMedia() { downloads++; return { bytes: new Uint8Array(Buffer.from("OggS audio fixture")), mimeType }; } },
      storage: { async put(input: { key: string; body: Uint8Array; contentType: string }) { assert.equal(input.contentType, "audio/ogg"); objects.set(input.key, input.body); }, async get(key: string) { return new Response(Uint8Array.from(objects.get(key) ?? [])).body; } } as never,
      transcription: { async transcribe(input) { transcriptions++; assert.equal(input.mimeType, "audio/ogg"); assert.equal(input.filename, "opus-audio.ogg"); return { text: transcript, model: "test" }; } },
      analyzer: { async readImage() { throw new Error("unused"); }, async segmentAudio(text) { assert.equal(text, transcript); return { confident: true, segments: [text] }; } },
      extraction: { async extractReading(text, source) { return { extractedFields: {}, reviewFields: [], evidence: [], rawSource: source, text } as never; } },
      mistral: { async post() { throw new Error("unused"); } },
    });
    const reading = await reader.read(m, async (reading) => { m.reading = structuredClone(reading); });
    assert.equal(reading.complete, true);
    assert.equal(reading.transcript, transcript);
    assert.equal(reading.segments[0].text, transcript);
    await reader.read(m, async () => { assert.fail("La lectura completada no debe repetirse"); });
    assert.equal(downloads, 1);
    assert.equal(transcriptions, 1);
  }
});

test("ráfaga: agrupa dos fotos con sus audios anónimos y pregunta empresa una sola vez", () => {
  const plan = validateBurstPlan(proposal(), snapshot(), catalog);
  assert.equal(plan.groups.length, 2);
  assert.deepEqual(plan.groups[0].refs, ["p1:1", "a1:1"]);
  assert.match(plan.question!, /mensaje 1 \(foto\).*mensaje 2 \(audio\)/);
  assert.equal(plan.question!.match(/¿Para qué empresa/g)?.length, 1);
});

test("aclaración libre usa la pregunta y las cuatro referencias antes de cualquier clasificación general", async () => {
  const batch = snapshot();
  batch.state = validateBurstPlan(proposal(), batch, catalog);
  batch.messages.push(message("answer", "TEXT", "las primeras dos por kendal y las ultimas dos por broco", 5));
  batch.revision++;
  const interpreter = new MistralBurstInterpreter({ async post(_path, body) {
    const input = body as { messages: Array<{ content: string }> };
    const context = JSON.parse(input.messages[1].content);
    assert.match(context.previous.question, /¿Para qué empresa/);
    assert.equal(context.evidence.length, 5);
    assert.match(input.messages[0].content, /primero interpretá|Primero interpretá/);
    return { choices: [{ message: { content: JSON.stringify({ ...proposal(), groups: batch.state.groups.map((g, i) => ({ ...g, companyId: i === 0 ? "kendal" : "broco" })), controlIds: ["answer"] }) } }] };
  } });
  const plan = await interpreter.interpret(batch, catalog);
  assert.deepEqual(plan.groups.map((g) => g.companyId), ["kendal", "broco"]);
  assert.equal(plan.question, null);
  assert.deepEqual(plan.groups.map((g) => g.id), batch.state.groups.map((g) => g.id));
});

test("no autoriza empresas/viajes inexistentes ni usa una empresa múltiple sin evidencia", () => {
  const raw = proposal(); raw.groups[0].companyId = "broco" as never;
  assert.equal(validateBurstPlan(raw, snapshot(), catalog).groups[0].companyId, null);
  raw.groups[0].companyId = "foreign" as never;
  assert.throws(() => validateBurstPlan(raw, snapshot(), catalog), /no autorizada/);
  assert.throws(() => validateBurstPlan({ ...proposal(), tripId: "foreign" }, snapshot(), { trips: [...catalog.trips, { id: "another", name: "Otro viaje", companies: [] }] }), /Viaje/);
});

test("rechaza fragmentos duplicados y conserva las evidencias omitidas como pendientes", () => {
  const raw = proposal(); raw.groups[1].refs.push("a1:1");
  assert.throws(() => validateBurstPlan(raw, snapshot(), catalog), /duplicadas/);
  raw.groups = [proposal().groups[0]];
  assert.deepEqual(validateBurstPlan(raw, snapshot(), catalog).pendingRefs, ["p2:1", "a2:1"]);
});

test("dos cargas del mismo proveedor conservan IDs distintos, sin deduplicar por nombre", () => {
  const batch = snapshot([message("p1", "IMAGE", "Alfa Tools", 1), message("p2", "IMAGE", "Alfa Tools", 2)]);
  const groups = ["p1", "p2"].map((id) => ({ name: "Alfa Tools", refs: [`${id}:1`], companyId: null, certain: true, reason: "Dos cargas distintas indicadas por el usuario" }));
  const plan = validateBurstPlan({ groups, controlIds: [], pendingRefs: [] }, batch, catalog);
  assert.notEqual(plan.groups[0].id, plan.groups[1].id);
});

test("orden original usa timestamp y las etiquetas ya preguntadas sobreviven a entregas tardías", () => {
  const batch = snapshot(); batch.messages.reverse();
  assert.deepEqual(orderedBurstMessages(batch).map((m) => m.id), ["p1", "a1", "p2", "a2"]);
  batch.state.order = ["p1", "a1", "p2", "a2"];
  batch.messages.push(message("late", "TEXT", "respuesta", 0));
  assert.equal(orderedBurstMessages(batch).at(-1)?.id, "late");
});

test("webhook confirma recepción sólo tras persistir, falla con 503 y listo evita espera", async () => {
  let persisted = false; let deferred: (() => Promise<void>) | undefined; let waited = 0;
  const response = await handleBurstWebhook(payload(), "nihao", () => ({ async receive(envelope) { assert.equal(envelope.sentAt, new Date(1790944800 * 1000).toISOString()); await Promise.resolve(); persisted = true; return true; }, async processDue() { assert.equal(persisted, true); } }), (work) => { assert.equal(persisted, true); deferred = work; }, async (ms) => { waited = ms; });
  assert.equal(response?.status, 200); await deferred!(); assert.equal(waited, 0);
  const failed = await handleBurstWebhook(payload(), "nihao", () => ({ async receive() { throw new Error("db unavailable"); }, async processDue() {} }), () => { assert.fail("No diferir recepción fallida"); });
  assert.equal(failed?.status, 503);
});

test("foto sin OCR se lee visualmente, mantiene evidencia vacía y el reinicio no repite lecturas", async () => {
  const objects = new Map<string, Uint8Array>(); let downloads = 0; let ocr = 0; let vision = 0;
  const m = message("photo", "IMAGE", "", 1); m.reading = null;
  m.envelope.media = { key: { id: "photo", remoteJid: "5491112345678@s.whatsapp.net", fromMe: false }, message: { imageMessage: {} } };
  const reader = new BurstReader({
    storage: { async put(input) { objects.set(input.key, input.body as Uint8Array); }, async get(key) { return new Response(Uint8Array.from(objects.get(key)!)).body; }, async delete() {}, async signedUrl() { return "private"; } },
    client: { async getMedia() { downloads++; return { bytes: new Uint8Array([0xff, 0xd8, 0xff]), mimeType: "image/jpeg" }; } },
    analyzer: { async readImage() { ocr++; return ""; }, async segmentAudio(text) { return { segments: [text], confident: true }; } },
    transcription: { async transcribe() { throw new Error("not audio"); } },
    extraction: { async extractReading() { assert.fail("No inventar campos desde descripción visual"); } },
    mistral: { async post() { vision++; return { choices: [{ message: { content: JSON.stringify({ visual: "Bandeja azul con herramientas", kind: "PRODUCT_IMAGE" }) } }] }; } },
  });
  m.reading = await reader.read(m, async (reading) => { m.reading = structuredClone(reading); });
  await reader.read(m, async () => assert.fail("Ya completa"));
  assert.deepEqual([downloads, ocr, vision], [1, 1, 1]);
  assert.equal(m.reading.segments.length, 1);
  assert.equal(m.reading.segments[0].text, "");
  assert.equal(m.reading.imageKind, "PRODUCT_IMAGE");
  assert.equal(m.reading.productImageVerified, true);
});

test("fallo de transcripción retiene el original durable y lo reutiliza al reintentar", async () => {
  let downloads = 0; let transcriptions = 0; let stored: Uint8Array | undefined;
  const m = message("audio", "AUDIO", "", 1); m.reading = null;
  m.envelope.media = { key: { id: "audio", remoteJid: "5491112345678@s.whatsapp.net", fromMe: false }, message: { audioMessage: {} } };
  const reader = new BurstReader({ storage: { async put(input) { stored = input.body as Uint8Array; }, async get() { return new Response(Uint8Array.from(stored!)).body; }, async delete() {}, async signedUrl() { return "private"; } }, client: { async getMedia() { downloads++; return { bytes: new TextEncoder().encode("OggS-test"), mimeType: "audio/ogg" }; } }, analyzer: { async readImage() { return ""; }, async segmentAudio(text) { return { segments: [text], confident: true }; } }, transcription: { async transcribe() { if (++transcriptions === 1) throw new Error("temporary"); return { text: "MOQ 100", model: "voxtral" }; } }, extraction: { async extractReading(text, source) { return { extractedFields: {}, evidence: [], reviewFields: [], rawSource: { ...source, text } }; } }, mistral: { async post() { throw new Error("not image"); } } });
  const save = async (reading: BurstReading) => { m.reading = structuredClone(reading); };
  await assert.rejects(reader.read(m, save), /temporary/);
  assert.ok((m.reading as BurstReading | null)?.storageKey);
  await reader.read(m, save);
  assert.equal(downloads, 1);
  assert.equal(transcriptions, 2);
});

test("anverso y reverso son una carga; una foto sin texto puede complementar audio sin nombre inventado", () => {
  const batch = snapshot([message("front", "IMAGE", "Alfa Tools", 1), message("back", "IMAGE", "ventas@alfa.test", 2), message("product", "IMAGE", "", 3), message("description", "AUDIO", "Estos son instrumentos médicos de la foto", 4)]);
  const plan = validateBurstPlan({ groups: [{ name: "Alfa Tools", refs: ["front:1", "back:1"], companyId: null, certain: true, reason: "Anverso/reverso de la misma tarjeta con identidad compartida" }, { name: null, refs: ["product:1", "description:1"], companyId: null, certain: true, reason: "El audio describe los instrumentos visibles en la foto" }], controlIds: [], pendingRefs: [] }, batch, { trips: [{ ...catalog.trips[0], companies: [catalog.trips[0].companies[0]] }] });
  assert.equal(plan.groups.length, 2);
  assert.equal(plan.groups[1].name, null);
  assert.equal(plan.question, null, "Los campos faltantes se completan en web");
  assert.ok(plan.groups.every((g) => g.companyId === "broco"));
});

test("no modifica cargas materializadas y sólo pregunta por las evidencias pendientes", () => {
  const batch = snapshot();
  const first = validateBurstPlan(proposal(), batch, catalog);
  first.groups[0].captureId = "capture-alfa";
  first.groups[0].companyId = "kendal";
  batch.state = first;
  const raw = proposal();
  const preserved = { ...first.groups[0] };
  const plan = validateBurstPlan({ ...raw, groups: [preserved], pendingRefs: ["p2:1", "a2:1"] }, batch, catalog);
  assert.equal(plan.groups[0].captureId, "capture-alfa");
  assert.match(plan.question!, /mensaje 3/);
  assert.doesNotMatch(plan.question!, /mensaje 1/);
  assert.throws(() => validateBurstPlan({ ...raw, groups: [{ ...preserved, companyId: "broco" }, raw.groups[1]] }, batch, catalog), /reinterpretar/);
});

test("una respuesta numérica ambigua no asigna arbitrariamente empresa a varios grupos", () => {
  const batch = snapshot(); batch.state = validateBurstPlan(proposal(), batch, catalog);
  batch.messages.push(message("answer", "TEXT", "1", 5)); batch.revision++;
  const raw = proposal();
  const plan = validateBurstPlan({ ...raw, groups: batch.state.groups.map((g) => ({ ...g, companyId: "broco" })), controlIds: ["answer"] }, batch, catalog);
  assert.ok(plan.groups.every((g) => g.companyId === null));
  assert.match(plan.question!, /¿Para qué empresa/);
});

test("ayuda y búsquedas conservan respuesta de producto sin crear capturas", () => {
  const batch = snapshot([message("help", "TEXT", "¿Cómo funciona el bot?", 1)]);
  const plan = validateBurstPlan({ intent: "GUIDANCE", groups: [], controlIds: ["help"], pendingRefs: [] }, batch, catalog);
  assert.equal(plan.groups.length, 0);
  assert.equal(plan.question, null);
  assert.match(plan.notice!, /Crear borradores para revisar en la web/);
  const lookup = validateBurstPlan({ intent: "LOOKUP", groups: [], controlIds: ["help"], pendingRefs: [] }, batch, catalog);
  assert.match(lookup.notice!, /consultas.*web/);
});

test("referencias de mensajes citados llegan al intérprete como contexto", async () => {
  let quoted: string | null | undefined;
  await handleBurstWebhook({ event: "MESSAGES_UPSERT", instance: "nihao", data: { key: { id: "reply", remoteJid: "5491112345678@s.whatsapp.net", fromMe: false }, message: { extendedTextMessage: { text: "esta va por Kendal", contextInfo: { stanzaId: "photo-original" } } } } }, "nihao", () => ({ async receive(envelope) { quoted = envelope.quotedMessageId; return true; }, async processDue() {} }), () => {});
  assert.equal(quoted, "photo-original");
});
