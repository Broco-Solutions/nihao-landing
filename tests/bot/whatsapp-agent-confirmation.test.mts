import { legacyProposal } from "../helpers/legacy-agent-proposal.mts";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createAgentEnvironment, localAgentDatabase } from "../../evals/whatsapp-agent/environment.ts";
import { agentState, type AgentReceipt } from "../../lib/channels/whatsapp/agent-contract.ts";
import { AgentTools, renderReceipts } from "../../lib/channels/whatsapp/agent-tools.ts";
import { WhatsAppAgentOrchestrator } from "../../lib/channels/whatsapp/agent-orchestrator.ts";
import { deriveSupplierStatus, deriveProductStatus, isSupplierConfirmable, isProductConfirmable } from "../../lib/bot/record-completeness.ts";
import type { BurstMessage, BurstReading, BurstSnapshot } from "../../lib/channels/whatsapp/burst-types.ts";
import type { ExtractionCandidate } from "../../lib/bot/types.ts";

const photo = { productId: "p", type: "PRODUCT_IMAGE", storageKey: "original/photo.jpg", mimeType: "image/jpeg", size: 8, verified: true };
test("completitud no confunde personas/web con contacto ni OCR/otras evidencias con fotos", () => {
  for (const contact of ["Juan Pérez", "https://alfa.test/12345678", "Shenzhen"]) assert.equal(isSupplierConfirmable({ name: "Alfa", contact }), false);
  for (const contact of ["+54 9 341 1234567", "Juan: juan@alfa.test", "WeChat: alfa_tools"]) assert.equal(isSupplierConfirmable({ name: "Alfa", contact }), true);
  assert.equal(isSupplierConfirmable({ name: "Alfa", contacts: [{ type: "EMAIL", rawText: "invalid" }] }), false);
  assert.equal(isSupplierConfirmable({ name: "Alfa", contacts: [{ type: "PHONE", rawText: "123" }] }), false);
  assert.equal(isSupplierConfirmable({ name: "Alfa", contacts: [{ type: "FAX", rawText: "+86 12345678" }] }), true);
  assert.equal(isSupplierConfirmable({ name: "Alfa", contacts: [{ type: "WECHAT", rawText: "alfa_tools" }] }), true);
  assert.equal(isProductConfirmable({ name: "Taladro", fobAmount: 7, fobCurrency: "USD" }), true);
  assert.equal(isProductConfirmable({ name: "Taladro", fobAmount: 7 }), true);
  assert.equal(isProductConfirmable({ name: "Taladro", images: [photo] }), true);
  assert.equal(isProductConfirmable({ name: "Producto sin nombre", fobAmount: 7, fobCurrency: "USD" }), false);
  assert.equal(deriveSupplierStatus({ status: "CONFIRMED", name: "Alfa" }), "CONFIRMED");
  assert.equal(deriveProductStatus({ status: "CONFIRMED", id: "p", name: "Taladro", images: [] }), "CONFIRMED");
});

test("confirmación automática PostgreSQL: 13 escenarios, receipts, media y retries", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async (t) => {
  const prisma = localAgentDatabase();
  const env = await createAgentEnvironment(prisma, { trips: [{ id: "trip", name: "China", companies: [{ id: "company", name: "Broco" }], suppliers: [{ id: "base", captureId: "base-capture", name: "BaseSupplier", companyId: "company", city: null }] }] });
  const extraction = { async extractReading(text: string): Promise<ExtractionCandidate> { return { extractedFields: {}, evidence: [], reviewFields: [], rawSource: { type: "TEXT", text } }; } };
  function message(sequence: number, text: string, candidate: Partial<ExtractionCandidate> = {}, reading: Partial<BurstReading> = {}): BurstMessage {
    const id = randomUUID(); const image = reading.imageKind !== undefined;
    return { id, sequence, sentAt: null, envelope: { instance: "test", messageId: id, phone: "123", type: image ? "IMAGE" : "TEXT", text: image ? null : text, media: null, sentAt: null }, reading: { complete: true, ...(image ? { ocr: text } : {}), segments: [{ id: `${id}:1`, text, candidate: { extractedFields: {}, evidence: [], reviewFields: [], rawSource: { type: "TEXT", text }, ...candidate } }], ...reading } };
  }
  async function setup(text: string, candidate: Partial<ExtractionCandidate> = {}) {
    await prisma.whatsAppBurst.updateMany({ where: { userId: env.userId }, data: { status: "DONE" } });
    const snapshot: BurstSnapshot = { id: randomUUID(), instance: "test", phone: "123", userId: env.userId, revision: 1, leaseId: "lease", status: "PROCESSING", state: { tripId: null, groups: [], question: null, controlIds: [], pendingRefs: [] }, messages: [message(1, text, candidate)] };
    await env.persist(snapshot); const state = agentState(snapshot.state); snapshot.state = state;
    const tools = new AgentTools({ domain: env.domain, extraction, catalog: env.catalog, async checkpoint(updated) { snapshot.state = updated; await env.save(snapshot, updated); } });
    await tools.execute("get_context", {}, snapshot, state);
    return { snapshot, state, tools };
  }
  type Setup = Awaited<ReturnType<typeof setup>>;
  async function advance(s: Setup, next: BurstMessage) {
    s.snapshot.revision++; next.sequence = s.snapshot.revision; s.snapshot.messages.push(next);
    await prisma.whatsAppBurstMessage.create({ data: { id: next.id, burstId: s.snapshot.id, instance: s.snapshot.instance, messageId: next.id, sequence: next.sequence, envelope: JSON.parse(JSON.stringify(next.envelope)), reading: JSON.parse(JSON.stringify(next.reading)) } });
    await prisma.whatsAppBurst.update({ where: { id: s.snapshot.id }, data: { revision: s.snapshot.revision, state: JSON.parse(JSON.stringify(s.state)) } });
  }
  async function evidence(s: Setup, messages = s.snapshot.messages, role = "FACTS") {
    const prepared = await s.tools.execute("prepare_evidence", { sources: messages.map((m) => ({ messageId: m.id, quote: null, role })) }, s.snapshot, s.state) as { evidence: Array<{ id: string }> };
    return prepared.evidence.map((e) => e.id);
  }
  async function createSupplier(s: Setup) { return s.tools.execute("create_supplier_draft", { tripId: env.id("trip"), companyId: env.id("company"), evidenceIds: await evidence(s) }, s.snapshot, s.state) as Promise<AgentReceipt>; }
  async function addPhoto(s: Setup, kind: BurstReading["imageKind"] = "PRODUCT_IMAGE", verified = kind === "PRODUCT_IMAGE") {
    const key = `test/${randomUUID()}`;
    await env.storage.put({ key, body: new Uint8Array([0xff, 0xd8, 0xff, 1]), contentType: "image/jpeg" });
    await advance(s, message(2, "", {}, { imageKind: kind, productImageVerified: verified, storageKey: key, mimeType: "image/jpeg" }));
  }
  async function createProduct(s: Setup, name: string | null) {
    await s.tools.execute("get_supplier", { id: env.id("base") }, s.snapshot, s.state);
    return s.tools.execute("create_product_draft", { supplierId: env.id("base"), name, evidenceIds: await evidence(s) }, s.snapshot, s.state) as Promise<AgentReceipt>;
  }
  const emptyProductPatch = { notes: null, name: null, fob: null, moq: null, leadTime: null, clearFields: null };
  try {
    for (const [label, fields, methods, website, expected] of [
      ["1 nombre + teléfono", { companyName: "Alfa Tools", contact: "+5493411234567" }, [], null, "CONFIRMED"],
      ["2 nombre + email", { companyName: "Alfa Tools" }, [{ type: "EMAIL", rawText: "sales@alfa.test" }], null, "CONFIRMED"],
      ["3 nombre sin contacto", { companyName: "Alfa Tools" }, [], null, "DRAFT"],
      ["4 contacto sin nombre", { contact: "sales@alfa.test" }, [], null, "DRAFT"],
      ["5 nombre + web", { companyName: "Alfa Tools" }, [], "https://alfa.test", "DRAFT"],
    ] as const) await t.test(label, async () => {
      const s = await setup("Nuevo proveedor Alfa Tools. Tel +5493411234567. sales@alfa.test", { extractedFields: fields, contactMethods: [...methods], website });
      const result = await createSupplier(s);
      const capture = await prisma.supplierCapture.findUniqueOrThrow({ where: { id: result.captureId } });
      assert.equal(capture.status, expected); assert.equal(result.resourceStatus, expected);
      const supplier = await prisma.supplier.findUnique({ where: { captureId: capture.id } });
      assert.equal(Boolean(supplier), expected === "CONFIRMED");
      assert.equal(result.confirmationReason, expected === "CONFIRMED" ? "NAME_AND_CONTACT_PRESENT" : undefined);
      assert.deepEqual(await createSupplier(s), result); assert.equal(await prisma.whatsAppAgentOperation.count({ where: { burstId: s.snapshot.id } }), 1);
    });
    await t.test("6 draft + contacto se confirma; retry no propone otra edición ni duplica proveedor", async () => {
      const s = await setup("Nuevo proveedor Alfa Tools", { extractedFields: { companyName: "Alfa Tools" } });
      const created = await createSupplier(s);
      await advance(s, message(0, "Agregá teléfono +5493411234567", { extractedFields: { contact: "+5493411234567" } }));
      const args = { id: created.id, patch: { contact: "+5493411234567" }, evidenceIds: await evidence(s, s.snapshot.messages.slice(-2)) };
      const updated = await s.tools.execute("update_supplier", args, s.snapshot, s.state) as AgentReceipt;
      assert.equal(updated.resourceStatus, "CONFIRMED"); assert.equal(updated.confirmationReason, "NAME_AND_CONTACT_PRESENT");
      assert.deepEqual(await s.tools.execute("update_supplier", args, s.snapshot, s.state), updated);
      assert.equal(await prisma.supplier.count({ where: { captureId: created.captureId } }), 1);
      assert.equal(await prisma.whatsAppAgentOperation.count({ where: { burstId: s.snapshot.id, status: "PROPOSED" } }), 0);
      assert.equal((await env.domain.get(s.snapshot, "SUPPLIER", created.id)).id, updated.id);
      const summary = renderReceipts(s.state.agent.receipts, s.snapshot.revision);
      assert.match(summary, /actualizado y confirmado/); assert.doesNotMatch(summary, /guardado como borrador/);
    });
    await t.test("7 confirmado + otro campo conserva status y confirmedAt, sin confirmación nueva", async () => {
      const s = await setup("Nuevo proveedor Alfa Tools, sales@alfa.test", { extractedFields: { companyName: "Alfa Tools", contact: "sales@alfa.test" } });
      const created = await createSupplier(s);
      const initial = await prisma.supplierCapture.findUniqueOrThrow({ where: { id: created.captureId } });
      await advance(s, message(0, "Actualizá ciudad a Shanghai", { extractedFields: { city: "Shanghai" } }));
      const proposal = await s.tools.execute("update_supplier", { id: created.id, patch: { city: "Shanghai" }, evidenceIds: await evidence(s, [s.snapshot.messages.at(-1)!]) }, s.snapshot, s.state) as AgentReceipt;
      assert.equal(proposal.status, "COMPLETED");
      const result = proposal;
      assert.equal(result.resourceStatus, "CONFIRMED"); assert.equal(result.confirmationReason, undefined);
      const capture = await prisma.supplierCapture.findUniqueOrThrow({ where: { id: created.captureId } });
      assert.deepEqual(capture.confirmedAt, initial.confirmedAt);
      assert.equal((await prisma.supplier.findUniqueOrThrow({ where: { id: created.id } })).city, "Shanghai");
      assert.doesNotMatch(renderReceipts(s.state.agent.receipts, s.snapshot.revision), /y confirmado/);
    });
    for (const [label, name, kind, expected] of [
      ["8 nombre + imagen sin FOB permanece en borrador", "Taladro X10", "PRODUCT_IMAGE", "DRAFT"],
      ["9 nombre sin imagen permanece en borrador", "Taladro X10", null, "DRAFT"],
      ["10 imagen sin nombre", null, "PRODUCT_IMAGE", "DRAFT"],
      ["11 nombre + documento/OCR sin imagen de producto permanece en borrador", "Taladro X10", "OTHER", "DRAFT"],
    ] as const) await t.test(label, async () => {
      const s = await setup(name ? `BaseSupplier. Producto ${name}` : "BaseSupplier");
      if (kind) await addPhoto(s, kind);
      const result = await createProduct(s, name);
      const product = await prisma.supplierProduct.findUniqueOrThrow({ where: { id: result.id }, include: { images: true } });
      assert.equal(product.status, expected); assert.equal(result.resourceStatus, expected);
      assert.equal(result.confirmationReason, undefined);
      if (kind) { assert.equal(product.images.length, 1); assert.equal(product.images[0].productId, product.id); }
      assert.deepEqual(await createProduct(s, name), result);
    });
    await t.test("12 completar FOB no confirma el borrador; retry no duplica media", async () => {
      const s = await setup("BaseSupplier. Producto Taladro X10"); const created = await createProduct(s, "Taladro X10");
      // Simulate a draft saved before confirmation required only a name.
      await prisma.supplierProduct.update({ where: { id: created.id }, data: { status: "DRAFT" } });
      await addPhoto(s); await advance(s, message(0, "FOB USD 7", { extractedFields: { fob: { amount: 7, currency: "USD", unit: null, rawText: "FOB USD 7" } } })); await s.tools.execute("get_product", { id: created.id }, s.snapshot, s.state);
      const args = { id: created.id, patch: { ...emptyProductPatch, fob: { amount: 7, currency: "USD" } }, evidenceIds: await evidence(s, s.snapshot.messages.slice(-2)) };
      const result = await s.tools.execute("update_product", args, s.snapshot, s.state) as AgentReceipt;
      assert.equal(result.resourceStatus, "DRAFT"); assert.equal(result.confirmationReason, undefined);
      assert.deepEqual(await s.tools.execute("update_product", args, s.snapshot, s.state), result);
      assert.equal(await prisma.supplierAttachment.count({ where: { productId: created.id } }), 1);
      const saved = await prisma.supplierProduct.findUniqueOrThrow({ where: { id: created.id } }); assert.equal(saved.name, "Taladro X10"); assert.equal(saved.status, "DRAFT");
    });
    await t.test("13 producto WhatsApp en borrador conserva el estado tras update comercial", async () => {
      const s = await setup("BaseSupplier. Producto Taladro X10 FOB USD 7", { extractedFields: { fob: { amount: 7, currency: "USD", unit: null, rawText: "FOB USD 7" } } }); await addPhoto(s); const created = await createProduct(s, "Taladro X10");
      await advance(s, message(0, "Actualizá FOB USD 9", { extractedFields: { fob: { amount: 9, currency: "USD", unit: null, rawText: "FOB USD 9" } } }));
      await s.tools.execute("get_product", { id: created.id }, s.snapshot, s.state);
      const proposal = await s.tools.execute("update_product", { id: created.id, patch: { ...emptyProductPatch, fob: { amount: 9, currency: "USD", unit: null, rawText: null } }, evidenceIds: await evidence(s, [s.snapshot.messages.at(-1)!]) }, s.snapshot, s.state) as AgentReceipt;
      assert.equal(proposal.status, "COMPLETED");
      const result = proposal; assert.equal(result.resourceStatus, "DRAFT"); assert.equal(result.confirmationReason, undefined);
      const product = await prisma.supplierProduct.findUniqueOrThrow({ where: { id: created.id } }); assert.equal(product.status, "DRAFT"); assert.equal(Number(product.fobAmount), 9);
      assert.equal(await prisma.whatsAppAgentOperation.count({ where: { burstId: s.snapshot.id, status: "PROPOSED" } }), 0);
    });
    await t.test("cancelación compuesta cancela propuesta enviada y crea el producto adicional", async () => {
      const s = await setup("Actualizá ciudad de BaseSupplier a Shanghai", { extractedFields: { city: "Shanghai" } });
      await s.tools.execute("get_supplier", { id: env.id("base") }, s.snapshot, s.state);
      const proposal = await legacyProposal(prisma, env.domain, s.snapshot, s.state, "update_supplier", env.id("base"), { city: "Shanghai" }, await evidence(s));
      await prisma.whatsAppBurstReply.create({ data: { burstId: s.snapshot.id, revision: s.snapshot.revision, text: s.state.question!, status: "SENT" } });
      await env.domain.displayed(s.snapshot, proposal.operationId);
      await advance(s, message(0, "No confirmes eso. Además agregá otro producto Martillo al proveedor BaseSupplier."));
      let round = 0;
      const runner = new WhatsAppAgentOrchestrator({ domain: env.domain, extraction, client: { async post(_path, body) {
        round++;
        const messages = (body as { messages: Array<{ content: string }> }).messages;
        const call = round === 1 ? ["prepare_evidence", { sources: [{ messageId: s.snapshot.messages.at(-1)!.id, quote: null, role: "FACTS" }] }]
          : round === 2 ? ["create_product_draft", { notes: null, supplierId: env.id("base"), name: "Martillo", evidenceIds: JSON.parse(messages.at(-1)!.content).evidence.map((e: { id: string }) => e.id) }]
          : ["finish_turn", { response: null, guidance: null, outcomes: null }];
        return { choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: `compound-${round}`, type: "function", function: { name: call[0], arguments: JSON.stringify(call[1]) } }] } }] };
      } } });
      const result = await runner.run(s.snapshot, env.catalog, async (state) => env.save(s.snapshot, state));
      assert.equal(result.state.agent.termination?.reason, "completed");
      assert.equal((await prisma.whatsAppAgentOperation.findUniqueOrThrow({ where: { id: proposal.operationId } })).status, "CANCELLED");
      assert.equal((await prisma.supplier.findUniqueOrThrow({ where: { id: env.id("base") } })).city, null);
      assert.equal(await prisma.supplierProduct.count({ where: { captureId: env.id("base-capture"), name: "Martillo" } }), 1);
    });
    await t.test("update interrumpido después de escritura retoma media sin duplicar ni aplicar otra vez", async () => {
      const s = await setup("BaseSupplier. Producto Taladro X10"); const created = await createProduct(s, "Taladro X10");
      // Simulate a draft saved before confirmation required only a name.
      await prisma.supplierProduct.update({ where: { id: created.id }, data: { status: "DRAFT" } });
      await addPhoto(s); await advance(s, message(0, "FOB USD 7", { extractedFields: { fob: { amount: 7, currency: "USD", unit: null, rawText: "FOB USD 7" } } })); await s.tools.execute("get_product", { id: created.id }, s.snapshot, s.state);
      const args = { id: created.id, patch: { ...emptyProductPatch, fob: { amount: 7, currency: "USD" } }, evidenceIds: await evidence(s, s.snapshot.messages.slice(-2)) };
      const get = env.storage.get;
      env.storage.get = async () => { throw new Error("storage temporarily offline"); };
      try { await assert.rejects(s.tools.execute("update_product", args, s.snapshot, s.state), /storage temporarily offline/); }
      finally { env.storage.get = get; }
      assert.equal(await prisma.whatsAppAgentOperation.count({ where: { burstId: s.snapshot.id, status: "WRITTEN" } }), 1);
      const recovered = await env.domain.receipts(s.snapshot);
      assert.equal(recovered.find((r) => r.tool === "update_product")?.resourceStatus, "DRAFT");
      const result = await s.tools.execute("update_product", args, s.snapshot, s.state) as AgentReceipt;
      assert.equal(result.resourceStatus, "DRAFT"); assert.equal(result.confirmationReason, undefined);
      assert.equal(await prisma.supplierAttachment.count({ where: { productId: created.id } }), 1);
      assert.equal(await prisma.whatsAppAgentOperation.count({ where: { burstId: s.snapshot.id, tool: "update_product" } }), 1);
    });
    await t.test("nombre sustentado confirma independientemente del tipo de imagen", async () => {
      for (const [kind, verified, role] of [["BUSINESS_CARD", false, "FACTS"], ["PRODUCT_IMAGE", true, "CONTEXT"], ["PRODUCT_IMAGE", false, "FACTS"]] as const) {
        const s = await setup("BaseSupplier. Producto Taladro X10"); await addPhoto(s, kind, verified);
        await s.tools.execute("get_supplier", { id: env.id("base") }, s.snapshot, s.state);
        const ids = [...await evidence(s, [s.snapshot.messages[0]]), ...await evidence(s, [s.snapshot.messages.at(-1)!], role)];
        const result = await s.tools.execute("create_product_draft", { supplierId: env.id("base"), name: "Taladro X10", evidenceIds: ids }, s.snapshot, s.state) as AgentReceipt;
        assert.equal(result.resourceStatus, "DRAFT");
        assert.equal(result.confirmationReason, undefined);
      }
    });
    await t.test("productos con igual nombre y evidencias distintas no se deduplican por contenido", async () => {
      const s = await setup("BaseSupplier. Producto Taladro X10"); const first = await createProduct(s, "Taladro X10");
      await advance(s, message(0, "BaseSupplier. Otro producto Taladro X10"));
      const second = await s.tools.execute("create_product_draft", { supplierId: env.id("base"), name: "Taladro X10", evidenceIds: await evidence(s, [s.snapshot.messages.at(-1)!]) }, s.snapshot, s.state) as AgentReceipt;
      assert.notEqual(first.id, second.id);
    });
  } finally { await env.cleanup(); await prisma.$disconnect(); }
});
