import test from "node:test";
import assert from "node:assert/strict";
import { createEvolutionClient, EvolutionRequestError, EvolutionTimeoutError } from "../../lib/channels/evolution/client.ts";
import { parseEvolutionWebhook } from "../../lib/channels/evolution/webhook.ts";
import { supplierList, supplierRowId, selectedSupplierNumber, sendSupplierReply, type ReplyContext } from "../../lib/channels/whatsapp/supplier-picker.ts";
import { agentState } from "../../lib/channels/whatsapp/agent-contract.ts";
const context = (): ReplyContext => {
  const state = agentState({ tripId: "trip", groups: [], question: "¿De qué proveedor?\n1. Broco", controlIds: [], pendingRefs: [] });
  state.agent.pending = { type: "CLARIFICATION", supplierPicker: true, text: "¿De qué proveedor?", products: [{ name: "sillas de plastico" }], options: [{ id: "supplier-broco", label: "Broco · Broco Solutions · Rosario" }], revision: 2 };
  return { burstId: "burst", revision: 2, state };
};
test("lista de proveedores: abre menú, distingue empresa/ciudad y conserva números si hay fallback", async () => {
  const c = context(); const input = supplierList("549111", c.state.question!, c)!;
  assert.equal(input.buttonText, "Elegir proveedor"); assert.equal(input.sections[0].rows[0].title, "Broco"); assert.match(input.sections[0].rows[0].description, /Rosario/);
  assert.equal(selectedSupplierNumber(input.sections[0].rows[0].rowId, c), "1");
  assert.equal(selectedSupplierNumber(input.sections[0].rows[0].rowId, { ...c, revision: 3 }), null);
  assert.equal(selectedSupplierNumber(input.sections[0].rows[0].rowId, { ...c, burstId: "other" }), null);
  assert.equal(selectedSupplierNumber("supplier-broco", c), null);
  c.state.agent.pending!.text = "¿A cuál Broco?"; assert.ok(supplierList("549111", "¿A cuál Broco?", c));
  c.state.agent.pending!.supplierPicker = false; assert.equal(supplierList("549111", "Empresa", c), null);
});
test("sendList usa formato v2 y endpoint correcto", async () => {
  const calls: Array<{url: string; body: unknown}> = [];
  const client = createEvolutionClient({ apiUrl: "https://evolution.test", apiKey: "key", instance: "nihao", fetch: async (url, init) => { calls.push({ url: String(url), body: JSON.parse(String(init?.body)) }); return new Response(null, { status: 201 }); } });
  const c=context(); await sendSupplierReply(client,"549111",c.state.question!,c);
  assert.equal(calls.length,1); assert.equal(calls[0].url,"https://evolution.test/message/sendList/nihao"); assert.equal((calls[0].body as {buttonText:string}).buttonText,"Elegir proveedor");
});
test("sólo rechazo definido de listas usa texto; timeout conserva outbox para reintentar", async () => {
  const c=context(); let sent=0;
  const client={ async sendText(){sent++;}, async sendList(){throw new EvolutionRequestError(400);} };
  await sendSupplierReply(client,"phone",c.state.question!,c); assert.equal(sent,1);
  await assert.rejects(sendSupplierReply({...client,async sendList(){throw new EvolutionTimeoutError();}},"phone",c.state.question!,c),EvolutionTimeoutError); assert.equal(sent,1);
});
test("respuestas de lista y native flow preservan ID estable, no confían en etiqueta", () => {
  for (const message of [{ listResponseMessage: {title:"Broco",singleSelectReply:{selectedRowId:supplierRowId("burst",2,0)}} }, { interactiveResponseMessage: {nativeFlowResponseMessage:{paramsJson:JSON.stringify({id:supplierRowId("burst",2,0)})}} }]) {
    const result=parseEvolutionWebhook({event:"MESSAGES_UPSERT",instance:"nihao",data:{key:{id:"tap",remoteJid:"549111@s.whatsapp.net",fromMe:false},message}},"nihao"); assert.equal(result.kind,"message"); if(result.kind==="message"){assert.equal(result.message.type,"TEXT");assert.equal(result.message.selectionId,supplierRowId("burst",2,0));}
  }
});
test("la lista limita filas a 10 y permite escribir otro nombre", () => {
  const c=context();c.state.agent.pending!.options=Array.from({length:20},(_,i)=>({id:`s${i}`,label:`Proveedor ${i} · Broco · Ciudad`}));
  const list=supplierList("phone",c.state.question!,c)!;assert.equal(list.sections[0].rows.length,10);assert.match(list.footerText,/10/);assert.match(list.description,/escribir/);assert.equal(selectedSupplierNumber(supplierRowId("burst",2,10),c),null);
});
