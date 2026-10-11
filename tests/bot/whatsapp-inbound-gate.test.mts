import assert from "node:assert/strict";
import test from "node:test";
import { gateWhatsAppInbound } from "../../lib/channels/whatsapp/inbound-gate.ts";
import { whatsappAgentHelpReply, whatsappHelpReply } from "../../lib/channels/whatsapp/help-reply.ts";

function payload(message: Record<string, unknown>) {
  return { event: "MESSAGES_UPSERT", instance: "nihao", data: { key: { id: "incoming", remoteJid: "5493412345678@s.whatsapp.net", fromMe: false }, message } };
}

function setup(linked = true, helpReply = whatsappHelpReply) {
  const events: string[] = [];
  const sent: string[] = [];
  const work: Array<() => Promise<void>> = [];
  const dependencies = {
    identities: { async findByWhatsAppPhone(phone: string) {
      events.push("verify");
      assert.equal(phone, "5493412345678");
      return linked ? [{ userId: "traveler", tripId: "trip", trip: { status: "ACTIVE" as const } }] : [];
    } },
    helpReply,
    allowUnlinkedReply: false,
    async send(_phone: string, text: string) { events.push("send"); sent.push(text); },
    defer(callback: () => Promise<void>) { events.push("defer"); work.push(callback); },
  };
  return { dependencies, events, sent, work };
}

test("números sin viajero se mantienen en silencio por defecto para preservar la frontera de seguridad", async () => {
  for (const message of [{ conversation: "hola" }, { conversation: "ayuda" }, { conversation: "ping nihao" }, { conversation: "Proveedor ABC FOB 4" }, { imageMessage: {} }, { audioMessage: {} }, { contactMessage: {} }]) {
    const fixture = setup(false);
    const response = await gateWhatsAppInbound(payload(message), "nihao", fixture.dependencies);
    assert.equal(response?.status, 200);
    assert.deepEqual(fixture.events, ["verify"]);
    assert.deepEqual(fixture.sent, []);
  }
});

test("un remitente autorizado sin cuenta vinculada recibe instrucciones explícitas", async () => {
  const fixture = setup(false);
  fixture.dependencies.allowUnlinkedReply = true;
  const response = await gateWhatsAppInbound(payload({ conversation: "hola" }), "nihao", fixture.dependencies);
  assert.equal(response?.status, 200);
  await fixture.work[0]();
  assert.deepEqual(fixture.events, ["verify", "defer", "send"]);
  assert.match(fixture.sent[0], /todavía no está vinculado/i);
  assert.match(fixture.sent[0], /sin iniciar sesión/i);
});

test("un contacto desconocido puede recibir la bienvenida pública persistida sin entrar al procesador", async () => {
  const fixture = setup(false);
  const persisted: string[] = [];
  Object.assign(fixture.dependencies, {
    publicUnlinkedReply: () => "Bienvenida pública",
    async persistPublicAndReply(_message: unknown, text: string) { fixture.events.push("persist-public"); persisted.push(text); return true; },
  });
  const response = await gateWhatsAppInbound(payload({ conversation: "Quiero conocer Nihao" }), "nihao", fixture.dependencies);
  assert.equal(response?.status, 200);
  assert.deepEqual(fixture.events, ["verify", "persist-public"]);
  assert.deepEqual(persisted, ["Bienvenida pública"]);
  assert.equal(fixture.work.length, 0);
});

test("la respuesta directa autorizada se persiste antes del ACK y no depende del callback diferido", async () => {
  const fixture = setup(false);
  fixture.dependencies.allowUnlinkedReply = true;
  const persisted: string[] = [];
  Object.assign(fixture.dependencies, {
    async persistAndReply(_message: unknown, text: string, reason: string) {
      fixture.events.push("persist");
      persisted.push(`${reason}:${text}`);
    },
  });
  const response = await gateWhatsAppInbound(payload({ conversation: "Proveedor sin alta" }), "nihao", fixture.dependencies);
  assert.equal(response?.status, 200);
  assert.deepEqual(fixture.events, ["verify", "persist"]);
  assert.equal(fixture.work.length, 0);
  assert.match(persisted[0], /^UNLINKED_ALLOWED:Recibí tu mensaje/);
});

test("hola siempre presenta Nihao antes del enrutamiento y sin modificar selecciones pendientes", async () => {
  for (const helpReply of [whatsappHelpReply, whatsappAgentHelpReply]) {
    for (const text of ["hola", " HOLA! ", "¡Hola Nihao! 👋"]) {
      const fixture = setup(true, helpReply);
      assert.equal((await gateWhatsAppInbound(payload({ conversation: text }), "nihao", fixture.dependencies))?.status, 200);
      await fixture.work[0]();
      assert.deepEqual(fixture.events, ["verify", "defer", "send"]);
      assert.deepEqual(fixture.sent, [helpReply()]);
      assert.match(fixture.sent[0], /^Hola, soy Nihao/);
    }
  }
});

test("la primera apertura elegible prioriza la bienvenida personalizada y un mensaje comercial continúa", async () => {
  const greeting = setup();
  let activated = 0;
  Object.assign(greeting.dependencies, { async personalizedWelcome(identity: { userId: string; tripId: string }, message: unknown) { activated++; assert.deepEqual(identity, { userId: "traveler", tripId: "trip", phone: "5493412345678" }); assert.ok(message); return true; } });
  const response = await gateWhatsAppInbound(payload({ conversation: "hola" }), "nihao", greeting.dependencies);
  assert.equal(response?.status, 200);
  assert.equal(activated, 1);
  assert.equal(greeting.work.length, 0);
  assert.deepEqual(greeting.sent, []);

  const commercial = setup();
  Object.assign(commercial.dependencies, { async personalizedWelcome() { return true; } });
  assert.equal(await gateWhatsAppInbound(payload({ conversation: "Proveedor Alfa FOB 9" }), "nihao", commercial.dependencies), null);
});

test("viajero con varios viajes también recibe la presentación", async () => {
  const fixture = setup();
  fixture.dependencies.identities.findByWhatsAppPhone = async () => ["a", "b"].map((tripId) => ({ userId: "traveler", tripId, trip: { status: "ACTIVE" as const } }));
  assert.equal((await gateWhatsAppInbound(payload({ conversation: "hola" }), "nihao", fixture.dependencies))?.status, 200);
  await fixture.work[0]();
  assert.deepEqual(fixture.sent, [whatsappHelpReply()]);
});

test("datos de proveedor que incluyen hola continúan al procesador después de verificar", async () => {
  const fixture = setup();
  assert.equal(await gateWhatsAppInbound(payload({ conversation: "Hola, proveedor ABC FOB 4" }), "nihao", fixture.dependencies), null);
  assert.deepEqual(fixture.events, ["verify"]);
});

test("si falla verificar al viajero no se envía ninguna respuesta", async () => {
  const fixture = setup();
  fixture.dependencies.identities.findByWhatsAppPhone = async () => { throw new Error("database unavailable"); };
  await assert.rejects(gateWhatsAppInbound(payload({ conversation: "hola" }), "nihao", fixture.dependencies), /database unavailable/);
  assert.deepEqual(fixture.work, []);
  assert.deepEqual(fixture.sent, []);
});
