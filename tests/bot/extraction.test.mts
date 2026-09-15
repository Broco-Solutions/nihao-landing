import test from "node:test";
import assert from "node:assert/strict";
import { DevelopmentTextExtractionAdapter } from "../../lib/bot/extraction/development-text-adapter.ts";
import { SupplierExtractionService } from "../../lib/bot/extraction/service.ts";
import type { ExtractionInput, ExtractionProvider } from "../../lib/bot/extraction/contract.ts";
import { SUPPLIER_EXTRACTION_JSON_SCHEMA } from "../../lib/bot/extraction/schema.ts";
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

test("el schema multimodal exige campos, estados y contacto estructurado", () => {
  const schema = SUPPLIER_EXTRACTION_JSON_SCHEMA.schema;
  assert.ok(schema.required.includes("detectedFields"));
  assert.ok(schema.required.includes("reviewFields"));
  assert.ok(schema.required.includes("missingFields"));
  assert.ok(schema.properties.contact.required.includes("wechat"));
  assert.deepEqual(schema.properties.supplierType.enum, ["FACTORY", "TRADING", "UNKNOWN"]);
});
