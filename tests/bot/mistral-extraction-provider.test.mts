import test from "node:test";
import assert from "node:assert/strict";
import { MISTRAL_OCR_MODEL, MISTRAL_TEXT_MODEL, MistralExtractionProvider, MistralExtractionResponseError, MistralExtractionTimeoutError, type MistralHttpClient } from "../../lib/bot/extraction/mistral-extraction-provider.ts";
import type { BusinessCardResolver } from "../../lib/bot/extraction/storage-business-card-resolver.ts";
import { SupplierExtractionService } from "../../lib/bot/extraction/service.ts";

const output = {
  companyName: "Shenzhen Lantern Co.", city: "Shenzhen", province: "Guangdong",
  contact: { name: "Li Wei", email: "li@example.cn", phone: "+86 138", wechat: "liwei88" },
  supplierType: "FACTORY", fob: { amount: 7, currency: "USD", unit: "unit", rawText: "FOB USD 7/unit" },
  moq: { quantity: 300, unit: "units", notes: null, rawText: "MOQ 300" },
  leadTime: { rawText: "25 days", days: 25 }, category: "Lighting", interestScore: 4,
  detectedFields: ["companyName", "city", "province", "contact", "supplierType", "fob", "moq", "leadTime", "category", "interestScore"],
  reviewFields: [], missingFields: [],
  evidence: [
    { field: "companyName", confidence: 0.99, evidence: "Shenzhen Lantern Co." }, { field: "city", confidence: 0.99, evidence: "Shenzhen" }, { field: "province", confidence: 0.99, evidence: "Guangdong" }, { field: "contact", confidence: 0.99, evidence: "Li Wei / li@example.cn / +86 138 / liwei88" },
    { field: "supplierType", confidence: 0.99, evidence: "factory" }, { field: "fob", confidence: 0.99, evidence: "FOB USD 7/unit" }, { field: "moq", confidence: 0.99, evidence: "MOQ 300" }, { field: "leadTime", confidence: 0.99, evidence: "25 days" }, { field: "category", confidence: 0.99, evidence: "Lighting" }, { field: "interestScore", confidence: 0.99, evidence: "interest 4" },
  ],
};

class MockMistralClient implements MistralHttpClient {
  readonly calls: Array<{ path: string; body: Record<string, unknown> }> = [];
  constructor(private readonly response: unknown = { choices: [{ message: { content: JSON.stringify(output) } }] }) {}
  async post(path: string, body: unknown): Promise<unknown> {
    assert.ok(body && typeof body === "object" && !Array.isArray(body));
    this.calls.push({ path, body: body as Record<string, unknown> });
    return this.response;
  }
}

const cardResolver: BusinessCardResolver = { async resolve() { return { bytes: new Uint8Array([0xff, 0xd8, 0xff]), mimeType: "image/jpeg" }; } };

test("Mistral Small 4 extrae texto explícito mediante structured output", async () => {
  const client = new MockMistralClient();
  const provider = new MistralExtractionProvider({ client, businessCards: cardResolver });
  const result = await provider.extract({ source: { type: "TEXT", text: "Factory. FOB USD 7, MOQ 300." } });
  assert.equal(client.calls[0].path, "/chat/completions");
  assert.equal(client.calls[0].body.model, MISTRAL_TEXT_MODEL);
  assert.equal(result.extractedFields.companyName, "Shenzhen Lantern Co.");
  assert.equal(result.extractedFields.fob?.amount, 7);
  assert.match(result.extractedFields.contact ?? "", /li@example\.cn/);
});

test("interestScore exige valoración numérica explícita en el texto fuente", async () => {
  const cases = [
    ["Proveedor de iluminación. Interesante.", null],
    ["Producto interesante.", null],
    ["Nos pareció interesante.", null],
    ["Está bueno.", null],
    ["Me llamó la atención.", null],
    ["Interés alto.", null],
    ["Interés medio.", null],
    ["Interés bajo.", null],
    ["Interés 4/10.", null],
    ["Interés 4,5 de 5.", null],
    ["Interés 5/5.", null],
    ["Interés 4 de 5.", 4],
    ["Interés 4/5.", 4],
    ["Interest 4 out of 5.", 4],
    ["Interés 4.", 4],
  ] as const;
  for (const [text, expected] of cases) {
    const provider = new MistralExtractionProvider({ client: new MockMistralClient(), businessCards: cardResolver });
    const result = await new SupplierExtractionService([provider]).extract({ source: { type: "TEXT", text } });
    assert.equal(result.extractedFields.interestScore, expected, text);
    assert.equal(result.missingFields.includes("interestScore"), expected === null, text);
  }
});

test("la evidencia de interestScore también se valida contra transcripts", async () => {
  const provider = new MistralExtractionProvider({ client: new MockMistralClient(), businessCards: cardResolver });
  const result = await new SupplierExtractionService([provider]).extract({ source: { type: "AUDIO_TRANSCRIPT", text: "Me llamó la atención." } });
  assert.equal(result.extractedFields.interestScore, null);
  assert.ok(result.missingFields.includes("interestScore"));
  assert.equal(result.evidence.some((item) => item.field === "interestScore"), false);
});

test("Mistral OCR 4.1 recibe una business card privada desde el resolver y limita sus campos", async () => {
  const client = new MockMistralClient({ document_annotation: JSON.stringify(output) });
  const provider = new MistralExtractionProvider({ client, businessCards: cardResolver });
  const result = await provider.extract({ source: { type: "IMAGE_BUSINESS_CARD", attachmentId: "card-1" } });
  assert.equal(client.calls[0].path, "/ocr");
  assert.equal(client.calls[0].body.model, MISTRAL_OCR_MODEL);
  const document = client.calls[0].body.document as { image_url: string };
  assert.match(document.image_url, /^data:image\/jpeg;base64,/);
  assert.equal(result.extractedFields.companyName, "Shenzhen Lantern Co.");
  assert.equal(result.extractedFields.fob, undefined, "OCR no completa términos comerciales");
  assert.equal(result.extractedFields.supplierType, undefined);
});

test("deduplica llamadas concurrentes para la misma fuente", async () => {
  let resolve!: (value: unknown) => void;
  const client: MistralHttpClient = { post: async () => new Promise((done) => { resolve = done; }) };
  const provider = new MistralExtractionProvider({ client, businessCards: cardResolver });
  const first = provider.extract({ source: { type: "TEXT", text: "same source" } });
  const second = provider.extract({ source: { type: "TEXT", text: "same source" } });
  resolve({ choices: [{ message: { content: JSON.stringify(output) } }] });
  assert.equal((await first).extractedFields.companyName, "Shenzhen Lantern Co.");
  assert.equal((await second).extractedFields.companyName, "Shenzhen Lantern Co.");
});

test("rechaza salida inválida y corta timeouts sin inventar datos", async () => {
  const invalid = new MistralExtractionProvider({ client: new MockMistralClient({ choices: [{ message: { content: "{}" } }] }), businessCards: cardResolver });
  await assert.rejects(() => invalid.extract({ source: { type: "TEXT", text: "x" } }), MistralExtractionResponseError);
  const slow: MistralHttpClient = { post: async () => new Promise(() => undefined) };
  const timeout = new MistralExtractionProvider({ client: slow, businessCards: cardResolver, timeoutMs: 5 });
  await assert.rejects(() => timeout.extract({ source: { type: "TEXT", text: "x" } }), MistralExtractionTimeoutError);
});
