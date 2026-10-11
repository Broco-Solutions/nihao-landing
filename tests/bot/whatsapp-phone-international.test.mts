import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { formatWhatsAppPhone, inspectWhatsAppPhone, normalizeWhatsAppPhone, whatsappInboundLookupCandidates, whatsappPhoneLookupCandidates, whatsappPhonesEquivalent } from "../../lib/bot/whatsapp-phone.ts";
import { ValidationError } from "../../lib/bot/validation.ts";

test("normaliza números internacionales válidos de distintas regiones", () => {
  const cases = [
    ["+54 9 341 667 4074", "5493416674074", "AR"],
    ["+598 99 123 456", "59899123456", "UY"],
    ["+55 11 91234-5678", "5511912345678", "BR"],
    ["+86 138 0013 8000", "8613800138000", "CN"],
    ["+34 612 345 678", "34612345678", "ES"],
    ["+1 415 555 0123", "14155550123", "US"],
    ["+39 02 1234 5678", "390212345678", "IT"],
  ] as const;

  for (const [input, storage, country] of cases) {
    assert.equal(normalizeWhatsAppPhone(input), storage);
    assert.equal(inspectWhatsAppPhone(input)?.country, country);
    assert.match(formatWhatsAppPhone(storage), /^\+/u);
  }
});

test("interpreta formatos nacionales sólo con el país explícito", () => {
  assert.equal(normalizeWhatsAppPhone("0341 15 667 4074", "AR"), "5493416674074");
  assert.equal(normalizeWhatsAppPhone("099 123 456", "UY"), "59899123456");
  assert.equal(normalizeWhatsAppPhone("(11) 91234-5678", "BR"), "5511912345678");
  assert.equal(normalizeWhatsAppPhone("138 0013 8000", "CN"), "8613800138000");
  assert.equal(normalizeWhatsAppPhone("612 345 678", "ES"), "34612345678");
  assert.equal(normalizeWhatsAppPhone("415 555 0123", "US"), "14155550123");
  assert.throws(() => normalizeWhatsAppPhone("3416674074"), ValidationError);
});

test("conserva equivalencia argentina histórica sin ampliar coincidencias de otros países", () => {
  assert.equal(normalizeWhatsAppPhone("5493416674074"), "5493416674074");
  assert.equal(normalizeWhatsAppPhone("+54 0 341 15 667 4074"), "5493416674074");
  assert.ok(whatsappPhonesEquivalent("+54 9 341 667 4074", "+54 341 667-4074"));
  assert.deepEqual(whatsappPhoneLookupCandidates("+598 99 123 456"), ["59899123456"]);
  assert.ok(!whatsappPhonesEquivalent("+598 99 123 456", "+54 9 341 667 4074"));
});

test("rechaza longitudes, caracteres y estructuras inválidas usando metadatos internacionales", () => {
  for (const input of ["", "123", "+54 abc", "+598 1", "+86 999", "+1 000 000 0000"]) {
    assert.throws(() => normalizeWhatsAppPhone(input), ValidationError);
  }
});

test("la ingesta conserva sólo la coincidencia exacta de un identificador histórico inválido", () => {
  assert.throws(() => whatsappPhoneLookupCandidates("5490000000000"), ValidationError);
  assert.deepEqual(whatsappInboundLookupCandidates("5490000000000"), ["5490000000000"]);
  assert.deepEqual(whatsappInboundLookupCandidates("+54 abc"), []);
});

test("los formularios de WhatsApp reutilizan el selector internacional", async () => {
  const invitation = await readFile(new URL("../../components/app/NewTravelerInvitation.tsx", import.meta.url), "utf8");
  const travelers = await readFile(new URL("../../components/app/TravelersClient.tsx", import.meta.url), "utf8");
  const component = await readFile(new URL("../../components/app/InternationalPhoneInput.tsx", import.meta.url), "utf8");
  assert.match(invitation, /InternationalPhoneInput/);
  assert.match(travelers, /InternationalPhoneInput/);
  assert.match(component, /AppSelect/);
  assert.match(component, /País, código ISO o prefijo/);
  assert.match(component, /inputMode="tel"/);
  assert.match(component, /setCustomValidity/);
});
