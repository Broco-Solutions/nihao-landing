import assert from "node:assert/strict";
import test from "node:test";
import { createEvolutionClient } from "../../lib/channels/evolution/client.ts";
import { handleWhatsAppWebhookRequest, parseEvolutionWebhook, processWhatsAppWebhook } from "../../lib/channels/evolution/webhook.ts";

function messagePayload(overrides: Record<string, unknown> = {}) {
  return {
    event: "MESSAGES_UPSERT",
    instance: "nihao",
    data: { key: { id: "msg-1", remoteJid: "5491112345678@s.whatsapp.net", fromMe: false }, pushName: "Ada", message: { conversation: "hello" } },
    ...overrides,
  };
}

test("parsea MESSAGES_UPSERT de texto simple", () => {
  const event = parseEvolutionWebhook(messagePayload(), "nihao");
  assert.deepEqual(event, { kind: "message", instance: "nihao", message: { id: "msg-1", remoteJid: "5491112345678@s.whatsapp.net", phone: "5491112345678", pushName: "Ada", type: "TEXT", text: "hello", media: null } });
});

test("parsea extendedTextMessage", () => {
  const event = parseEvolutionWebhook(messagePayload({ data: { key: { id: "msg-2", remoteJid: "5491112345678@s.whatsapp.net", fromMe: false }, message: { extendedTextMessage: { text: "ping nihao" } } } }), "nihao");
  assert.equal(event.kind, "message");
  if (event.kind === "message") assert.equal(event.message.text, "ping nihao");
});

test("conserva el WebMessageInfo mínimo para IMAGE y AUDIO", () => {
  for (const [kind, key, mime] of [["IMAGE", "imageMessage", "image/jpeg"], ["AUDIO", "audioMessage", "audio/ogg; codecs=opus"]] as const) {
    const event = parseEvolutionWebhook(messagePayload({ data: { key: { id: `msg-${kind}`, remoteJid: "5491112345678@s.whatsapp.net", fromMe: false }, message: { [key]: { mimetype: mime, mediaKey: "key", directPath: "/media" } } } }), "nihao");
    assert.equal(event.kind, "message");
    if (event.kind === "message") {
      assert.equal(event.message.type, kind);
      assert.deepEqual(event.message.media, { key: { id: `msg-${kind}`, remoteJid: "5491112345678@s.whatsapp.net", fromMe: false }, message: { [key]: { mimetype: mime, mediaKey: "key", directPath: "/media" } } });
    }
  }
});

test("ignora fromMe, grupos y otra instancia", () => {
  assert.deepEqual(parseEvolutionWebhook(messagePayload({ data: { key: { id: "self", remoteJid: "5491112345678@s.whatsapp.net", fromMe: true }, message: { conversation: "ping nihao" } } }), "nihao"), { kind: "ignored", reason: "from-me" });
  assert.deepEqual(parseEvolutionWebhook(messagePayload({ data: { key: { id: "group", remoteJid: "120363@g.us", fromMe: false }, message: { conversation: "ping nihao" } } }), "nihao"), { kind: "ignored", reason: "group" });
  assert.deepEqual(parseEvolutionWebhook(messagePayload({ instance: "other" }), "nihao"), { kind: "ignored", reason: "wrong-instance" });
});

test("un evento desconocido devuelve 200 sin crear el cliente", async () => {
  assert.deepEqual(parseEvolutionWebhook({ event: "PRESENCE_UPDATE", instance: "nihao" }, "nihao"), { kind: "ignored", reason: "unknown-event" });
  const response = await handleWhatsAppWebhookRequest(new Request("https://nihao.example.test/webhook", { method: "POST", body: JSON.stringify({ event: "PRESENCE_UPDATE", instance: "nihao" }) }), "nihao", () => { throw new Error("el cliente no debe crearse"); });
  assert.equal(response.status, 200);
});

test("sendText construye URL, header y body de Evolution", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = createEvolutionClient({ apiUrl: "https://evolution.example.test/", apiKey: "secret", instance: "nihao", fetch: async (url, init) => { calls.push({ url: String(url), init }); return new Response(null, { status: 201 }); } });
  await client.sendText({ number: "5491112345678", text: "hola" });
  assert.equal(calls[0].url, "https://evolution.example.test/message/sendText/nihao");
  assert.deepEqual(calls[0].init?.headers, { apikey: "secret", "content-type": "application/json" });
  assert.equal(calls[0].init?.body, JSON.stringify({ number: "5491112345678", text: "hola" }));
});

test("getMedia usa el contrato de Evolution v2.3.7", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = createEvolutionClient({ apiUrl: "https://evolution.example.test/", apiKey: "secret", instance: "nihao", fetch: async (url, init) => { calls.push({ url: String(url), init }); return Response.json({ base64: Buffer.from("OggS").toString("base64"), mimetype: "audio/ogg; codecs=opus" }); } });
  const message = { key: { id: "m1", remoteJid: "5491112345678@s.whatsapp.net", fromMe: false }, message: { audioMessage: { mimetype: "audio/ogg; codecs=opus" } } };
  const media = await client.getMedia({ message });
  assert.equal(calls[0].url, "https://evolution.example.test/chat/getBase64FromMediaMessage/nihao");
  assert.deepEqual(calls[0].init?.headers, { apikey: "secret", "content-type": "application/json" });
  assert.equal(calls[0].init?.body, JSON.stringify({ message, convertToMp4: false }));
  assert.deepEqual([...media.bytes], [...Buffer.from("OggS")]);
  assert.equal(media.mimeType, "audio/ogg; codecs=opus");
});

test("sólo responde al comando smoke exacto", async () => {
  const calls: Array<{ number: string; text: string }> = [];
  const client = { async sendText(input: { number: string; text: string }) { calls.push(input); }, async getMedia() { throw new Error("not used"); } };
  assert.deepEqual(await processWhatsAppWebhook(messagePayload(), "nihao", () => client), { action: "ignored", reason: "not-a-command" });
  assert.deepEqual(await processWhatsAppWebhook(messagePayload({ data: { key: { id: "ping", remoteJid: "5491112345678@s.whatsapp.net", fromMe: false }, message: { conversation: "ping nihao" } } }), "nihao", () => client), { action: "replied" });
  assert.deepEqual(calls, [{ number: "5491112345678", text: "Nihao WhatsApp OK ✅" }]);
});

test("texto normal usa la capa de captura y responde sin llamar servicios externos reales", async () => {
  const calls: Array<{ number: string; text: string }> = [];
  const client = { async sendText(input: { number: string; text: string }) { calls.push(input); }, async getMedia() { throw new Error("not used"); } };
  const service = { async capture() { return { kind: "captured" as const, text: "Guardé la captura ✅" }; } };
  assert.deepEqual(await processWhatsAppWebhook(messagePayload(), "nihao", () => client, () => service as never), { action: "replied" });
  assert.deepEqual(calls, [{ number: "5491112345678", text: "Guardé la captura ✅" }]);
});
