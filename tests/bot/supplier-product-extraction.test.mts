import test from "node:test";
import assert from "node:assert/strict";
import { PrismaSupplierCaptureRepository } from "../../lib/bot/persistence/prisma-repository.ts";
import { calculateMissingFields } from "../../lib/bot/tier1.ts";
import { EMPTY_TIER_1_DATA } from "../../lib/bot/types.ts";

test("FOB, MOQ y lead time extraídos quedan en un producto del borrador", async () => {
  let captureData: Record<string, unknown> | null = null;
  let productData: Record<string, unknown> | null = null;
  const prisma = {
    tripMember: { async findUnique() { return { role: "ADMIN" }; } },
    tripCompany: { async findFirst() { return { id: "company-a" }; } },
    supplierCapture: {
      async create({ data }: { data: Record<string, unknown> }) {
        captureData = data;
        return { ...data, id: "capture-a", status: "DRAFT", supplier: null, website: null, contactMethods: [], confirmedAt: null, createdAt: new Date(), updatedAt: new Date() };
      },
    },
    supplierProduct: {
      async upsert({ create }: { create: Record<string, unknown> }) { productData = create; return create; },
    },
  };
  const fields = {
    ...EMPTY_TIER_1_DATA,
    companyName: "FiveFoods",
    category: "snacks",
    fob: { amount: 2.8, currency: "USD", unit: "paquete", rawText: "FOB USD 2,80" },
    moq: { quantity: 1000, unit: "paquetes", notes: null, rawText: "MOQ 1000 paquetes" },
    leadTime: { rawText: "30 días", days: 30 },
  };
  const capture = await new PrismaSupplierCaptureRepository(prisma as never).createDraft({
    userId: "user-a",
    tripId: "trip-a",
    companyId: "company-a",
    extraction: {
      rawSource: { type: "TEXT", text: "FiveFoods. Producto: snacks de frutas deshidratadas. FOB USD 2,80. MOQ 1000 paquetes. lead time 30 días." },
      extractedFields: fields,
      missingFields: calculateMissingFields(fields),
      reviewFields: [],
      evidence: [],
    },
  });
  const savedCapture = captureData as Record<string, unknown> | null;
  const savedProduct = productData as Record<string, unknown> | null;
  assert.equal(savedCapture?.fobAmount, null);
  assert.equal(savedCapture?.moqQuantity, null);
  assert.equal(savedCapture?.leadTimeDays, null);
  assert.equal(capture.fields.fob, null);
  assert.equal(capture.missingFields.includes("fob"), false);
  assert.equal(savedProduct?.name, "snacks de frutas deshidratadas");
  assert.equal(savedProduct?.fobAmount, 2.8);
  assert.equal(savedProduct?.moqQuantity, 1000);
  assert.equal(savedProduct?.leadTimeDays, 30);
});
