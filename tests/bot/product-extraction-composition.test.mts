import test from "node:test";
import assert from "node:assert/strict";
import { AuthorizationError } from "../../lib/bot/authorization.ts";
import { runProductExtraction } from "../../lib/bot/extraction/production.ts";
import { SupplierExtractionService } from "../../lib/bot/extraction/service.ts";
import type { ExtractionInput, ExtractionProvider } from "../../lib/bot/extraction/contract.ts";
import type { ExtractionCandidate, StructuredExtractionResult, SupplierCaptureRecord } from "../../lib/bot/types.ts";

const capture: SupplierCaptureRecord = {
  id: "capture-a", userId: "user-a", tripId: "trip-a", supplierId: null, status: "DRAFT",
  source: { type: "TEXT", text: "nota previa" }, fields: { companyName: null, city: null, province: null, contact: null, category: null, supplierType: "UNKNOWN", fob: null, moq: null, leadTime: null, interestScore: null },
  missingFields: [], reviewFields: [], acknowledgedUnknownFields: [], evidence: [], createdAt: "2026-01-01", updatedAt: "2026-01-01", confirmedAt: null,
};

class Provider implements ExtractionProvider {
  readonly name = "mock"; calls: ExtractionInput[] = [];
  supports() { return true; }
  async extract(input: ExtractionInput): Promise<ExtractionCandidate> {
    this.calls.push(input);
    return { rawSource: input.source, extractedFields: input.source.type === "TEXT" ? { companyName: "ABC Lighting" } : { contact: "Li Wei · li@example.cn" }, reviewFields: [], evidence: [] };
  }
}

function dependencies(access = true, attachment = { id: "card-a", userId: "user-a", captureId: "capture-a", tripId: "trip-a", type: "BUSINESS_CARD" as const, storageKey: "private/card-a.jpg", mimeType: "image/jpeg", size: 3, createdAt: "2026-01-01" }) {
  const provider = new Provider();
  let replaced = false;
  return {
    provider, replaced: () => replaced,
    captures: {
      hasTripAccess: async () => access,
      getCapture: async () => structuredClone(capture),
      createDraft: async () => structuredClone(capture),
      replaceExtraction: async (_context: unknown, _id: string, extraction: StructuredExtractionResult) => { replaced = true; return { ...structuredClone(capture), fields: extraction.extractedFields, missingFields: extraction.missingFields, reviewFields: extraction.reviewFields }; },
    } as unknown as import("../../lib/bot/persistence/repository.ts").SupplierCaptureRepository & import("../../lib/bot/persistence/repository.ts").TripAccessRepository,
    attachments: { get: async () => attachment },
    extraction: new SupplierExtractionService([provider]),
  };
}

test("la composición requiere TripMember antes de Mistral", async () => {
  const deps = dependencies(false);
  await assert.rejects(() => runProductExtraction({ userId: "user-a", tripId: "trip-a", text: "ABC", businessCardAttachmentIds: [] }, deps), AuthorizationError);
  assert.equal(deps.provider.calls.length, 0);
});

test("texto y business card autorizada pasan por el provider y actualizan sólo el draft", async () => {
  const deps = dependencies();
  const result = await runProductExtraction({ userId: "user-a", tripId: "trip-a", captureId: "capture-a", text: "ABC Lighting", businessCardAttachmentIds: ["card-a"] }, deps);
  assert.equal(deps.provider.calls.length, 2);
  assert.deepEqual(deps.provider.calls.map((call) => call.source.type), ["TEXT", "IMAGE_BUSINESS_CARD"]);
  assert.equal(deps.replaced(), true);
  assert.equal(result.status, "DRAFT", "la extracción nunca confirma la captura");
});

test("rechaza capture o business card ajenas antes de resolver almacenamiento", async () => {
  const foreignCapture = dependencies();
  foreignCapture.captures.getCapture = async () => ({ ...structuredClone(capture), userId: "user-b" });
  await assert.rejects(() => runProductExtraction({ userId: "user-a", tripId: "trip-a", captureId: "capture-a", businessCardAttachmentIds: [] }, foreignCapture), AuthorizationError);
  const foreignCard = dependencies(true, { id: "card-b", userId: "user-a", captureId: "capture-b", tripId: "trip-a", type: "BUSINESS_CARD", storageKey: "private/card-b.jpg", mimeType: "image/jpeg", size: 3, createdAt: "2026-01-01" });
  await assert.rejects(() => runProductExtraction({ userId: "user-a", tripId: "trip-a", captureId: "capture-a", businessCardAttachmentIds: ["card-b"] }, foreignCard), AuthorizationError);
  assert.equal(foreignCard.provider.calls.length, 0);
});
