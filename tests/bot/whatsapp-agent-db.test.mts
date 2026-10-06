import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createAgentEnvironment, localAgentDatabase } from "../../evals/whatsapp-agent/environment.ts";
import { PRODUCT_CATALOG } from "../../evals/whatsapp-products/cases.ts";
import { agentState, AgentSuperseded, type AgentState } from "../../lib/channels/whatsapp/agent-contract.ts";
import { AgentTools } from "../../lib/channels/whatsapp/agent-tools.ts";
import { PrismaBurstStore } from "../../lib/channels/whatsapp/prisma-burst-store.ts";
import { WhatsAppAgentOrchestrator } from "../../lib/channels/whatsapp/agent-orchestrator.ts";
import { WhatsAppAgentService } from "../../lib/channels/whatsapp/agent-service.ts";
import { productUpdateData } from "../../lib/bot/supplier-edit.ts";
import type { BurstSnapshot } from "../../lib/channels/whatsapp/burst-types.ts";

const extraction = { async extractReading(text: string) {
  const days = text.match(/Plazo (\d+) días/iu);
  const price = text.match(/FOB USD (\d+)/iu); const moq = text.match(/MOQ (\d+)/iu);
  return { extractedFields: { ...(days ? { leadTime: { days: Number(days[1]), rawText: days[0] } } : {}), ...(text.includes("Nuevo Tools") ? { companyName: "Nuevo Tools" } : {}), ...(price ? { fob: { amount: Number(price[1]), currency: "USD", unit: "unidad", rawText: price[0] } } : {}), ...(moq ? { moq: { quantity: Number(moq[1]), unit: "unidades", notes: null, rawText: moq[0] } } : {}) }, reviewFields: [], evidence: [], rawSource: { type: "TEXT" as const, text } };
} };

test("v3 PostgreSQL: operaciones, aprobación, recuperación y aislamiento", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async (t) => {
  const prisma = localAgentDatabase(); const env = await createAgentEnvironment(prisma, PRODUCT_CATALOG);
  async function setup(text: string) {
    await prisma.whatsAppBurst.updateMany({ where: { userId: env.userId }, data: { status: "DONE" } });
    const suffix = randomUUID(); const messageId = `${env.prefix}-${suffix}`;
    const snapshot: BurstSnapshot = { id: `${env.prefix}-${suffix}-burst`, userId: env.userId, instance: "agent-eval", phone: "5491112345678", version: 3, revision: 1, leaseId: "lease", status: "PROCESSING", state: { tripId: null, groups: [], question: null, controlIds: [], pendingRefs: [] }, messages: [{ id: messageId, sequence: 1, sentAt: null, envelope: { instance: "agent-eval", messageId, phone: "5491112345678", type: "TEXT", text, media: null, sentAt: null }, reading: { complete: true, segments: [{ id: `${messageId}:1`, text }] } }] };
    await env.persist(snapshot); const state = agentState(snapshot.state); snapshot.state = state;
    const tools = new AgentTools({ domain: env.domain, extraction, catalog: env.catalog, async checkpoint(s) { snapshot.state = s; await env.save(snapshot, s); } });
    await tools.execute("get_context", {}, snapshot, state);
    const prepare = async (quote?: string, role = "FACTS") => {
      const result = await tools.execute("prepare_evidence", { sources: [{ messageId, ...(quote ? { quote } : {}), role }] }, snapshot, state) as { evidence: Array<{ id: string }> }; return result.evidence.map((e) => e.id);
    };
    return { snapshot, state, tools, prepare };
  }
  async function advance(snapshot: BurstSnapshot, state: AgentState, text: string) {
    snapshot.revision++; const id = randomUUID();
    snapshot.messages.push({ id, sequence: snapshot.revision, sentAt: null, envelope: { instance: "agent-eval", messageId: id, phone: snapshot.phone, type: "TEXT", text, media: null, sentAt: null }, reading: { complete: true, segments: [{ id: `${id}:1`, text }] } });
    await prisma.whatsAppBurst.update({ where: { id: snapshot.id }, data: { revision: snapshot.revision, state: JSON.parse(JSON.stringify(state)) } });
  }
  try {
    await t.test("reintentos concurrentes crean un producto y un recibo", async () => {
      const s = await setup("Agregá producto Taladro a Alfa Tools. FOB USD 9 por unidad. MOQ 500 unidades.");
      await s.tools.execute("get_supplier", { id: env.id("supplier-alfa") }, s.snapshot, s.state);
      const args = { supplierId: env.id("supplier-alfa"), name: "Taladro", evidenceIds: await s.prepare() };
      const [a, b] = await Promise.all([s.tools.execute("create_product_draft", args, s.snapshot, s.state), s.tools.execute("create_product_draft", args, s.snapshot, s.state)]);
      assert.deepEqual(a, b);
      assert.equal(await prisma.whatsAppAgentOperation.count({ where: { burstId: s.snapshot.id } }), 1);
      assert.equal(await prisma.supplierProduct.count({ where: { name: "Taladro", supplierId: env.id("supplier-alfa") } }), 1);
    });
    await t.test("dos productos de un audio conservan condiciones distintas y contexto compartido", async () => {
      const s = await setup("Alfa Tools. Producto Martillo: FOB USD 3 por unidad, MOQ 200 unidades. Producto Sierra: FOB USD 6 por unidad, MOQ 400 unidades.");
      await s.tools.execute("get_supplier", { id: env.id("supplier-alfa") }, s.snapshot, s.state);
      const context = await s.prepare("Alfa Tools.", "CONTEXT");
      for (const [name, quote] of [["Martillo", "Producto Martillo: FOB USD 3 por unidad, MOQ 200 unidades."], ["Sierra", "Producto Sierra: FOB USD 6 por unidad, MOQ 400 unidades."]]) {
        await s.tools.execute("create_product_draft", { supplierId: env.id("supplier-alfa"), name, evidenceIds: [...context, ...await s.prepare(quote)] }, s.snapshot, s.state);
      }
      const records = await prisma.supplierProduct.findMany({ where: { name: { in: ["Martillo", "Sierra"] }, supplierId: env.id("supplier-alfa") }, orderBy: { name: "asc" } });
      assert.deepEqual(records.map((p) => [p.name, Number(p.fobAmount), p.moqQuantity]), [["Martillo", 3, 200], ["Sierra", 6, 400]]);
    });
    await t.test("proveedor nuevo y producto quedan DRAFT sin producto implícito adicional", async () => {
      const s = await setup("Nuevo Tools para Broco Solutions. Producto Lámpara: FOB USD 7 por unidad, MOQ 100 unidades.");
      const evidenceIds = await s.prepare();
      const supplier = await s.tools.execute("create_supplier_draft", { tripId: env.id("trip-china"), companyId: env.id("broco"), evidenceIds }, s.snapshot, s.state) as { id: string };
      assert.equal(await prisma.supplierProduct.count({ where: { captureId: supplier.id } }), 0);
      await s.tools.execute("create_product_draft", { supplierId: supplier.id, name: "Lámpara", evidenceIds }, s.snapshot, s.state);
      const p = await prisma.supplierProduct.findFirstOrThrow({ where: { captureId: supplier.id } });
      assert.equal(p.supplierId, null); assert.equal(p.status, "DRAFT");
      await prisma.whatsAppBurst.update({ where: { id: s.snapshot.id }, data: { status: "DONE" } });
    });
    for (const scenario of ["approve", "cancel", "conflict", "expire"] as const) await t.test(`edición confirmada: ${scenario}`, async () => {
      const p = await prisma.supplierProduct.create({ data: { captureId: env.id("capture-alfa"), supplierId: env.id("supplier-alfa"), name: "Taladro", status: "CONFIRMED", fobAmount: 9, fobCurrency: "USD", fobUnit: "unidad", moqQuantity: 500 } });
      const s = await setup("Actualizá el Taladro de Alfa Tools a FOB USD 7 por unidad.");
      await s.tools.execute("get_product", { id: p.id }, s.snapshot, s.state);
      const proposal = await s.tools.execute("update_product", { id: p.id, patch: { fob: { amount: 7 } }, evidenceIds: await s.prepare() }, s.snapshot, s.state) as { operationId: string };
      assert.equal(Number((await prisma.supplierProduct.findUniqueOrThrow({ where: { id: p.id } })).fobAmount), 9);
      await assert.rejects(env.domain.resolve(s.snapshot, proposal.operationId, false), /respuesta explícita/);
      await prisma.whatsAppBurstReply.create({ data: { burstId: s.snapshot.id, revision: 1, status: "SENT", text: s.state.question! } });
      await env.domain.displayed(s.snapshot, proposal.operationId);
      await advance(s.snapshot, s.state, scenario === "cancel" ? "cancelar" : "sí");
      if (scenario === "conflict") await prisma.supplierProduct.update({ where: { id: p.id }, data: { moqQuantity: 800, updatedAt: new Date(Date.now() + 5000) } });
      if (scenario === "expire") await prisma.whatsAppAgentOperation.update({ where: { id: proposal.operationId }, data: { expiresAt: new Date(0) } });
      const result = await env.domain.resolve(s.snapshot, proposal.operationId, scenario === "cancel");
      const final = await prisma.supplierProduct.findUniqueOrThrow({ where: { id: p.id } });
      assert.equal(Number(final.fobAmount), scenario === "approve" ? 7 : 9);
      assert.equal(final.moqQuantity, scenario === "conflict" ? 800 : 500);
      assert.equal(result.status, { approve: "COMPLETED", cancel: "CANCELLED", conflict: "STALE", expire: "EXPIRED" }[scenario]);
      await prisma.whatsAppBurst.update({ where: { id: s.snapshot.id }, data: { status: "DONE" } });
    });
    await t.test("edición parcial conserva MOQ, moneda y plazo", async () => {
      const p = await prisma.supplierProduct.findFirstOrThrow({ where: { supplierId: env.id("supplier-alfa"), moqQuantity: 500 } });
      const data = productUpdateData(p, { fob: { amount: 10 } });
      assert.equal(data.moqQuantity, 500); assert.equal(data.fobCurrency, "USD");
    });
    await t.test("revisión nueva invalida una escritura antes de ejecutarla", async () => {
      const s = await setup("Producto Guante a Beta Medical. FOB USD 2 por unidad.");
      await s.tools.execute("get_supplier", { id: env.id("supplier-beta") }, s.snapshot, s.state);
      const evidenceIds = await s.prepare();
      await prisma.whatsAppBurst.update({ where: { id: s.snapshot.id }, data: { revision: 2 } });
      await assert.rejects(s.tools.execute("create_product_draft", { supplierId: env.id("supplier-beta"), name: "Guante", evidenceIds }, s.snapshot, s.state), AgentSuperseded);
      assert.equal(await prisma.whatsAppAgentOperation.count({ where: { burstId: s.snapshot.id } }), 0);
    });
    await t.test("fallo de copia del medio se recupera sin duplicar producto ni adjunto", async () => {
      const s = await setup("Producto Llave a Alfa Tools. FOB USD 4 por unidad.");
      const bytes = new Uint8Array(await readFile("evals/whatsapp-batches/fixtures/img-alfa-product.png"));
      await env.storage.put({ key: "original", body: bytes, contentType: "image/png" });
      s.snapshot.messages[0].reading!.storageKey = "original"; s.snapshot.messages[0].reading!.mimeType = "image/png"; s.snapshot.messages[0].envelope.type = "IMAGE";
      await s.tools.execute("get_supplier", { id: env.id("supplier-alfa") }, s.snapshot, s.state);
      const evidenceIds = await s.prepare();
      const put = env.storage.put.bind(env.storage); let fail = true;
      env.storage.put = async (input) => { await put(input); if (fail) { fail = false; throw new Error("copy interrupted"); } };
      await assert.rejects(s.tools.execute("create_product_draft", { supplierId: env.id("supplier-alfa"), name: "Llave", evidenceIds }, s.snapshot, s.state), /copy interrupted/);
      assert.equal((await prisma.whatsAppAgentOperation.findFirstOrThrow({ where: { burstId: s.snapshot.id } })).status, "WRITTEN");
      const recovered = await env.domain.receipts(s.snapshot); assert.equal(recovered[0].status, "COMPLETED");
      assert.equal(await prisma.supplierProduct.count({ where: { name: "Llave", supplierId: env.id("supplier-alfa") } }), 1);
      assert.equal(await prisma.supplierAttachment.count({ where: { productId: recovered[0].id } }), 1);
      env.storage.put = put;
    });
    await t.test("procesadores reclaman sólo su versión persistida", async () => {
      await prisma.whatsAppBurst.updateMany({ where: { userId: env.userId }, data: { status: "DONE", leaseId: null } });
      const s = await setup("ayuda");
      await prisma.whatsAppBurst.update({ where: { id: s.snapshot.id }, data: { status: "OPEN", leaseId: null, leaseUntil: null } });
      assert.equal((await new PrismaBurstStore(prisma, { claimVersions: [2] }).claim(10)).length, 0);
      assert.equal((await new PrismaBurstStore(prisma, { claimVersions: [3] }).claim(10)).length, 1);
    });
    await t.test("v3 de recepción a respuesta retoma una finalización interrumpida sin repetir modelo o carga", async () => {
      await prisma.whatsAppBurst.updateMany({ where: { userId: env.userId }, data: { status: "DONE", leaseId: null } });
      const user = await prisma.user.findUniqueOrThrow({ where: { id: env.userId } });
      const store = new PrismaBurstStore(prisma, { newVersion: 3, claimVersions: [3] });
      const sent: string[] = []; let calls = 0;
      const orchestrator = new WhatsAppAgentOrchestrator({ domain: env.domain, extraction, client: { async post(_endpoint, body) {
        calls++;
        const messages = (body as { messages: Array<{ content: string }> }).messages;
        const input = JSON.parse(messages[1].content) as { evidence: Array<{ id: string }> };
        let name: string; let args: unknown;
        if (calls === 1) { name = "get_context"; args = {}; }
        else if (calls === 2) { name = "search_suppliers"; args = { tripId: env.id("trip-china"), query: "Alfa Tools" }; }
        else if (calls === 3) { name = "prepare_evidence"; args = { sources: [{ messageId: input.evidence[0].id, quote: null, role: "FACTS" }] }; }
        else if (calls === 4) { name = "create_product_draft"; args = { notes: null, supplierId: env.id("supplier-alfa"), name: "Tornillo", evidenceIds: (JSON.parse(messages.at(-1)!.content) as { evidence: Array<{ id: string }> }).evidence.map((e) => e.id) }; }
        else { name = "finish_turn"; args = { response: null, guidance: null }; }
        return { choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: `call${calls}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] } }] };
      } } });
      const finish = store.finish.bind(store); let interrupted = true;
      store.finish = async (...args) => { if (interrupted) { interrupted = false; throw new Error("finish interrupted"); } await finish(...args); };
      const service = new WhatsAppAgentService({ store, orchestrator, domain: env.domain, async save(id, revision, leaseId, state) { const changed = await prisma.whatsAppBurst.updateMany({ where: { id, revision, leaseId, status: "PROCESSING" }, data: { state: JSON.parse(JSON.stringify(state)) } }); return changed.count === 1; }, reader: { async read(message, save) { const text = message.envelope.text!; const reading = { complete: true, segments: [{ id: `${message.id}:1`, text }] }; await save(reading); return reading; } }, async send(_phone, text) { sent.push(text); } });
      assert.equal(await service.receive({ instance: `agent-eval-${env.prefix}`, phone: user.whatsappPhone!, messageId: randomUUID(), type: "TEXT", text: "Producto Tornillo a Alfa Tools. FOB USD 2 por unidad.", media: null, sentAt: null }), true);
      await prisma.whatsAppBurst.updateMany({ where: { userId: env.userId, status: "OPEN" }, data: { dueAt: new Date(0) } });
      await service.processDue(1); assert.equal(calls, 5); assert.equal(sent.length, 0);
      await prisma.whatsAppBurst.updateMany({ where: { userId: env.userId, status: "OPEN" }, data: { dueAt: new Date(0) } });
      await service.processDue(1); assert.equal(calls, 5); assert.equal(sent.length, 1); assert.match(sent[0], /Tornillo/);
      assert.equal(await prisma.supplierProduct.count({ where: { name: "Tornillo", supplierId: env.id("supplier-alfa") } }), 1);
    });
    await t.test("lote recuperado rechaza condiciones viejas de un producto repetido antes de escribir", async () => {
      const s = await setup("Tengo un vaso de vidrio del proveedor Alfa Tools. FOB USD 30. Plazo 30 días.");
      s.snapshot.state.legacyBatchId = "legacy-inbox";
      await s.tools.execute("get_supplier", { id: env.id("supplier-alfa") }, s.snapshot, s.state);
      const old = await s.prepare();
      await advance(s.snapshot, s.state, "Tengo un vaso de vidrio. FOB USD 30. Plazo 60 días.");
      await assert.rejects(s.tools.execute("create_product_draft", { supplierId: env.id("supplier-alfa"), name: "vaso de vidrio", evidenceIds: old }, s.snapshot, s.state), /versión más reciente/);
      assert.equal(await prisma.whatsAppAgentOperation.count({ where: { burstId: s.snapshot.id } }), 0);
      const latest = await s.tools.execute("prepare_evidence", { sources: [{ messageId: s.snapshot.messages.at(-1)!.id, role: "FACTS" }, { messageId: s.snapshot.messages[0].id, quote: "Alfa Tools", role: "CONTEXT" }] }, s.snapshot, s.state) as { evidence: Array<{ id: string }> };
      await s.tools.execute("create_product_draft", { supplierId: env.id("supplier-alfa"), name: "vaso de vidrio", evidenceIds: latest.evidence.map((e) => e.id) }, s.snapshot, s.state);
      const product = await prisma.supplierProduct.findFirstOrThrow({ where: { name: "vaso de vidrio", supplierId: env.id("supplier-alfa") } });
      assert.equal(product.leadTimeDays, 60); assert.equal(Number(product.fobAmount), 30);
    });
    await t.test("permisos revocados bloquean la escritura y no crean recibos", async () => {
      const s = await setup("Producto Cable a Alfa Tools. FOB USD 1 por unidad.");
      await s.tools.execute("get_supplier", { id: env.id("supplier-alfa") }, s.snapshot, s.state); const evidenceIds = await s.prepare();
      await prisma.tripCompanyMember.deleteMany({ where: { userId: env.userId, companyId: env.id("broco") } });
      await assert.rejects(s.tools.execute("create_product_draft", { supplierId: env.id("supplier-alfa"), name: "Cable", evidenceIds }, s.snapshot, s.state), /autorizado/);
      assert.equal(await prisma.whatsAppAgentOperation.count({ where: { burstId: s.snapshot.id } }), 0);
    });
  } finally { await env.cleanup(); await prisma.$disconnect(); }
});

test("v3 picker PostgreSQL: toque válido se convierte en opción persistida; lista vencida no elige proveedor", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async () => {
  const { supplierRowId } = await import("../../lib/channels/whatsapp/supplier-picker.ts");
  const prisma=localAgentDatabase();const env=await createAgentEnvironment(prisma,PRODUCT_CATALOG);
  try {
    const state=agentState({tripId:env.id("trip-china"),groups:[],question:"¿De qué proveedor?",controlIds:[],pendingRefs:[]});
    state.agent.pending={type:"CLARIFICATION",supplierPicker:true,text:"¿De qué proveedor?",products:[{name:"Taladro"}],options:[{id:env.id("supplier-alfa"),label:"Alfa Tools"}],revision:1};
    const user=await prisma.user.findUniqueOrThrow({where:{id:env.userId}});
    const s:BurstSnapshot={id:`${env.prefix}-burst`,userId:env.userId,instance:`agent-eval-${env.prefix}`,phone:user.whatsappPhone!,version:3,revision:1,leaseId:null,status:"PROCESSING",state,messages:[]};await env.persist(s);
    await prisma.whatsAppBurst.update({where:{id:s.id},data:{phone:user.whatsappPhone!,status:"WAITING"}});
    const store=new PrismaBurstStore(prisma,{newVersion:3,claimVersions:[3]});
    const rowId=supplierRowId(s.id,1,0);
    await store.receive({instance:s.instance,phone:user.whatsappPhone!,messageId:`${env.prefix}-tap`,type:"TEXT",text:"Forged label",media:null,sentAt:null,selectionId:rowId});
    const first=await prisma.whatsAppBurstMessage.findFirstOrThrow({where:{burstId:s.id},orderBy:{sequence:"desc"}});assert.equal((first.envelope as {text:string}).text,"1");
    await store.receive({instance:s.instance,phone:user.whatsappPhone!,messageId:`${env.prefix}-stale`,type:"TEXT",text:"Otro proveedor",media:null,sentAt:null,selectionId:rowId});
    const last=await prisma.whatsAppBurstMessage.findFirstOrThrow({where:{burstId:s.id},orderBy:{sequence:"desc"}});assert.match((last.envelope as {text:string}).text,/ya no está vigente/);
    assert.equal(await prisma.supplierProduct.count({where:{capture:{tripId:env.id("trip-china")}}}),0);
  }finally{await env.cleanup();await prisma.$disconnect();}
});
