import test from "node:test";
import assert from "node:assert/strict";
import { DevelopmentTextExtractionAdapter } from "../../lib/bot/extraction/development-text-adapter.ts";
import { SupplierExtractionService } from "../../lib/bot/extraction/service.ts";
import type { ExtractionInput, ExtractionProvider } from "../../lib/bot/extraction/contract.ts";
import { SUPPLIER_EXTRACTION_JSON_SCHEMA } from "../../lib/bot/extraction/schema.ts";
import { mergeExtractionCandidates } from "../../lib/bot/extraction/merge.ts";
import type { ExtractionCandidate, RawSource } from "../../lib/bot/types.ts";

class MockExtractionProvider implements ExtractionProvider {
  readonly name = "mock-extraction";
  constructor(private readonly results: Record<RawSource["type"], ExtractionCandidate>) {}

  supports(source: RawSource): boolean {
    return source.type in this.results;
  }

  async extract({ source }: ExtractionInput): Promise<ExtractionCandidate> {
    return this.results[source.type];
  }
}

test("extrae el ejemplo Tier 1 y deja visibles los campos ausentes", async () => {
  const service = new SupplierExtractionService([new DevelopmentTextExtractionAdapter()]);
  const result = await service.extract({
    source: {
      type: "TEXT",
      text: "Esta fábrica se llama ABC Lighting, FOB 7 dólares por unidad, mínimo 300 y tarda cuatro semanas.",
    },
  });

  assert.equal(result.extractedFields.companyName, "ABC Lighting");
  assert.equal(result.extractedFields.supplierType, "FACTORY");
  assert.equal(result.extractedFields.fob?.amount, 7);
  assert.equal(result.extractedFields.fob?.currency, "USD");
  assert.equal(result.extractedFields.fob?.unit, "unidad");
  assert.equal(result.extractedFields.moq?.quantity, 300);
  assert.equal(result.extractedFields.leadTime?.days, 28);
  assert.ok(result.missingFields.includes("category"));
  assert.ok(result.missingFields.includes("interestScore"));
  assert.equal(result.reviewFields.length, 0);
});

test("mergea fuentes iguales y deja contradicciones para revisión", async () => {
  const text: ExtractionCandidate = {
    rawSource: { type: "TEXT", text: "Acme FOB 7" },
    extractedFields: { companyName: "Acme", city: "Shenzhen", fob: { amount: 7, currency: "USD", unit: "unidad", rawText: "FOB 7" } },
    reviewFields: [], evidence: [],
  };
  const card: ExtractionCandidate = {
    rawSource: { type: "IMAGE_BUSINESS_CARD", attachmentId: "attachment-card" },
    extractedFields: { companyName: "ACME", city: "Shenzhen", fob: { amount: 8, currency: "USD", unit: "unidad", rawText: "FOB USD 8" } },
    reviewFields: [], evidence: [],
  };
  const service = new SupplierExtractionService([new MockExtractionProvider({ TEXT: text, IMAGE_BUSINESS_CARD: card } as Record<RawSource["type"], ExtractionCandidate>)]);
  const result = await service.extractMany([{ source: text.rawSource }, { source: card.rawSource }]);

  assert.equal(result.extractedFields.companyName, "Acme");
  assert.equal(result.extractedFields.city, "Shenzhen");
  assert.equal(result.extractedFields.fob, null, "FOB contradictorio no se elige automáticamente");
  assert.ok(result.reviewFields.includes("fob"));
  assert.deepEqual(result.sourceConflicts?.map((conflict) => conflict.field), ["fob"]);
  assert.equal(result.mergedSources?.length, 2);
});

function mergeContacts(...contacts: string[]) {
  return mergeExtractionCandidates(contacts.map((contact, index) => ({
    rawSource: { type: "TEXT", text: `evidence-${index}` },
    extractedFields: { contact }, reviewFields: [], evidence: [],
  })));
}

test("mergea nombre del frente con email y teléfono del reverso en cualquier orden", () => {
  const front = "Francisco Velazquez";
  const back = "francisco@kendalsalud.com · +54 9 341 6049145";
  const forward = mergeContacts(front, back);
  const reverse = mergeContacts(back, front);
  assert.equal(forward.extractedFields.contact, `${front} · ${back}`);
  assert.equal(reverse.extractedFields.contact, forward.extractedFields.contact);
  assert.deepEqual(forward.sourceConflicts, []);
  assert.equal(forward.reviewFields.includes("contact"), false);
});

test("mergea contacto con solapamiento parcial sin perder componentes", () => {
  const result = mergeContacts("Francisco Velazquez · francisco@kendalsalud.com", "+54 9 341 6049145");
  assert.equal(result.extractedFields.contact, "Francisco Velazquez · francisco@kendalsalud.com · +54 9 341 6049145");
  assert.deepEqual(result.sourceConflicts, []);
});

test("email y teléfono equivalentes no generan conflicto de contacto", () => {
  const result = mergeContacts(
    "Francisco Velazquez · FRANCISCO@KENDALSALUD.COM · +54 9 (341) 6049145",
    "francisco@kendalsalud.com · +54-9-341-6049145",
  );
  assert.equal(result.extractedFields.contact, "Francisco Velazquez · francisco@kendalsalud.com · +54 9 (341) 6049145");
  assert.deepEqual(result.sourceConflicts, []);
});

test("normaliza nombre repetido y conserva WeChat al complementar contacto", () => {
  const result = mergeContacts("  FRANCISCO   VELAZQUEZ  · WeChat: francisco88", "Francisco Velazquez · francisco@kendalsalud.com");
  assert.equal(result.extractedFields.contact, "FRANCISCO VELAZQUEZ · francisco@kendalsalud.com · WeChat: francisco88");
  assert.deepEqual(result.sourceConflicts, []);
});

test("contacto libre no interpretable conserva el conflicto conservador", () => {
  const result = mergeContacts("Ventas: Francisco", "francisco@kendalsalud.com");
  assert.equal(result.extractedFields.contact, undefined);
  assert.deepEqual(result.sourceConflicts?.map((conflict) => conflict.field), ["contact"]);
});

test("nombres, emails y teléfonos incompatibles siguen en REVIEW", () => {
  for (const [first, second] of [
    ["Francisco Velazquez", "Juan Perez"],
    ["francisco@kendalsalud.com", "otro@empresa.com"],
    ["+54 9 341 6049145", "+54 9 341 6049999"],
  ]) {
    const result = mergeContacts(first, second);
    assert.equal(result.extractedFields.contact, undefined);
    assert.deepEqual(result.sourceConflicts?.map((conflict) => conflict.field), ["contact"]);
    assert.ok(result.reviewFields.includes("contact"));
  }
});

test("el schema multimodal exige campos, estados y contacto estructurado", () => {
  const schema = SUPPLIER_EXTRACTION_JSON_SCHEMA.schema;
  assert.ok(schema.required.includes("detectedFields"));
  assert.ok(schema.required.includes("reviewFields"));
  assert.ok(schema.required.includes("missingFields"));
  assert.ok(schema.properties.contact.required.includes("wechat"));
  assert.deepEqual(schema.properties.supplierType.enum, ["FACTORY", "TRADING", "UNKNOWN"]);
});
