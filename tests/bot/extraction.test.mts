import test from "node:test";
import assert from "node:assert/strict";
import { DevelopmentTextExtractionAdapter } from "../../lib/bot/extraction/development-text-adapter.ts";
import { SupplierExtractionService } from "../../lib/bot/extraction/service.ts";

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
