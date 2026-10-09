import test from "node:test";
import assert from "node:assert/strict";
import { rankSupplierSearch } from "../../lib/channels/whatsapp/supplier-search.ts";
import { PrismaAgentDomain } from "../../lib/channels/whatsapp/prisma-agent-domain.ts";
import type { PrismaClient } from "../../generated/prisma/client.ts";
import type { BurstSnapshot } from "../../lib/channels/whatsapp/burst-types.ts";

const alfa = { id: "alfa", companyName: "Alfa Tools Co., Ltd." };

test("supplier search tolerates typos, transcription variants and transpositions", () => {
  for (const query of ["Alpha Tools", "Alfa Tols", "Alfa Tolos", "Alfa Toolz"]) {
    const results = rankSupplierSearch([alfa], query);
    assert.equal(results[0]?.record.id, "alfa", query);
    assert.equal(results[0]?.match.type, "FUZZY");
    assert.ok(results[0].match.score >= 0.8);
  }
});

test("literal names, romanization and exact contacts take precedence", () => {
  const records = [alfa, { id: "alpha", companyName: "Alpha Tools" }];
  assert.deepEqual(rankSupplierSearch(records, "ALFA TOOLS").map(r => [r.record.id, r.match.type]), [["alfa", "LITERAL"]]);
  assert.equal(rankSupplierSearch([{ id: "latin", companyName: "工具", companyNameLatin: "Álfa Tools" }], "alfa tools")[0]?.match.type, "LITERAL");
  const contact = { ...alfa, website: "https://www.alfa.com", contacts: [{ type: "EMAIL", rawText: "ventas@alfa.com" }, { type: "PHONE", rawText: "+54 12345678" }] };
  for (const query of ["ventas@alfa.com", "alfa.com", "+5412345678"]) assert.equal(rankSupplierSearch([contact], query)[0]?.match.type, "LITERAL");
  for (const query of ["ventaz@alfa.com", "alfa.con", "+5412345679"]) assert.deepEqual(rankSupplierSearch([contact], query), []);
});

test("fuzzy candidates are ranked and ambiguous suppliers are retained", () => {
  const results = rankSupplierSearch([{ id: "a", companyName: "Alfa Tools" }, { id: "b", companyName: "Alfa Tools" }, { id: "c", companyName: "Alfa Tolls" }], "Alfa Toolz");
  assert.equal(results.length, 3);
  assert.equal(results[0].record.id, "a");
  assert.equal(results[1].record.id, "b");
  assert.ok(results[1].match.score >= results[2].match.score);
});

test("short, unrelated and punctuation-only queries do not produce fuzzy matches", () => {
  for (const query of ["Alf", "Beta Machines", "@@@", "123456", "a".repeat(121)]) assert.deepEqual(rankSupplierSearch([alfa], query), []);
  assert.equal(rankSupplierSearch([alfa], "")[0]?.match.type, "LITERAL");
});

test("domain search scopes suppliers and drafts, returns metadata and leaves product search literal", async () => {
  const snapshot = { userId: "user", messages: [], state: {} } as unknown as BurstSnapshot;
  const db = {
    trip: { async findFirst() { return { id: "trip" }; } },
    tripCompany: { async findMany() { return [{ id: "company", catalogCompany: { name: "Broco" } }]; } },
    supplier: { async findMany({ where }: { where: unknown }) {
      assert.deepEqual(where, { tripId: "trip", companyId: { in: ["company"] }, status: "CONFIRMED" });
      return [alfa];
    } },
    supplierCapture: { async findMany({ where }: { where: unknown }) {
      assert.deepEqual(where, { tripId: "trip", companyId: { in: ["company"] }, status: "DRAFT", deletedAt: null });
      return [{ id: "draft", companyName: "Alfa Tolls" }];
    } },
    supplierProduct: { async findMany() { return [{ id: "product", name: "Alfa Tools" }]; } },
  };
  const domain = new PrismaAgentDomain(db as unknown as PrismaClient, {} as ConstructorParameters<typeof PrismaAgentDomain>[1]);
  domain.get = async (_snapshot, kind, id) => ({ id, kind, captureId: id, tripId: "trip", companyId: "company", name: "Alfa Tools", status: "DRAFT", version: "1", data: {} });
  const results = await domain.search(snapshot, "SUPPLIER", "trip", "Alfa Toolz");
  assert.equal(results.length, 2);
  assert.equal(results[0].searchMatch?.type, "FUZZY");
  assert.ok(results[0].searchMatch!.score >= results[1].searchMatch!.score);
  assert.deepEqual(await domain.search(snapshot, "PRODUCT", "trip", "Alfa Toolz"), []);
});
