import { createProductMaterializer } from "../../lib/channels/whatsapp/prisma-product-materializer.ts";
import { productUpdateData } from "../../lib/bot/supplier-edit.ts";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.ts";
import { PrismaBurstStore } from "../../lib/channels/whatsapp/prisma-burst-store.ts";
import { WhatsAppAgentOrchestrator } from "../../lib/channels/whatsapp/agent-orchestrator.ts";
import { WhatsAppBurstService } from "../../lib/channels/whatsapp/burst-service.ts";
import { BurstReader } from "../../lib/channels/whatsapp/burst-reader.ts";
import { MistralBurstInterpreter, validateBurstPlan } from "../../lib/channels/whatsapp/burst-interpreter.ts";
import { createBurstMaterializer } from "../../lib/channels/whatsapp/burst-materializer.ts";
import { handleBurstWebhook } from "../../lib/channels/whatsapp/burst-webhook.ts";
import { SupplierExtractionService } from "../../lib/bot/extraction/service.ts";
import { AttachmentService } from "../../lib/bot/attachments.ts";
import { PrismaAttachmentRepository } from "../../lib/bot/persistence/prisma-attachment-repository.ts";
import { OperationsCaptureRepository } from "../../lib/nihao/operations/capture-repository-adapter.ts";
import type { StorageProvider } from "../../lib/bot/storage/provider.ts";
import type { BurstEnvelope, BurstState, BurstReading } from "../../lib/channels/whatsapp/burst-types.ts";

const connectionString = process.env.WHATSAPP_BURST_TEST_DATABASE_URL;
// Never point this suite at a project database: it intentionally mutates isolated test data.
if (connectionString) {
  const url = new URL(connectionString);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/nihao_audit", "Usá exclusivamente PostgreSQL local /nihao_audit");
}

test("la migración aditiva crea inbox, FK de usuario e índice único activo sin tocar tablas legacy", { skip: !connectionString }, async () => {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");
    const schema = `burst_migration_${randomUUID().replaceAll("-", "")}`;
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    await client.query('CREATE TABLE "user" ("id" TEXT PRIMARY KEY)');
    await client.query(await readFile(new URL("../../prisma/migrations/20261002120000_whatsapp_bursts/migration.sql", import.meta.url), "utf8"));
    await client.query('INSERT INTO "user" ("id") VALUES ($1)', ["user"]);
    const insert = 'INSERT INTO "WhatsAppBurst" ("id","instance","phone","userId","dueAt","state","updatedAt") VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP,$5,CURRENT_TIMESTAMP)';
    await client.query(insert, ["one", "test", "5491112345678", "user", "{}"]);
    await client.query("SAVEPOINT duplicate");
    await assert.rejects(client.query(insert, ["two", "test", "5491112345678", "user", "{}"]), { code: "23505" });
    await client.query("ROLLBACK TO SAVEPOINT duplicate");
    await client.query('UPDATE "WhatsAppBurst" SET "status" = $1 WHERE "id" = $2', ["DONE", "one"]);
    await client.query(insert, ["two", "test", "5491112345678", "user", "{}"]);
    await client.query("SAVEPOINT foreign_user");
    await assert.rejects(client.query(insert, ["foreign", "test", "5491112349999", "other-user", "{}"]), { code: "23503" });
    await client.query("ROLLBACK TO SAVEPOINT foreign_user");
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});

test("PostgreSQL: ráfaga completa, concurrencia, reintentos y copias de evidencia", { skip: !connectionString }, async (t) => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionString! }) });
  const userId = randomUUID(); const tripId = randomUUID(); const phone = "5491112345678";
  const companyIds = [randomUUID(), randomUUID()]; const catalogIds = [randomUUID(), randomUUID()];
  const objects = new Map<string, Uint8Array>();
  const storage: StorageProvider = { async put(input) { objects.set(input.key, Uint8Array.from(input.body as Uint8Array)); }, async get(key) { const bytes = objects.get(key); return bytes ? new Response(Uint8Array.from(bytes)).body : null; }, async delete(key) { objects.delete(key); }, async signedUrl() { return "https://private.example.test/object"; } };
  const repository = new PrismaAttachmentRepository(prisma);
  const attachments = new AttachmentService(repository, storage);
  const captures = new OperationsCaptureRepository(prisma, "automation");
  const extraction = new SupplierExtractionService([]);
  const store = new PrismaBurstStore(prisma);
  const materialize = createBurstMaterializer({ store, storage, attachments, repository, captures, extraction });
  const instance = `test-${randomUUID()}`;
  const envelope = (id: string, type: "TEXT" | "IMAGE" | "AUDIO" = "TEXT", text: string | null = "Proveedor", index = 1): BurstEnvelope => ({ instance, messageId: id, phone, type, text, sentAt: new Date(1_000 * index).toISOString(), media: type === "TEXT" ? null : { key: { id, remoteJid: `${phone}@s.whatsapp.net`, fromMe: false }, message: { [type === "IMAGE" ? "imageMessage" : "audioMessage"]: { directPath: `/original/${id}` } } } });
  const due = () => prisma.whatsAppBurst.updateMany({ where: { instance, status: "OPEN" }, data: { dueAt: new Date(0) } });
  try {
    await prisma.user.create({ data: { id: userId, name: "Test", role: "ADMIN", email: `${userId}@example.test`, whatsappPhone: phone } });
    await prisma.trip.create({ data: { id: tripId, name: "China", status: "ACTIVE", createdById: userId, members: { create: { userId, role: "TRAVELER" } } } });
    for (const [i, name] of ["Broco Solutions", "Kendal Salud"].entries()) {
      await prisma.company.create({ data: { id: catalogIds[i], name, normalizedName: name.toLowerCase() } });
      await prisma.tripCompany.create({ data: { id: companyIds[i], tripId, catalogCompanyId: catalogIds[i], members: { create: { userId } } } });
    }

    await t.test("terminal recuperado persiste la revisión, conserva aclaración y no bloquea otros senders", async () => {
      const revision = 3;
      const terminalInstance = `${instance}-terminal`;
      const terminals = await Promise.all([0, 1, 2].map(async (i) => {
        const id = `terminal-${i}-${randomUUID()}`;
        const question = `Aclaración pendiente ${i}`;
        const state = {
          tripId, groups: [], question, controlIds: [], pendingRefs: [], evaluatedRevision: i === 0 ? 2 : revision,
          ingestion: { version: 1, revision, activeLoadId: `load-${i}`, assets: [], loads: [], links: [], derivations: [], summary: { totalAssets: 0, totalLogicalLoads: 0, processed: 0, pending: 0, needsReview: 0, failed: 0 } },
          agent: { evidence: [], receipts: [], pending: null, history: [], historyRevision: revision, rounds: 1, calls: [], seenIds: [], scopeId: `load-${i}`, terminal: { revision, response: question }, termination: { reason: "asked_clarification", revision, rounds: 1 } },
        };
        await prisma.whatsAppBurst.create({ data: { id, instance: terminalInstance, phone: `${phone}-${i}`, userId, version: 3, revision, status: "OPEN", dueAt: new Date(i), state } });
        return { id, question };
      }));
      const orchestrator = new WhatsAppAgentOrchestrator({
        client: { async post() { assert.fail("El terminal persistido no debe volver al modelo"); } } as never,
        extraction: { async extractReading() { assert.fail("El fast path terminal no debe extraer"); } } as never,
        domain: { async receipts() { return []; } } as never,
      });
      const restartedStore = new PrismaBurstStore(prisma, { claimVersions: [3] });
      for (let i = 0; i < terminals.length; i++) {
        const [claimed] = await restartedStore.claim(1);
        assert.equal(claimed.id, terminals[i].id, "un terminal ya evaluado no debe monopolizar los reclamos");
        const { state } = await orchestrator.run(claimed, { trips: [] }, async (saved) => {
          const persisted = await prisma.whatsAppBurst.updateMany({ where: { id: claimed.id, revision: claimed.revision, leaseId: claimed.leaseId }, data: { state: JSON.parse(JSON.stringify(saved)) } });
          assert.equal(persisted.count, 1, "el checkpoint conserva fencing por revisión y lease");
        });
        assert.equal(state.evaluatedRevision, claimed.revision);
        await restartedStore.finish(claimed, state, terminals[i].question);
        if (i === 0) await restartedStore.finish(claimed, state, terminals[i].question);
        const persisted = await prisma.whatsAppBurst.findUniqueOrThrow({ where: { id: terminals[i].id } });
        assert.equal(persisted.status, "WAITING");
        assert.equal((persisted.state as { evaluatedRevision?: number }).evaluatedRevision, revision);
        assert.equal((persisted.state as { question?: string }).question, terminals[i].question);
        assert.equal(await prisma.whatsAppBurstReply.count({ where: { burstId: terminals[i].id, revision } }), 1);
        await prisma.whatsAppBurstReply.updateMany({ where: { burstId: terminals[i].id, revision }, data: { status: "SENT" } });
        assert.equal(await prisma.whatsAppAgentOperation.count({ where: { burstId: terminals[i].id } }), 0);
      }
      const postRestartStore = new PrismaBurstStore(prisma, { claimVersions: [3] });
      assert.equal(await postRestartStore.claim(3).then((rows) => rows.length), 0, "un restart no vuelve a reclamar terminales sin revisión nueva");
      assert.equal(await prisma.supplierCapture.count({ where: { createdById: userId } }), 0);
    });

    await t.test("webhook offline Foto-1/Audio-1/Foto-2/Audio-2 genera dos borradores, con una aclaración libre", async () => {
      let downloads = 0; let ocr = 0; let transcripts = 0; let interpretations = 0;
      const sent: string[] = []; const deferred: Array<() => Promise<void>> = [];
      const reader = new BurstReader({
        storage,
        client: { async getMedia({ message }) { downloads++; const ordinal = message.key.id === "p1" || message.key.id === "a1" ? 1 : 2; return { bytes: message.message.imageMessage ? new Uint8Array([0xff, 0xd8, 0xff, ordinal]) : new Uint8Array([...new TextEncoder().encode("OggS"), ordinal]), mimeType: message.message.imageMessage ? "image/jpeg" : "audio/ogg" }; } },
        analyzer: { async readImage(bytes) { ocr++; return bytes.at(-1) === 1 ? "Alfa Tools" : "Beta Medical"; }, async segmentAudio(text) { return { segments: [text], confident: true }; } },
        transcription: { async transcribe({ bytes }) { transcripts++; return { text: bytes.at(-1) === 1 ? "Esta fábrica de la foto anterior: FOB USD 7/unidad" : "La tarjeta anterior: MOQ 300 unidades", model: "test-voxtral" }; } },
        extraction: { async extractReading(text, source) { return { extractedFields: { ...(text.includes("Alfa Tools") ? { companyName: "Alfa Tools" } : {}), ...(text.includes("Beta Medical") ? { companyName: "Beta Medical" } : {}), ...(text.includes("FOB") ? { fob: { amount: 7, currency: "USD", unit: "unidad", rawText: "FOB USD 7/unidad" } } : {}), ...(text.includes("MOQ") ? { moq: { quantity: 300, unit: "unidades", notes: null, rawText: "MOQ 300 unidades" } } : {}) }, reviewFields: [], evidence: [], rawSource: source }; } },
        mistral: { async post() { return { choices: [{ message: { content: JSON.stringify({ visual: "Tarjeta impresa", kind: "BUSINESS_CARD" }) } }] }; } },
      });
      const interpreter = new MistralBurstInterpreter({ async post(_path, body) {
        interpretations++;
        const input = JSON.parse((body as { messages: Array<{ content: string }> }).messages[1].content) as { evidence: Array<{ id: string; type: string; text: string | null; segments: Array<{ id: string; candidate?: unknown }> }>; previous: { question: string; groups: Array<{ id: string }> } };
        // The logical phase runs only after every original has both a reading and extracted facts.
        assert.equal(input.evidence.filter((e) => e.type !== "TEXT").length, 4);
        assert.deepEqual(input.evidence.slice(0, 4).map((e) => e.type), ["IMAGE", "AUDIO", "IMAGE", "AUDIO"]);
        assert.ok(input.evidence.slice(0, 4).every((e) => e.segments[0].candidate));
        const answer = input.evidence.find((e) => e.text?.includes("primeras dos"));
        if (answer) assert.match(input.previous.question, /¿Para qué empresa/);
        const groups = [[0, 1], [2, 3]].map(([a, b], i) => ({ id: input.previous.groups[i]?.id, name: i === 0 ? "Alfa Tools" : "Beta Medical", refs: [input.evidence[a].segments[0].id, input.evidence[b].segments[0].id], companyId: answer ? companyIds[i === 0 ? 1 : 0] : null, certain: true, reason: "El audio refiere la tarjeta anterior con descripción compatible" }));
        return { choices: [{ message: { content: JSON.stringify({ tripId, groups, controlIds: answer ? [answer.id] : [], pendingRefs: [] }) } }] };
      } });
      const service = () => new WhatsAppBurstService({ store: new PrismaBurstStore(prisma), reader, interpreter, materialize, send: async (_phone, text) => { sent.push(text); } });
      // Reverse delivery order, with duplicated events in parallel, preserves source order.
      await Promise.all(["a2", "p1", "a1", "p2", "p1", "a2"].map(async (id) => {
        const e = envelope(id, id.startsWith("p") ? "IMAGE" : "AUDIO", null, ["p1", "a1", "p2", "a2"].indexOf(id) + 1);
        const response = await handleBurstWebhook({ event: "MESSAGES_UPSERT", instance, data: { key: e.media!.key, message: e.media!.message, messageTimestamp: ["p1", "a1", "p2", "a2"].indexOf(id) + 1 } }, instance, service, (work) => deferred.push(work), async () => {});
        assert.equal(response?.status, 200);
      }));
      assert.equal(downloads, 0, "No leer ni decidir por webhook individual");
      assert.equal(await prisma.whatsAppBurstMessage.count({ where: { instance } }), 4);
      await due();
      await Promise.all([service().processDue(1), service().processDue(1)]);
      assert.equal(sent.length, 1);
      assert.equal(sent[0].match(/¿Para qué empresa/g)?.length, 1);
      assert.equal(await prisma.supplierCapture.count({ where: { createdById: userId } }), 0);
      const waiting = await prisma.whatsAppBurst.findFirstOrThrow({ where: { instance } });
      assert.equal(waiting.status, "WAITING");
      const response = await handleBurstWebhook({ event: "MESSAGES_UPSERT", instance, data: { key: { id: "answer", remoteJid: `${phone}@s.whatsapp.net`, fromMe: false }, message: { conversation: "las primeras dos por kendal y las ultimas dos por broco" }, messageTimestamp: 5 } }, instance, service, (work) => deferred.push(work), async () => {});
      assert.equal(response?.status, 200);
      await due();
      await Promise.all([service().processDue(1), service().processDue(1)]);
      const drafts = await prisma.supplierCapture.findMany({ where: { createdById: userId }, include: { attachments: true, products: true }, orderBy: { companyName: "asc" } });
      assert.equal(drafts.length, 2);
      assert.deepEqual(drafts.map((d) => d.status), ["DRAFT", "DRAFT"]);
      assert.deepEqual(drafts.map((d) => d.companyId), [companyIds[1], companyIds[0]]);
      assert.deepEqual(drafts.map((d) => d.attachments.length), [2, 2]);
      assert.equal(Number(drafts[0].products[0].fobAmount), 7);
      assert.equal(drafts[1].products[0].moqQuantity, 300);
      assert.ok(drafts.every((d) => d.attachments.find((a) => a.type === "AUDIO")?.transcription));
      assert.deepEqual([downloads, ocr, transcripts, interpretations], [4, 2, 2, 2], "La aclaración reutiliza lecturas persistidas");
      assert.equal(sent.length, 2);
      await store.receive(envelope("answer", "TEXT", "las primeras dos por kendal y las ultimas dos por broco", 5));
      await service().processDue(1);
      assert.equal(sent.length, 2, "Duplicados no reenvían respuestas ni crean otro lote");
      assert.equal((await prisma.whatsAppBurst.findUniqueOrThrow({ where: { id: waiting.id } })).status, "DONE");
    });

    await t.test("WhatsApp agrega producto con foto y audio al proveedor existente sin duplicarlo ni cambiarlo", async () => {
      const originalCapture = await prisma.supplierCapture.findFirstOrThrow({ where: { createdById: userId, companyName: "Alfa Tools" } });
      await prisma.supplierCapture.update({ where: { id: originalCapture.id }, data: { category: "Herramientas", contact: "ventas@alfatools.test" } });
      const confirmed = await captures.confirm({ userId, tripId, companyId: companyIds[1] }, originalCapture.id);
      const before = await prisma.supplier.findUniqueOrThrow({ where: { id: confirmed.supplier.id } });
      const captureCount = await prisma.supplierCapture.count({ where: { createdById: userId } });
      const productWriter = createProductMaterializer({ prisma, storage, attachments, repository, extraction });
      let interpretationCount = 0; let failOnce = true;
      const replies: string[] = [];
      const service = new WhatsAppBurstService({
        store,
        reader: { async read(m, save) {
          if (m.reading?.complete) return m.reading;
          const text = m.envelope.type === "TEXT" ? m.envelope.text! : m.envelope.type === "AUDIO" ? "Este taladro: FOB USD 9 por unidad, MOQ 500 unidades." : "Taladro";
          const reading: BurstReading = { complete: true, segments: [{ id: `${m.id}:1`, text, candidate: { extractedFields: m.envelope.type === "AUDIO" ? { fob: { amount: 9, currency: "USD", unit: "unidad", rawText: "FOB USD 9 por unidad" }, moq: { quantity: 500, unit: "unidades", notes: null, rawText: "MOQ 500 unidades" } } : {}, evidence: [], reviewFields: [], rawSource: { type: "TEXT" as const, text } } }], ...(m.envelope.type !== "TEXT" ? { storageKey: `whatsapp/product-test/${m.id}`, mimeType: m.envelope.type === "AUDIO" ? "audio/ogg" : "image/jpeg", ...(m.envelope.type === "AUDIO" ? { transcript: text, model: "test" } : { ocr: text }) } : {}) };
          if (reading.storageKey) objects.set(reading.storageKey, m.envelope.type === "AUDIO" ? new TextEncoder().encode("OggS-test-product") : new Uint8Array([0xff, 0xd8, 0xff]));
          await save(reading); return reading;
        } },
        interpreter: new MistralBurstInterpreter({ async post(_path, body) {
          interpretationCount++;
          const context = JSON.parse((body as { messages: Array<{ content: string }> }).messages[1].content);
          assert.ok(context.catalog.trips[0].suppliers.some((s: { id: string }) => s.id === before.id));
          return { choices: [{ message: { content: JSON.stringify({ tripId, groups: [{ kind: "PRODUCT", name: "Alfa Tools", supplierQuery: "Alfa Tools", supplierId: before.id, productName: "Taladro", refs: context.evidence.map((m: { segments: Array<{ id: string }> }) => m.segments[0].id), companyId: null, certain: true, reason: "Solicitud explícita y foto/audio complementan el taladro" }], controlIds: [], pendingRefs: [] }) } }] };
        } }),
        async materialize(batch, group) {
          const saved = await productWriter(batch, group);
          if (failOnce) { failOnce = false; throw new Error("Simulated crash after product persisted"); }
          return saved;
        },
        async send(_phone, text) { replies.push(text); },
      });
      await store.receive(envelope("add-product-text", "TEXT", "Agregá producto Taladro al proveedor Alfa Tools.", 1));
      await store.receive(envelope("add-product-photo", "IMAGE", null, 2));
      await store.receive(envelope("add-product-audio", "AUDIO", null, 3));
      await due(); await service.processDue(1);
      const burst = await prisma.whatsAppBurst.findFirstOrThrow({ where: { instance, status: "COMMITTING" } });
      await prisma.whatsAppBurst.update({ where: { id: burst.id }, data: { dueAt: new Date(0) } });
      await service.processDue(1);
      const product = await prisma.supplierProduct.findFirstOrThrow({ where: { supplierId: before.id, name: "Taladro" }, include: { images: true } });
      assert.equal(product.status, "CONFIRMED");
      assert.equal(product.captureId, originalCapture.id);
      assert.equal(Number(product.fobAmount), 9); assert.equal(product.moqQuantity, 500);
      assert.equal(product.images.length, 2); assert.ok(product.images.some((a) => a.transcription));
      assert.equal(await prisma.supplierProduct.count({ where: { supplierId: before.id, name: "Taladro" } }), 1);
      assert.equal(await prisma.supplierCapture.count({ where: { createdById: userId } }), captureCount);
      assert.deepEqual(await prisma.supplier.findUniqueOrThrow({ where: { id: before.id } }), before);
      assert.equal((await prisma.supplierCapture.findUniqueOrThrow({ where: { id: originalCapture.id } })).needsReanalysis, false);
      assert.equal(interpretationCount, 1); assert.equal(replies.length, 1);
      assert.match(replies[0], /1 producto cargado/);
      assert.ok(!replies[0].includes("borrador"));
      assert.match(product.sourceText!, /FOB USD 9/);
      await prisma.supplierProduct.update({ where: { id: product.id }, data: productUpdateData(product, { confirm: true }) });
      assert.equal((await prisma.supplierProduct.findUniqueOrThrow({ where: { id: product.id } })).status, "CONFIRMED");
      await store.receive(envelope("add-product-text", "TEXT", "Agregá producto Taladro al proveedor Alfa Tools.", 1));
      await service.processDue(1);
      assert.equal(replies.length, 1);
      assert.equal(await prisma.supplierProduct.count({ where: { supplierId: before.id, name: "Taladro" } }), 1);
      // A write cannot target a supplier in another company, even if its ID is known.
      const snapshot = { id: "invalid-product", instance, phone, userId, revision: 1, status: "COMMITTING", leaseId: null, state: { tripId, groups: [], question: null, controlIds: [], pendingRefs: [] }, messages: [] };
      await assert.rejects(productWriter(snapshot, { id: "invalid-group", kind: "PRODUCT", name: null, refs: [], companyId: companyIds[0], supplierId: before.id, certain: true, reason: "Invalid fixture" }), /no autorizado/);
    });

    await t.test("una nueva evidencia durante la interpretación invalida la reserva antes de escribir", async () => {
      await store.receive(envelope("race-1", "TEXT", "Alfa Tools")); await due();
      const [claimed] = await store.claim(1);
      const state: BurstState = { ...claimed.state, evaluatedRevision: claimed.revision, groups: [], order: claimed.messages.map((m) => m.id) };
      await store.receive(envelope("race-2", "TEXT", "FOB USD 8", 2));
      assert.equal(await store.reserve(claimed, state), false);
      await store.retry(claimed); await due();
      const [next] = await store.claim(1);
      assert.equal(next.messages.length, 2);
      assert.equal(next.revision, 2);
      await store.reserve(next, { ...state, evaluatedRevision: next.revision });
      next.status = "COMMITTING";
      await store.finish(next, { ...state, evaluatedRevision: next.revision }, "");
    });

    await t.test("un audio dividido en dos proveedores se copia por captura; borrar uno conserva el otro", async () => {
      await store.receive(envelope("multi", "AUDIO", null)); await due();
      const [batch] = await store.claim(1);
      const m = batch.messages[0];
      const body = new TextEncoder().encode("OggS-original-multi"); const key = `whatsapp/test/${randomUUID()}`;
      objects.set(key, body);
      m.reading = { complete: true, storageKey: key, mimeType: "audio/ogg", transcript: "Alfa Tools para Kendal. Beta Medical para Broco.", model: "test", segments: [{ id: `${m.id}:1`, text: "Alfa Tools para Kendal.", candidate: { extractedFields: { companyName: "Alfa Tools" }, reviewFields: [], evidence: [], rawSource: { type: "AUDIO_TRANSCRIPT", text: "Alfa Tools para Kendal." } } }, { id: `${m.id}:2`, text: "Beta Medical para Broco.", candidate: { extractedFields: { companyName: "Beta Medical" }, reviewFields: [], evidence: [], rawSource: { type: "AUDIO_TRANSCRIPT", text: "Beta Medical para Broco." } } }] };
      await store.saveReading(m.id, m.reading);
      const plan = validateBurstPlan({ tripId, groups: m.reading.segments.map((s, i) => ({ name: i === 0 ? "Alfa Tools" : "Beta Medical", refs: [s.id], companyId: companyIds[i === 0 ? 1 : 0], certain: true, reason: "Proveedor y empresa explícitos en cada fragmento" })), controlIds: [], pendingRefs: [] }, batch, await store.catalog(userId));
      assert.equal(await store.reserve(batch, plan), true); batch.state = plan;
      for (const group of plan.groups) group.captureId = await materialize(batch, group);
      const audioCopies = await prisma.supplierAttachment.findMany({ where: { supplierCaptureId: { in: plan.groups.map((g) => g.captureId!) } } });
      assert.equal(audioCopies.length, 2);
      assert.notEqual(audioCopies[0].storageKey, audioCopies[1].storageKey);
      assert.equal(audioCopies[0].transcription, audioCopies[1].transcription);
      await attachments.delete({ userId, tripId }, audioCopies[0].supplierCaptureId, audioCopies[0].id);
      assert.ok(objects.has(audioCopies[1].storageKey));
      await store.finish(batch, plan, "");
    });

    await t.test("un error después de reservar libera el lease y retoma la misma decisión", async () => {
      await store.receive(envelope("reserved-retry")); await due();
      const [first] = await store.claim(1);
      const state: BurstState = { ...first.state, evaluatedRevision: first.revision };
      assert.equal(await store.reserve(first, state), true); first.status = "COMMITTING";
      await store.retry(first);
      await prisma.whatsAppBurst.update({ where: { id: first.id }, data: { dueAt: new Date(0) } });
      const [resumed] = await store.claim(1);
      assert.ok(resumed, "Una reserva con lease liberado debe volver a reclamarse");
      assert.equal(resumed.status, "COMMITTING");
      assert.deepEqual(resumed.state, state);
      await store.finish(resumed, resumed.state, "");
    });

    await t.test("reinicio tras reserva y mensaje nuevo no pierde la revisión ni finaliza prematuramente", async () => {
      await store.receive(envelope("restart-1")); await due();
      const [first] = await store.claim(1);
      const state: BurstState = { ...first.state, evaluatedRevision: first.revision, order: [first.messages[0].id] };
      assert.equal(await store.reserve(first, state), true);
      await store.receive(envelope("restart-2", "TEXT", "más información", 2));
      await prisma.whatsAppBurst.update({ where: { id: first.id }, data: { leaseUntil: new Date(0), dueAt: new Date(0) } });
      const [resumed] = await store.claim(1);
      assert.equal(resumed.status, "COMMITTING");
      assert.equal(resumed.revision, 2);
      await store.finish(resumed, resumed.state, "No enviar una respuesta de revisión vieja");
      assert.equal((await prisma.whatsAppBurst.findUniqueOrThrow({ where: { id: first.id } })).status, "OPEN");
      assert.equal(await prisma.whatsAppBurstReply.count({ where: { burstId: first.id } }), 0);
      await due(); const [next] = await store.claim(1);
      await store.finish(next, { ...next.state, evaluatedRevision: next.revision }, "");
    });

    await t.test("ambigüedad parcial guarda la carga clara y conserva la otra para aclarar", async () => {
      await store.receive(envelope("partial-1", "TEXT", "Alfa Tools para Kendal"));
      await store.receive(envelope("partial-2", "TEXT", "Beta Medical para Broco", 2));
      await due();
      const [batch] = await store.claim(1);
      for (const m of batch.messages) {
        m.reading = { complete: true, segments: [{ id: `${m.id}:1`, text: m.envelope.text!, candidate: { extractedFields: { companyName: m.envelope.text!.startsWith("Alfa") ? "Alfa Tools" : "Beta Medical" }, reviewFields: [], evidence: [], rawSource: { type: "TEXT", text: m.envelope.text! } } }] };
        await store.saveReading(m.id, m.reading);
      }
      const plan = validateBurstPlan({ tripId, groups: [{ name: "Alfa Tools", refs: [batch.messages[0].reading!.segments[0].id], companyId: companyIds[1], certain: true, reason: "Nombre y empresa explícitos" }], controlIds: [], pendingRefs: [batch.messages[1].reading!.segments[0].id] }, batch, await store.catalog(userId));
      await store.reserve(batch, plan); batch.state = plan;
      const before = await prisma.supplierCapture.count({ where: { createdById: userId } });
      plan.groups[0].captureId = await materialize(batch, plan.groups[0]);
      assert.equal(await prisma.supplierCapture.count({ where: { createdById: userId } }), before + 1);
      assert.match(plan.question!, /mensaje 2/);
      await store.finish(batch, plan, plan.question!);
      assert.equal((await prisma.whatsAppBurst.findUniqueOrThrow({ where: { id: batch.id } })).status, "WAITING");
      // Delivery failure retries the same durable reply; successful delivery consumes it once.
      let attempts = 0;
      await store.flushReplies(async () => { attempts++; throw new Error("temporary transport failure"); });
      await store.flushReplies(async () => { attempts++; });
      await store.flushReplies(async () => { assert.fail("No reenviar respuestas completadas"); });
      assert.equal(attempts, 2);
      await store.receive(envelope("partial-answer", "TEXT", "la segunda es otra carga por Broco", 3)); await due();
      const [next] = await store.claim(1);
      assert.equal(next.state.groups[0].captureId, plan.groups[0].captureId);
      assert.equal(next.messages.length, 3);
      // Settle this fixture without discarding persisted originals.
      await store.finish(next, { ...next.state, question: null, evaluatedRevision: next.revision }, "");
    });

    await t.test("fallos repetidos conservan inbox y piden reintentar una sola vez", async () => {
      await store.receive(envelope("failed-medium", "AUDIO", null));
      const replies: string[] = [];
      const failing = new WhatsAppBurstService({ store, reader: { async read() { throw new Error("temporary media failure"); } }, interpreter: { async interpret() { assert.fail("No decidir con lecturas faltantes"); } }, async materialize() { assert.fail("No crear borrador parcial con medio sin leer"); }, async send(_phone, text) { replies.push(text); } });
      for (let attempt = 0; attempt < 5; attempt++) { await due(); await failing.processDue(1); }
      const batch = await prisma.whatsAppBurst.findFirstOrThrow({ where: { instance, status: "WAITING" } });
      assert.equal(await prisma.whatsAppBurstMessage.count({ where: { burstId: batch.id } }), 1);
      assert.equal(replies.length, 1); assert.match(replies[0], /reintentar/);
      await failing.processDue(1); assert.equal(replies.length, 1);
      await store.receive(envelope("retry-command", "TEXT", "reintentar", 2));
      assert.equal((await prisma.whatsAppBurst.findUniqueOrThrow({ where: { id: batch.id } })).status, "OPEN");
      await due(); const [next] = await store.claim(1);
      assert.equal(next.messages.length, 2);
      await store.finish(next, { ...next.state, question: null, evaluatedRevision: next.revision }, "");
    });

    await t.test("revocación de membresía y usuario sólo ADMIN no acceden a captura por WhatsApp", async () => {
      await prisma.tripMember.update({ where: { tripId_userId: { tripId, userId } }, data: { role: "ADMIN" } });
      assert.equal((await store.catalog(userId)).trips.length, 0);
      assert.equal(await store.receive(envelope("unauthorized")), false);
      await prisma.tripMember.update({ where: { tripId_userId: { tripId, userId } }, data: { role: "TRAVELER" } });
      await prisma.tripCompanyMember.delete({ where: { companyId_userId: { companyId: companyIds[1], userId } } });
      assert.deepEqual((await store.catalog(userId)).trips[0].companies.map((c) => c.id), [companyIds[0]]);
    });
  } finally {
    await prisma.whatsAppBurst.deleteMany({ where: { userId } });
    await prisma.supplier.deleteMany({ where: { createdById: userId } });
    await prisma.supplierCapture.deleteMany({ where: { createdById: userId } });
    await prisma.trip.delete({ where: { id: tripId } });
    await prisma.company.deleteMany({ where: { id: { in: catalogIds } } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  }
});
