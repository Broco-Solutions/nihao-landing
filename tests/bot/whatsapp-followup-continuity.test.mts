import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createAgentEnvironment, localAgentDatabase } from "../../evals/whatsapp-agent/environment.ts";
import { agentState, type AgentState, type AgentEvidence } from "../../lib/channels/whatsapp/agent-contract.ts";
import { buildEvidenceGraph } from "../../lib/channels/whatsapp/evidence-grouping.ts";
import { WhatsAppAgentService } from "../../lib/channels/whatsapp/agent-service.ts";
import { PrismaBurstStore } from "../../lib/channels/whatsapp/prisma-burst-store.ts";
import { matchesProductName, namedProductCandidates, questionAnswer, questionOption, selectedQuestionOption } from "../../lib/channels/whatsapp/followup-resolution.ts";
import type { BurstSnapshot, BurstStore } from "../../lib/channels/whatsapp/burst-types.ts";
import { emptyFocus, focusCandidates } from "../../lib/channels/whatsapp/conversation-context.ts";
import type { ExtractionCandidate } from "../../lib/bot/types.ts";
import { WhatsAppAgentOrchestrator } from "../../lib/channels/whatsapp/agent-orchestrator.ts";

const candidate = (text: string, fields: ExtractionCandidate["extractedFields"] = {}): ExtractionCandidate => ({ extractedFields: fields, evidence: [], reviewFields: [], rawSource: { type: "TEXT", text } });
function snapshot(text: string, fields: ExtractionCandidate["extractedFields"] = {}): BurstSnapshot {
  const id=randomUUID(); return { id:randomUUID(), userId:"user", instance:"followups", phone:"5491112345678", status:"PROCESSING", leaseId:randomUUID(), revision:1, state:agentState({tripId:null,groups:[],question:null,controlIds:[],pendingRefs:[]}), messages:[{id,sequence:1,sentAt:new Date(),envelope:{instance:"followups",phone:"5491112345678",messageId:id,type:"TEXT",text,media:null,sentAt:new Date().toISOString()},reading:{complete:true,segments:[{id:`${id}:1`,text,candidate:candidate(text,fields)}]}}] };
}

test("a numeric answer remains bound when later price text arrives",()=>{
 const s=snapshot("MOQ 1 FOB 50");const state=s.state as AgentState;
 state.agent.pending={type:"CLARIFICATION",revision:1,text:"¿Cuál escritorio?",options:[{id:"qidong",label:"escritorios regulables"}]};
 const answer=snapshot("1").messages[0];answer.sequence=2;const later=snapshot("FOB 30 usd").messages[0];later.sequence=3;s.messages.push(answer,later);s.revision=3;
 assert.equal(questionAnswer(s,state.agent.pending)?.id,answer.id);assert.equal(selectedQuestionOption(s,state.agent.pending)?.id,"qidong");
 state.agent.pending.answer={messageId:answer.id,optionId:"qidong",questionRevision:1};
 assert.equal(selectedQuestionOption(s,state.agent.pending)?.id,"qidong");
});
test("product aliases resolve singular/plural while preserving distinguishing words",()=>{
 assert.equal(matchesProductName("escritorio","escritorios regulables"),true);
 assert.equal(matchesProductName("escritorio fijo","escritorios regulables"),false);
 assert.equal(matchesProductName("botella","botellas térmicas"),true);
 assert.equal(matchesProductName("cámara digital","cámaras digitales"),true);
 assert.equal(matchesProductName("cámara digital","cámara analógica con flash"),false);
});

test("names resolve persisted options and focus excludes products of earlier suppliers", () => {
 const question={type:"CLARIFICATION" as const,revision:1,text:"¿Qué proveedor?",options:[{id:"fenbe",label:"Hangzhou Fenbei Kitchen & Bathroom"}]};
 assert.equal(questionOption(question,"Hangzhou Fenbe kitchen")?.id,"fenbe");
 assert.equal(questionOption(question,"otro proveedor")?.id,undefined);
 const s=snapshot("MOQ 1 FOB 50");
 const base={kind:"PRODUCT" as const,status:"CONFIRMED",captureId:"capture",tripId:"trip",companyId:"company"};
 const products=[{...base,id:"old",name:"sillón",supplierId:"previous"},{...base,id:"desk",name:"escritorios regulables",supplierId:"qidong"}];
 assert.deepEqual(focusCandidates({focus:{...emptyFocus(),supplierIds:["qidong"],productIds:["old","desk"]},suppliers:[],products},s,"PRODUCT").map(p=>p.id),["desk"]);
 assert.deepEqual(namedProductCandidates("escritorio regulable",[{name:"escritorios regulables"},{name:"escritorios fijos"}]),[{name:"escritorios regulables"}]);
 assert.equal(namedProductCandidates("escritorio",[{name:"escritorios regulables"},{name:"escritorios fijos"}]).length,2);
});

test("PostgreSQL: product conditions, identity, notes and numeric selections survive real worker boundaries",{skip:!process.env.EVAL_AGENT_DATABASE_URL},async t=>{
 const db=localAgentDatabase();const env=await createAgentEnvironment(db,{trips:[{id:"trip",name:"China",companies:[{id:"company",name:"Broco"}],suppliers:[{id:"supplier",captureId:"capture",companyId:"company",name:"HIGOLD",city:null},{id:"next",captureId:"next-capture",companyId:"company",name:"Fenbe",city:null}]}]});let time=Date.now()-120000;
 async function turn(text:string,fields:ExtractionCandidate["extractedFields"]={},type:"TEXT"|"AUDIO"="TEXT"){
  await db.whatsAppBurst.updateMany({where:{userId:env.userId},data:{status:"DONE",leaseId:null,leaseUntil:null}});
  const s=snapshot(text,fields);s.userId=env.userId;s.state.tripId=env.id("trip");s.state.operationalContext={tripId:env.id("trip"),companyId:env.id("company")};s.messages[0].sentAt=new Date(time+=2000);s.messages[0].envelope.sentAt=s.messages[0].sentAt.toISOString();if(type==="AUDIO"){s.messages[0].envelope.type=type;s.messages[0].envelope.text=null;s.messages[0].reading!.transcript=text;}s.state.ingestion=buildEvidenceGraph(s);await env.persist(s);return s;
 }
 type Decision={action:"CREATE_PRODUCT"|"UPDATE_PRODUCT"|"PRESERVE_PRODUCT_FACTS"|"QUERY",name?:string,patch?:Record<string,unknown>};
 async function worker(s:BurstSnapshot,decision?:Decision){let claimed=false;let response="";const store={async claim(){if(claimed)return[];claimed=true;return[s];},async catalog(){return env.catalog;},async saveReading(){},async finish(_s:BurstSnapshot,state:AgentState,text:string){s.state=state;response=text;await env.save(s,state);},async retry(){assert.fail("Valid follow-up must not retry: "+JSON.stringify(agentState(s.state).agent.calls.slice(-2)));},async flushReplies(){}} as unknown as BurstStore;
  let round=0;let target="";let evidenceIds:string[]=[];
  // Scripted semantic decisions exercise the real agent/tools/worker with no AI calls.
  const orchestrator=new WhatsAppAgentOrchestrator({domain:env.domain,extraction:{async extractReading(){assert.fail("The complete reading must be reused");}},client:{async post(_path,body){
   assert.ok(decision,"Every natural-language turn must reach the agent with its conversation context");round++;
   const messages=(body as {messages:Array<{content:string}>}).messages;
   const input=JSON.parse(messages[1].content);assert.ok(input.conversationContext);
   const last=JSON.parse(messages.at(-1)!.content);
   let name:string,args:unknown;
   if(decision.action==="QUERY") {name="finish_turn";args={response:"El producto ya figura en el catálogo.",guidance:null,outcomes:[{messageId:s.messages[0].id,action:"QUERY",evidenceIds:[]}]};}
   else if(round===1){name="resolve_recent_reference";args={kind:decision.action==="UPDATE_PRODUCT"?"PRODUCT":"SUPPLIER"};}
   else if(round===2){assert.equal(last.records.length,1);target=last.records[0].id;name="prepare_evidence";args={sources:[{messageId:s.messages[0].id,quote:null,role:"FACTS"}]};}
   else if(round===3){evidenceIds=last.evidence.map((e:{id:string})=>e.id);name=decision.action==="CREATE_PRODUCT"?"create_product_draft":decision.action==="UPDATE_PRODUCT"?"update_product":"preserve_product_facts";args=decision.action==="CREATE_PRODUCT"?{supplierId:target,name:decision.name,notes:null,evidenceIds}:decision.action==="UPDATE_PRODUCT"?{id:target,patch:{name:null,notes:null,fob:null,moq:null,leadTime:null,clearFields:null,...decision.patch,...Object.fromEntries(Object.entries(decision.patch??{}).filter(([key,value])=>["fob","moq","leadTime"].includes(key)&&value).map(([key,value])=>[key,{...(key==="fob"?{amount:null,currency:null,unit:null,rawText:null}:key==="moq"?{quantity:null,unit:null,notes:null,rawText:null}:{days:null,rawText:null}),...value as object}]))},evidenceIds}:{supplierId:target,evidenceIds};}
   else {assert.ok(round===4,JSON.stringify(last));name="finish_turn";args={response:null,guidance:null,outcomes:[{messageId:s.messages[0].id,action:decision.action,evidenceIds}]};}
   return {choices:[{message:{role:"assistant",content:null,tool_calls:[{id:`semantic-${round}`,type:"function",function:{name,arguments:JSON.stringify(args)}}]}}]};
  }}});
  await new WhatsAppAgentService({ingestion:true,store,domain:env.domain,reader:{async read(m){return m.reading!;}},orchestrator,async save(_id,_revision,_lease,state){await env.save(s,state);return true;},async send(){assert.fail("No real delivery");}}).processDue(1);return response;
 }

 try{
  const seed=await turn("HIGOLD");await env.domain.selectConversationTarget(seed,"SUPPLIER",env.id("supplier"));
  let productId="";
  await t.test("natural messages reach the agent before any product or condition is written",async()=>{
   for(const text of ["Tambien tienen un leadtime de 45 dias","Tambien vienen en colores opacos","Tambien tienen camaras digitales, esas tienen un MOQ de 30"]){
    const s=await turn(text);const before=await db.supplierProduct.count({where:{supplierId:env.id("supplier")}});
    assert.deepEqual(await env.domain.persistProductLoads(s),[]);
    assert.deepEqual(await env.domain.persistPreviousSupplierComments(s),[]);
    assert.equal(await db.supplierProduct.count({where:{supplierId:env.id("supplier")}}),before);
   }
  });
  await t.test("unnamed conditions survive the next burst and are consumed by 'son botellas'",async()=>{
   const terms=await turn("MOQ 300 y FOB 120 usd",{fob:{amount:120,currency:"USD",unit:null,rawText:"FOB 120 usd"},moq:{quantity:300,unit:null,notes:null,rawText:"MOQ 300"}});
   assert.match(await worker(terms,{action:"PRESERVE_PRODUCT_FACTS"}),/Condiciones guardadas/);
   const unchanged=await db.supplier.findUniqueOrThrow({where:{id:env.id("supplier")}});assert.equal(unchanged.fobAmount,null);assert.equal(unchanged.moqQuantity,null);
   assert.equal(await db.whatsAppPendingEvidence.count({where:{userId:env.userId,status:"PENDING"}}),1);
   assert.equal((await env.domain.persistPreviousSupplierComments(terms)).length,0);
   const identify=await turn("son botellas",{category:"botellas"});assert.match(await worker(identify,{action:"CREATE_PRODUCT",name:"botellas"}),/1 producto cargado/);
   const product=await db.supplierProduct.findFirstOrThrow({where:{supplierId:env.id("supplier")}});productId=product.id;assert.equal(Number(product.fobAmount),120);assert.equal(product.moqQuantity,300);assert.equal(product.fobCurrency,"USD");assert.ok(JSON.stringify(product.sourceEvidence).includes(terms.messages[0].id));
   assert.equal(await db.whatsAppPendingEvidence.count({where:{userId:env.userId,status:"APPLIED",targetProductId:product.id}}),1);
   const repeat=await turn("guardar producto botella");await worker(repeat,{action:"QUERY"});assert.equal(await db.supplierProduct.count({where:{supplierId:env.id("supplier")}}),1);
  });
  await t.test("later commercial facts and notes update the product, not its supplier",async()=>{
   await worker(await turn("MOQ 1 FOB 50",{fob:{amount:50,currency:null,unit:null,rawText:"FOB 50"},moq:{quantity:1,unit:null,notes:null,rawText:"MOQ 1"}}),{action:"UPDATE_PRODUCT",patch:{fob:{amount:50},moq:{quantity:1}}});
   await worker(await turn("color blanco, negro y marrón oscuro"),{action:"UPDATE_PRODUCT",patch:{notes:"color blanco, negro y marrón oscuro"}});await worker(await turn("personalizable"),{action:"UPDATE_PRODUCT",patch:{notes:"personalizable"}});
   const product=await db.supplierProduct.findUniqueOrThrow({where:{id:productId}});assert.equal(Number(product.fobAmount),50);assert.equal(product.moqQuantity,1);assert.match(product.notes!,/marrón oscuro/);assert.match(product.notes!,/personalizable/);
   const supplier=await db.supplier.findUniqueOrThrow({where:{id:env.id("supplier")}});assert.equal(supplier.fobAmount,null);assert.equal(supplier.moqQuantity,null);assert.doesNotMatch(supplier.notes??"",/personalizable/);
  });
  await t.test("a quantity discount without a percentage is saved as a literal product note",async()=>{
   const literal="Me hace descuento por cantidad tambien en este producto";
   const s=await turn(literal);assert.match(await worker(s,{action:"UPDATE_PRODUCT",patch:{notes:literal}}),/actualizado/);
   let product=await db.supplierProduct.findUniqueOrThrow({where:{id:productId}});
   assert.match(product.notes!,/Me hace descuento por cantidad tambien en este producto/);
   assert.match(product.notes!,/marrón oscuro/);assert.equal(Number(product.fobAmount),50);assert.equal(product.moqQuantity,1);
   await worker(s);product=await db.supplierProduct.findUniqueOrThrow({where:{id:productId}});
   assert.equal(product.notes!.split(literal).length-1,1);
   assert.equal(await db.whatsAppAgentOperation.count({where:{burstId:s.id,tool:"update_product",status:"COMPLETED"}}),1);
   const supplier=await db.supplier.findUniqueOrThrow({where:{id:env.id("supplier")}});assert.doesNotMatch(supplier.notes??"",/descuento/);
  });
  await t.test("catalogue declarations persist a distinct product, its conditions and retries through the worker",async()=>{
   const analog=await db.supplierProduct.create({data:{captureId:env.id("capture"),supplierId:env.id("supplier"),name:"cámara analógica con flash integrado"}});
   const focusAnalog=await turn("cámara analógica");await env.domain.selectConversationTarget(focusAnalog,"PRODUCT",analog.id);
   const s=await turn("Tambien tienen camaras digitales, esas tienen un MOQ de 30",{category:"cámaras digitales",moq:{quantity:30,unit:null,notes:null,rawText:"MOQ de 30"}});
   assert.match(await worker(s,{action:"CREATE_PRODUCT",name:"camaras digitales"}),/1 producto cargado/);
   const digital=await db.supplierProduct.findFirstOrThrow({where:{supplierId:env.id("supplier"),name:"camaras digitales"}});
   assert.equal(digital.moqQuantity,30);assert.equal(digital.fobAmount,null);
   assert.equal((await db.supplierProduct.findUniqueOrThrow({where:{id:analog.id}})).moqQuantity,null);
   assert.equal((await db.supplierProduct.findUniqueOrThrow({where:{id:productId}})).moqQuantity,1);
   await worker(s);assert.equal(await db.supplierProduct.count({where:{supplierId:env.id("supplier"),name:"camaras digitales"}}),1);
   assert.equal(await db.whatsAppAgentOperation.count({where:{burstId:s.id,tool:"create_product_draft",status:"COMPLETED"}}),1);
   const same=await turn("Tambien tienen camaras digitales, esas tienen un MOQ de 30",{category:"cámaras digitales",moq:{quantity:30,unit:null,notes:null,rawText:"MOQ de 30"}});
   await worker(same,{action:"UPDATE_PRODUCT",patch:{moq:{quantity:30}}});
   assert.equal(await db.supplierProduct.count({where:{supplierId:env.id("supplier"),name:"camaras digitales"}}),1);
   const lead=await turn("Tambien tienen un leadtime de 45 dias",{leadTime:{days:45,rawText:"leadtime de 45 dias"}});
   await worker(lead,{action:"UPDATE_PRODUCT",patch:{leadTime:{days:45}}});
   const opaque="Tambien vienen en colores opacos";
   await worker(await turn(opaque),{action:"UPDATE_PRODUCT",patch:{notes:opaque}});
   const enriched=await db.supplierProduct.findUniqueOrThrow({where:{id:digital.id}});
   assert.equal(enriched.leadTimeDays,45);assert.match(enriched.notes!,/colores opacos/);
   await worker(await turn("¿También tienen cámaras digitales?"),{action:"QUERY"});
   assert.equal(await db.supplierProduct.count({where:{supplierId:env.id("supplier")}}),3);
   const update=await turn("También tienen cámara digital, esa tiene un MOQ de 40",{moq:{quantity:40,unit:null,notes:null,rawText:"MOQ de 40"}});
   await worker(update,{action:"UPDATE_PRODUCT",patch:{moq:{quantity:40}}});assert.equal((await db.supplierProduct.findUniqueOrThrow({where:{id:digital.id}})).moqQuantity,40);
   const audio=await turn("También fabrica escritorios, esos tienen un FOB de 45 y tardan 60 días",{fob:{amount:45,currency:null,unit:null,rawText:"FOB de 45"},leadTime:{days:60,rawText:"60 días"}},"AUDIO");
   assert.match(await worker(audio,{action:"CREATE_PRODUCT",name:"escritorios"}),/1 producto cargado/);
   const desk=await db.supplierProduct.findFirstOrThrow({where:{supplierId:env.id("supplier"),name:"escritorios"}});
   assert.equal(Number(desk.fobAmount),45);assert.equal(desk.leadTimeDays,60);assert.equal(desk.moqQuantity,null);
   const restore=await turn("botellas");await env.domain.selectConversationTarget(restore,"PRODUCT",productId);
   await db.supplierProduct.deleteMany({where:{id:{in:[analog.id,digital.id,desk.id]}}});
  });
  await t.test("singular product names authorize updates and still reject ambiguous siblings",async()=>{
   await db.supplierProduct.update({where:{id:productId},data:{name:"escritorios regulables"}});
   const historic=await db.supplierProduct.create({data:{captureId:env.id("next-capture"),supplierId:env.id("next"),name:"escritorios regulables"}});
   const previousFocus=await db.whatsAppAgentContext.findFirstOrThrow({where:{userId:env.userId}});
   await db.whatsAppAgentContext.update({where:{instance_phone_userId:{instance:previousFocus.instance,phone:previousFocus.phone,userId:previousFocus.userId}},data:{focus:{...(previousFocus.focus as object),productIds:[productId,historic.id]}}});
   const s=await turn("1 escritorio como MOQ y FOB qingdao 50 usd",{fob:{amount:50,currency:"USD",unit:null,rawText:"FOB qingdao 50 usd"},moq:{quantity:1,unit:"escritorio",notes:null,rawText:"1 escritorio como MOQ"}});
   assert.equal((await env.domain.search(s,"PRODUCT",env.id("trip"),"escritorio",env.id("supplier")))[0].id,productId);
   const m=s.messages[0];const e:AgentEvidence={id:`${m.id}:facts`,messageId:m.id,start:0,end:m.envelope.text!.length,text:m.envelope.text!,role:"FACTS",candidate:m.reading!.segments[0].candidate!};
   const updated=await env.domain.write(s,{tool:"update_product",tripId:env.id("trip"),companyId:env.id("company"),targetId:productId,evidence:[e],patch:{moq:{quantity:1,unit:"escritorio"},fob:{amount:50,currency:"USD"}}});assert.equal(updated.status,"COMPLETED");
   const sibling=await db.supplierProduct.create({data:{captureId:env.id("capture"),supplierId:env.id("supplier"),name:"escritorios fijos"}});
   const focus=await db.whatsAppAgentContext.findFirstOrThrow({where:{userId:env.userId}});
   await db.whatsAppAgentContext.update({where:{instance_phone_userId:{instance:focus.instance,phone:focus.phone,userId:focus.userId}},data:{focus:{...(focus.focus as object),productIds:[productId,sibling.id]}}});
   const ambiguous=await turn("escritorio FOB 70",{fob:{amount:70,currency:null,unit:null,rawText:"FOB 70"}});const a=ambiguous.messages[0];
   await assert.rejects(env.domain.write(ambiguous,{tool:"update_product",tripId:env.id("trip"),companyId:env.id("company"),targetId:productId,evidence:[{...e,id:`${a.id}:facts`,messageId:a.id,text:a.envelope.text!,end:a.envelope.text!.length,candidate:a.reading!.segments[0].candidate!}],patch:{fob:{amount:70}}}),{code:"AMBIGUOUS_TARGET"});
   assert.equal(Number((await db.supplierProduct.findUniqueOrThrow({where:{id:productId}})).fobAmount),50);
  });
  await t.test("the inbox freezes a numeric selection and separates a subsequent card",async()=>{
   const s=await turn("MOQ 1 FOB 50",{fob:{amount:50,currency:null,unit:null,rawText:"FOB 50"}});const state=s.state as AgentState;
   const facts:AgentEvidence={id:`${s.messages[0].id}:facts`,messageId:s.messages[0].id,start:0,end:s.messages[0].envelope.text!.length,text:s.messages[0].envelope.text!,role:"FACTS",candidate:s.messages[0].reading!.segments[0].candidate!};state.agent.evidence=[facts];
   state.agent.pending={type:"CLARIFICATION",revision:1,text:"¿Cuál escritorio?",evidenceIds:[facts.id],options:[{id:productId,label:"escritorios regulables"}],loadId:s.state.ingestion!.loads[0].id};state.question="¿Cuál escritorio?";await env.save(s,state);await db.whatsAppBurst.update({where:{id:s.id},data:{status:"WAITING",leaseId:null,leaseUntil:null}});
   const phone=(await db.user.findUniqueOrThrow({where:{id:env.userId}})).whatsappPhone!;
   await db.whatsAppBurst.update({where:{id:s.id},data:{phone}});
   const focus=await db.whatsAppAgentContext.findFirstOrThrow({where:{userId:env.userId}});
   await db.whatsAppAgentContext.update({where:{instance_phone_userId:{instance:focus.instance,phone:focus.phone,userId:focus.userId}},data:{phone,focus:{...(focus.focus as object),activeBurstId:s.id}}});
   const store=new PrismaBurstStore(db,{newVersion:3});
   const numeric={instance:s.instance,phone,messageId:randomUUID(),type:"TEXT" as const,text:"1",media:null,sentAt:new Date(time+=2000).toISOString()};await store.receive(numeric);
   const row=await db.whatsAppBurst.findUniqueOrThrow({where:{id:s.id}});const pending=agentState(row.state as never).agent.pending!;assert.equal(pending.answer?.optionId,productId);
   await db.whatsAppBurst.update({where:{id:s.id},data:{status:"PROCESSING",leaseId:s.leaseId}});
   await store.finish(s,state,"Pregunta vieja");
   assert.equal(agentState((await db.whatsAppBurst.findUniqueOrThrow({where:{id:s.id}})).state as never).agent.pending?.answer?.optionId,productId);
   assert.equal(await db.whatsAppBurstReply.count({where:{burstId:s.id}}),0);
   const photo={...numeric,messageId:randomUUID(),type:"IMAGE" as const,text:"escritorio regulable 50 MOQ",media:{key:{id:randomUUID(),fromMe:false,remoteJid:phone+"@s.whatsapp.net"},message:{imageMessage:{}}}};await store.receive(photo);
   const received=await db.whatsAppBurstMessage.findUniqueOrThrow({where:{instance_messageId:{instance:s.instance,messageId:photo.messageId}}});assert.notEqual(received.burstId,s.id);
   await store.receive({...numeric,messageId:randomUUID(),text:"FOB 30 usd"});assert.equal((await db.whatsAppBurst.findUniqueOrThrow({where:{id:s.id}})).revision,2);
   await store.receive(numeric);assert.equal((await db.whatsAppBurst.findUniqueOrThrow({where:{id:s.id}})).revision,2);
   const selected=await db.whatsAppBurst.findUniqueOrThrow({where:{id:s.id},include:{messages:{orderBy:{sequence:"asc"}}}});
   s.phone=phone;s.revision=selected.revision;s.state=agentState(selected.state as never);
   s.messages=selected.messages.map(m=>({...m,envelope:m.envelope as never,reading:m.reading as never}));
   const reply=s.messages[1];reply.reading={complete:true,segments:[{id:`${reply.id}:1`,text:"1",candidate:candidate("1")}]};
   await db.whatsAppBurst.update({where:{id:s.id},data:{status:"PROCESSING",leaseId:s.leaseId}});
   assert.match(await worker(s),/actualizado/);assert.equal(agentState(s.state).agent.pending,null);
   assert.equal(Number((await db.supplierProduct.findUniqueOrThrow({where:{id:productId}})).fobAmount),50);
   assert.equal((await db.supplier.findUniqueOrThrow({where:{id:env.id("next")}})).fobAmount,null);
  });
 }finally{await env.cleanup();await db.$disconnect();}
});
