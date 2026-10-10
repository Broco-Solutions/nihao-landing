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
  assert.equal(result.extractedFields.contact, "Li Wei");
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
    ["Interés 4/10.", 4],
    ["Interés 4,5 de 5.", null],
    ["Interés 5/5.", null],
    ["Interés 4 de 5.", null],
    ["Interés 4/5.", null],
    ["Interest 4 out of 5.", null],
    ["Interés 4.", 4],
  ] as const;
  for (const [text, expected] of cases) {
    const provider = new MistralExtractionProvider({ client: new MockMistralClient(), businessCards: cardResolver });
    const result = await new SupplierExtractionService([provider]).extract({ source: { type: "TEXT", text } });
    assert.equal(result.extractedFields.interestScore, expected, text);
    assert.equal(result.missingFields.includes("interestScore"), expected === null, text);
  }
});

test("acepta interés 10/10 explícito", async () => {
  const client = new MockMistralClient({ choices: [{ message: { content: JSON.stringify({ ...output, interestScore: 10, evidence: output.evidence.map((item) => item.field === "interestScore" ? { ...item, evidence: "Interés 10/10" } : item) }) } }] });
  const provider = new MistralExtractionProvider({ client, businessCards: cardResolver });
  const result = await new SupplierExtractionService([provider]).extract({ source: { type: "TEXT", text: "Interés 10/10." } });
  assert.equal(result.extractedFields.interestScore, 10);
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

test("tarjeta CIXI separa persona, email, teléfonos y fax", async () => {
  const markdown = `CIXI ZHONGDING IMPORT AND EXPORT CO.,LTD.
Pancho Weng | Business Manager
Add: Rm. No. 1025, Lianfa Road, Kandun, Cixi, Zhejiang, China.
Tel.: 86-574-63085327 Fax: 86-574-63289268
Mobile: 86-13805821203
E-mail: pancho.weng@travelines.cn`;
  const annotation = { ...output, companyName: "CIXI ZHONGDING IMPORT AND EXPORT CO.,LTD.", city: "Cixi", province: "Zhejiang", contact: { name: "Pancho Weng", email: "pancho.weng@travelines.cn", phone: "86-574-63085327", wechat: null } };
  const client = new MockMistralClient({ pages: [{ markdown }], document_annotation: JSON.stringify(annotation) });
  const result = await new SupplierExtractionService([new MistralExtractionProvider({ client, businessCards: cardResolver })]).extract({ source: { type: "IMAGE_BUSINESS_CARD", attachmentId: "cixi" } });
  assert.equal(result.extractedFields.contact, "Pancho Weng");
  assert.deepEqual(result.contactMethods, [
    { type: "EMAIL", rawText: "pancho.weng@travelines.cn" },
    { type: "PHONE", rawText: "86-574-63085327" },
    { type: "FAX", rawText: "86-574-63289268" },
    { type: "PHONE", rawText: "86-13805821203" },
  ]);
  assert.equal(result.website, null);
});

test("normaliza WWW en mayúsculas sin alterar una URL con esquema", async () => {
  const annotation = { ...output, evidence: output.evidence.filter((item) => item.field !== "province") };
  for (const [markdown, expected] of [
    ["ALFA TOOLS\nWWW.ALFATOOLS.TEST", "https://WWW.ALFATOOLS.TEST"],
    ["ALFA TOOLS\nhttps://already.example.test/path", "https://already.example.test/path"],
  ] as const) {
    const client = new MockMistralClient({ pages: [{ markdown }], document_annotation: JSON.stringify(annotation) });
    const result = await new MistralExtractionProvider({ client, businessCards: cardResolver }).extract({ source: { type: "IMAGE_BUSINESS_CARD", attachmentId: markdown } });
    assert.equal(result.website, expected);
  }
});

test("province de business card requiere texto explícito en el OCR bruto", async () => {
  const cases = [
    ["San Luis 2493 - CP 2000 Rosario - Argentina", "Rosario", "Santa Fe", null],
    ["Rosario, Santa Fe, Argentina", "Rosario", "Santa Fe", "Santa Fe"],
    ["Shenzhen, China", "Shenzhen", "Guangdong", null],
    ["Shenzhen, Guangdong, China", "Shenzhen", "Guangdong", "Guangdong"],
    ["Rosario - SANTA FE - Argentina", "Rosario", "Santa Fe", "Santa Fe"],
    ["Rosario – Sántá Fé – Argentina", "Rosario", "Santa Fe", "Santa Fe"],
  ] as const;
  for (const [markdown, city, province, expectedProvince] of cases) {
    const annotation = { ...output, city, province, evidence: output.evidence.map((item) => item.field === "province" ? { ...item, evidence: `Texto visible: ${province}` } : item) };
    const client = new MockMistralClient({ pages: [{ markdown }], document_annotation: JSON.stringify(annotation) });
    const provider = new MistralExtractionProvider({ client, businessCards: cardResolver });
    const result = await new SupplierExtractionService([provider]).extract({ source: { type: "IMAGE_BUSINESS_CARD", attachmentId: markdown } });
    assert.equal(result.extractedFields.city, city, markdown);
    assert.equal(result.extractedFields.province, expectedProvince, markdown);
    assert.equal(result.missingFields.includes("province"), expectedProvince === null, markdown);
    assert.equal(result.evidence.some((item) => item.field === "province"), expectedProvince !== null, markdown);
  }
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

test("commercial label typo is resolved in both extraction entry points with literal provenance", async () => {
  const empty = { ...output, detectedFields: [], reviewFields: ["fob"], evidence: [], fob: null };
  const provider = new MistralExtractionProvider({ client: new MockMistralClient({ choices: [{ message: { content: JSON.stringify(empty) } }] }), businessCards: cardResolver });
  for (const text of ["Fon 15", "fon: 15,50 USD"]) {
    const source = { type: "TEXT" as const, text };
    for (const candidate of [await provider.extract({ source }), await provider.extractReading(text, source)]) {
      assert.equal(candidate.extractedFields.fob?.amount, text.includes(",") ? 15.5 : 15);
      assert.equal(candidate.extractedFields.fob?.currency, text.includes("USD") ? "USD" : null);
      assert.equal(candidate.extractedFields.fob?.unit, null);
      assert.equal(candidate.extractedFields.fob?.rawText, text);
      assert.equal(candidate.rawSource.text, text);
      assert.deepEqual(candidate.evidence.filter(e => e.field === "fob").map(e => e.evidence), [text]);
      assert.ok(!candidate.reviewFields.includes("fob"));
    }
  }
  for (const text of ["Mi teléfono es Fon 15", "¿Fon 15?", "Fon 15 o 50", "Fon 15\nFon 20", "Fon 15\nFOB 20", "Fon 15.000", "Fon quince"]) {
    assert.equal((await provider.extractReading(text, { type: "TEXT", text })).extractedFields.fob, undefined, text);
  }
});
