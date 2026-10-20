import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.ts";
import { listTripWhatsAppEvidence } from "../../lib/channels/whatsapp/web-evidence.ts";
import { resolveTripWhatsAppEvidence } from "../../lib/channels/whatsapp/resolve-web-evidence.ts";
import { archiveSupplierDraft, confirmSupplierCapture, correctSupplierCapture } from "../../lib/nihao/operations/supplier-operations.ts";

const connectionString = process.env.WHATSAPP_BURST_TEST_DATABASE_URL;
if (connectionString) {
  const url = new URL(connectionString);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/nihao_audit", "Sólo PostgreSQL local /nihao_audit");
}

test("PostgreSQL: historial, audio comercial, edición y resolución idempotente con aislamiento", { skip: !connectionString }, async () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionString! }) });
  const travelerId = randomUUID(), outsiderId = randomUUID(), tripId = randomUUID(), catalogId = randomUUID(), companyId = randomUUID();
  const otherCatalogId = randomUUID(), otherCompanyId = randomUUID(), instance = `commercial-${randomUUID()}`;
  const ctx = { userId: travelerId, tripId };
  const facts = { category: "zapatillas", fob: { amount: 12, currency: "USD", unit: null }, moq: { quantity: 200, unit: null }, leadTime: { days: 21 } };
  const message = (type: string, text: string | null, reading: unknown, sequence: number, burstId: string) => prisma.whatsAppBurstMessage.create({ data: { burstId, instance, messageId: randomUUID(), sequence, envelope: { type, text }, reading: reading as object, storageStatus: type === "AUDIO" ? "STORED" : "NOT_REQUIRED" } });
  try {
    await prisma.user.createMany({ data: [{ id: travelerId, name: "Viajero", email: `${travelerId}@example.test`, role: "ADMIN" }, { id: outsiderId, name: "Otro", email: `${outsiderId}@example.test`, role: "ADMIN" }] });
    await prisma.trip.create({ data: { id: tripId, name: "China", status: "ACTIVE", createdById: travelerId, members: { create: { userId: travelerId, role: "TRAVELER" } } } });
    await prisma.company.createMany({ data: [{ id: catalogId, name: `Empresa ${catalogId}`, normalizedName: catalogId }, { id: otherCatalogId, name: `Otra ${otherCatalogId}`, normalizedName: otherCatalogId }] });
    await prisma.tripCompany.create({ data: { id: companyId, tripId, catalogCompanyId: catalogId, members: { create: { userId: travelerId } } } });
    await prisma.tripCompany.create({ data: { id: otherCompanyId, tripId, catalogCompanyId: otherCatalogId } });
    const burstId = randomUUID();
    await prisma.whatsAppBurst.create({ data: { id: burstId, instance, phone: "5491112345678", userId: travelerId, version: 3, status: "DONE", dueAt: new Date(), state: { tripId, operationalContext: { tripId, companyId }, agent: { receipts: [] } } } });
    const conversation = [];
    for (const [index, text] of ["Y ahora?", "Hay evidencias pendientes?", "Y", "Y", "Y"].entries()) conversation.push(await message("TEXT", text, { segments: [] }, index + 1, burstId));
    const audio = await message("AUDIO", null, { transcript: "Zapatillas, FOB USD 12, MOQ 200, 21 días", segments: [{ candidate: { extractedFields: facts } }] }, 6, burstId);
    const nike = await message("TEXT", "Nike", { segments: [] }, 7, burstId);
    const original = await prisma.whatsAppBurstMessage.findUniqueOrThrow({ where: { id: audio.id } });

    let inbox = await listTripWhatsAppEvidence(prisma, travelerId, tripId);
    assert.equal(inbox.flatMap((row) => row.messages).filter((row) => row.resolution === "pending").length, 1);
    assert.ok(conversation.every((row) => inbox[0].messages.find((entry) => entry.id === row.id)?.resolution === "history"));
    assert.equal(inbox[0].messages.find((row) => row.id === nike.id)?.resolution, "history");
    const audioRow = inbox[0].messages.find((row) => row.id === audio.id)!;
    assert.deepEqual(audioRow.facts.fob, { amount: 12, currency: "USD", unit: null, rawText: "" });
    assert.equal(audioRow.facts.productName, null);

    const capture = await prisma.supplierCapture.create({ data: { tripId, companyId, createdById: travelerId, sourceType: "IMAGE_BUSINESS_CARD", companyName: "SHENZHEN HAOYUXIN ELECTRONICS CO., LTD", city: "Shenzhen", missingFields: [], reviewFields: [], acknowledgedUnknownFields: [], evidence: [] } });
    await prisma.$transaction((tx) => correctSupplierCapture(tx, ctx, { captureId: capture.id, field: "contact", value: "+8613800123456" }));
    const confirmed = await prisma.$transaction((tx) => confirmSupplierCapture(tx, ctx, { captureId: capture.id }));
    assert.equal(confirmed.supplier.companyName, "SHENZHEN HAOYUXIN ELECTRONICS CO., LTD");
    const product = await prisma.supplierProduct.create({ data: { captureId: capture.id, supplierId: confirmed.supplier.id, name: "Modelo definido por el viajero", status: "DRAFT" } });
    const fields = { category: "zapatillas", fob: { amount: 12, currency: "USD", unit: null }, moq: { quantity: 200, unit: null }, leadTime: { days: 21 } };
    const operationId = randomUUID();
    const command = { id: operationId, action: "APPLY_PRODUCT" as const, companyId, supplierId: confirmed.supplier.id, productId: product.id, expectedVersion: product.updatedAt.toISOString(), fields };
    const [first, retry] = await Promise.all([resolveTripWhatsAppEvidence(prisma, travelerId, tripId, audio.id, command), resolveTripWhatsAppEvidence(prisma, travelerId, tripId, audio.id, command)]);
    assert.equal(first.id, retry.id);
    assert.equal(await prisma.whatsAppEvidenceDecision.count({ where: { messageId: audio.id } }), 1);
    const applied = await prisma.supplierProduct.findUniqueOrThrow({ where: { id: product.id } });
    assert.equal(Number(applied.fobAmount), 12);
    assert.equal(applied.fobCurrency, "USD");
    assert.equal(applied.fobUnit, null);
    assert.equal(applied.moqQuantity, 200);
    assert.equal(applied.moqUnit, null);
    assert.equal(applied.leadTimeDays, 21);
    assert.equal(applied.name, "Modelo definido por el viajero");
    assert.equal(applied.category, "zapatillas");
    assert.equal(applied.status, "DRAFT");
    inbox = await listTripWhatsAppEvidence(prisma, travelerId, tripId);
    assert.equal(inbox[0].messages.find((row) => row.id === audio.id)?.resolution, "resolved");
    const after = await prisma.whatsAppBurstMessage.findUniqueOrThrow({ where: { id: audio.id } });
    assert.deepEqual(after.envelope, original.envelope);
    assert.deepEqual(after.reading, original.reading);

    await assert.rejects(resolveTripWhatsAppEvidence(prisma, outsiderId, tripId, audio.id, { id: randomUUID(), action: "DISCARD", companyId }), /acceso|viajero/i);
    await assert.rejects(resolveTripWhatsAppEvidence(prisma, travelerId, tripId, audio.id, { id: randomUUID(), action: "DISCARD", companyId: otherCompanyId }), /acceso/i);
    await assert.rejects(resolveTripWhatsAppEvidence(prisma, travelerId, tripId, audio.id, { id: randomUUID(), action: "DISCARD", companyId }), /respalda un registro comercial/i);
    await assert.rejects(resolveTripWhatsAppEvidence(prisma, travelerId, tripId, audio.id, { ...command, id: randomUUID(), expectedVersion: product.updatedAt.toISOString(), fields: { ...fields, fob: { amount: 13, currency: "USD", unit: null } } }), /cambió/i);

    const secondBurstId = randomUUID();
    await prisma.whatsAppBurst.create({ data: { id: secondBurstId, instance, phone: "5491112345678", userId: travelerId, version: 3, status: "DONE", dueAt: new Date(), state: { tripId, operationalContext: { tripId, companyId }, agent: { receipts: [] } } } });
    const card = await message("IMAGE", null, { segments: [{ candidate: { extractedFields: { companyName: "Proveedor borrador", city: "Shenzhen" } } }] }, 1, secondBurstId);
    const irrelevant = await message("IMAGE", null, { segments: [] }, 2, secondBurstId);
    const draftDecision = await resolveTripWhatsAppEvidence(prisma, travelerId, tripId, card.id, { id: randomUUID(), action: "CREATE_SUPPLIER", companyId, name: "Proveedor borrador", city: "Shenzhen" });
    assert.ok(draftDecision.captureId);
    assert.equal(draftDecision.supplierId, null);
    assert.equal((await listTripWhatsAppEvidence(prisma, travelerId, tripId)).flatMap((row) => row.messages).find((row) => row.id === card.id)?.resolution, "resolved");
    const draft = await prisma.supplierCapture.findUniqueOrThrow({ where: { id: draftDecision.captureId! } });
    await prisma.$transaction((tx) => archiveSupplierDraft(tx, ctx, { captureId: draft.id, expectedVersion: draft.updatedAt.toISOString() }));
    assert.ok((await prisma.supplierCapture.findUniqueOrThrow({ where: { id: draft.id } })).deletedAt);
    assert.ok(await prisma.whatsAppBurstMessage.findUnique({ where: { id: card.id } }));

    const discardId = randomUUID();
    assert.equal((await listTripWhatsAppEvidence(prisma, travelerId, tripId)).find((row) => row.id === secondBurstId)?.discardCompanyId, companyId);
    const discarded = await resolveTripWhatsAppEvidence(prisma, travelerId, tripId, irrelevant.id, { id: discardId, action: "DISCARD", companyId });
    assert.equal((await listTripWhatsAppEvidence(prisma, travelerId, tripId)).flatMap((row) => row.messages).find((row) => row.id === irrelevant.id)?.resolution, "discarded");
    assert.equal((await resolveTripWhatsAppEvidence(prisma, travelerId, tripId, irrelevant.id, { id: discardId, action: "DISCARD", companyId })).id, discarded.id);
    const recovered = await resolveTripWhatsAppEvidence(prisma, travelerId, tripId, irrelevant.id, { id: randomUUID(), action: "RECOVER", companyId });
    assert.equal(recovered.action, "RECOVER");
    assert.equal((await listTripWhatsAppEvidence(prisma, travelerId, tripId)).flatMap((row) => row.messages).find((row) => row.id === irrelevant.id)?.resolution, "pending");
    assert.equal(await prisma.whatsAppEvidenceDecision.count({ where: { messageId: irrelevant.id } }), 2);
    await assert.rejects(resolveTripWhatsAppEvidence(prisma, travelerId, tripId, irrelevant.id, { id: randomUUID(), action: "RECOVER", companyId }), /no está descartada/i);

    const unassignedBurstId = randomUUID();
    await prisma.whatsAppBurst.create({ data: { id: unassignedBurstId, instance, phone: "5491112345678", userId: travelerId, version: 3, status: "DONE", dueAt: new Date(), state: { tripId, operationalContext: { tripId }, agent: { receipts: [] } } } });
    const unassigned = await message("IMAGE", null, { segments: [] }, 1, unassignedBurstId);
    assert.equal((await listTripWhatsAppEvidence(prisma, travelerId, tripId)).find((row) => row.id === unassignedBurstId)?.discardCompanyId, null);
    await assert.rejects(resolveTripWhatsAppEvidence(prisma, travelerId, tripId, unassigned.id, { id: randomUUID(), action: "DISCARD", companyId }), /empresa verificada/i);
    assert.equal(await prisma.whatsAppEvidenceDecision.count({ where: { messageId: unassigned.id } }), 0);
  } finally {
    await prisma.whatsAppEvidenceDecision.deleteMany({ where: { tripId } });
    await prisma.whatsAppBurst.deleteMany({ where: { instance } });
    await prisma.supplierProduct.deleteMany({ where: { capture: { tripId } } });
    await prisma.supplier.deleteMany({ where: { tripId } });
    await prisma.supplierCapture.deleteMany({ where: { tripId } });
    await prisma.trip.deleteMany({ where: { id: tripId } });
    await prisma.company.deleteMany({ where: { id: { in: [catalogId, otherCatalogId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [travelerId, outsiderId] } } });
    await prisma.$disconnect();
  }
});
