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
    async send(_phone: string, text: string) { events.push("send"); sent.push(text); },
    defer(callback: () => Promise<void>) { events.push("defer"); work.push(callback); },
  };
  return { dependencies, events, sent, work };
}

test("números sin viajero se ignoran antes de procesar cualquier mensaje, incluso ping", async () => {
  for (const message of [{ conversation: "hola" }, { conversation: "ayuda" }, { conversation: "ping nihao" }, { conversation: "Proveedor ABC FOB 4" }, { imageMessage: {} }, { audioMessage: {} }, { contactMessage: {} }]) {
    const fixture = setup(false);
    const response = await gateWhatsAppInbound(payload(message), "nihao", fixture.dependencies);
    assert.equal(response?.status, 200);
    assert.deepEqual(fixture.events, ["verify"]);
    assert.deepEqual(fixture.sent, []);
  }
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
