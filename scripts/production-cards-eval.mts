import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';
import { PrismaBurstStore } from '../lib/channels/whatsapp/prisma-burst-store.ts';
import { PrismaAgentDomain } from '../lib/channels/whatsapp/prisma-agent-domain.ts';
import { PrismaAttachmentRepository } from '../lib/bot/persistence/prisma-attachment-repository.ts';
import { AttachmentService } from '../lib/bot/attachments.ts';
import { getStorageProvider } from '../lib/bot/storage/index.ts';
import { StorageBusinessCardResolver } from '../lib/bot/extraction/storage-business-card-resolver.ts';
import { MistralExtractionProvider } from '../lib/bot/extraction/mistral-extraction-provider.ts';
import { createMistralTranscriptionProviderFromEnvironment } from '../lib/bot/transcription.ts';
import { createWhatsAppAIClient, OPENAI_AGENT_MODEL } from '../lib/channels/whatsapp/agent-provider.ts';
import { MistralBatchAnalyzer } from '../lib/channels/whatsapp/batch-association.ts';
import { BurstReader } from '../lib/channels/whatsapp/burst-reader.ts';
import { WhatsAppAgentService } from '../lib/channels/whatsapp/agent-service.ts';
import { WhatsAppAgentOrchestrator } from '../lib/channels/whatsapp/agent-orchestrator.ts';
import { agentState, type AgentState, type AgentDomain } from '../lib/channels/whatsapp/agent-contract.ts';
import type { BurstStore, BurstSnapshot, BurstEnvelope, BurstState } from '../lib/channels/whatsapp/burst-types.ts';

// Explicit production eval: same deployed core, real database/storage/AI.
// Local media delivery and captured WhatsApp output replace Evolution transport.
const tripId = '60e57ace-136b-4604-b3e1-a44f0a1e1e32';
const accountId = 'iHPdAuHlSE3KNtp1VvYQ7qtmvlMYXI8Y';
if (process.env.PRODUCTION_EVAL !== 'Viaje de Pruebas') throw new Error('Explicit production trip authorization required');
const runId = `EVAL-${new Date().toISOString().slice(0,10)}-${randomUUID().slice(0,8)}`;
const instance = `production-eval-${runId}`;
const db = new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL!}), transactionOptions:{timeout:60000,maxWait:15000}, log:[{emit:'event',level:'error'}]});
db.$on('error',e=>console.error('EVAL_DATABASE_ERROR',e.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[redacted]').slice(0,1500)));
const output = resolve('replay-output', runId); await mkdir(output,{recursive:true});
const folder = '/Users/franc/Downloads/Tarjetas_Nuevas';
const files = (await readdir(folder)).filter(f=>f.endsWith('.jpeg')).sort();
const media = new Map<string,string>();
const allowedProducts = new Set<string>();
const scenarios: any[] = []; const responses: any[] = []; const calls: any[] = [];
const json = (v:unknown) => JSON.parse(JSON.stringify(v));
const farFuture = () => new Date(Date.now()+86400000);
const name = (n:string) => `${n} ${runId}`;
let phone = ''; let sequence = 0; let activeCase = ''; let activeBurst: string | null = null;
const base = new PrismaBurstStore(db,{newVersion:3,claimVersions:[3]});
const storage = getStorageProvider(); const repository = new PrismaAttachmentRepository(db);
const rawDomain = new PrismaAgentDomain(db,{storage,repository,attachments:new AttachmentService(repository,storage)});
const domain = new Proxy(rawDomain, {get(target,property) {
 const value = Reflect.get(target,property); if(typeof value!=='function')return value;
 return async (...args:any[]) => {
  const snapshot = args[0] as BurstSnapshot;
  assert.equal(snapshot.userId,accountId); assert.equal(snapshot.instance,instance);
  if(property==='write') {
   assert.equal(args[1].tripId,tripId,'Attempted write outside authorized trip');
   if(args[1].tool==='update_product') assert.ok(allowedProducts.has(args[1].targetId),'Only eval-created products may be edited');
  }
  if(property==='search')assert.equal(args[2],tripId);
  const result = await value.apply(target,args);
  if(property==='get') assert.equal(result.tripId,tripId,'Resource outside eval trip');
  if(['write','persistImageLoad','resolveExistingSupplier','resolve'].includes(String(property))) {
   if(result?.tripId)assert.equal(result.tripId,tripId);
   if(result?.tool==='create_product_draft')allowedProducts.add(result.id);
   calls.push({case:activeCase,method:String(property),result:json(result)});
  }
  return result;
 };
}}) as AgentDomain;
const realClient = createWhatsAppAIClient();
const client = {async post(path:string, body:unknown, signal:AbortSignal) {
 const request=body as {tools?:unknown[];messages?:any[]};
 if(request.tools?.length)await writeFile(resolve(output,`input-${sequence}.json`),JSON.stringify({case:activeCase,messages:request.messages?.filter(m=>m.role==='user'||m.role==='system')},null,2),{mode:0o600});
 return realClient.post(path,body,signal);
}};
const extraction = new MistralExtractionProvider({client,businessCards:new StorageBusinessCardResolver(repository,storage)});
const reader = new BurstReader({multimodal:true,storage,client:{async getMedia({message}) {
 const path = media.get(message.key.id); assert.ok(path,'Unknown eval asset');
 return {bytes:new Uint8Array(await readFile(path)),mimeType:'image/jpeg'};
}},mistral:client,analyzer:new MistralBatchAnalyzer(client),extraction,transcription:createMistralTranscriptionProviderFromEnvironment()});
const store: BurstStore = {
 async receive(envelope) {
  assert.equal(envelope.instance,instance);assert.equal(envelope.phone,phone);
  const accepted = await base.receive(envelope);
  // Production workers cannot claim these records while this runner owns them.
  await db.whatsAppBurst.updateMany({where:{instance,userId:accountId,status:'OPEN'},data:{dueAt:farFuture()}});
  return accepted;
 },
 async catalog(userId,includeSuppliers) {assert.equal(userId,accountId);return {trips:(await base.catalog(userId,includeSuppliers)).trips.filter(t=>t.id===tripId)};},
 async claim() {
  const row=await db.whatsAppBurst.findFirst({where:{instance,userId:accountId,...(activeBurst?{id:activeBurst}:{}),status:{in:['OPEN','PROCESSING','COMMITTING']}},orderBy:{createdAt:'desc'},include:{messages:{orderBy:{sequence:'asc'}}}});
  if(!row)return [];activeBurst=row.id;
  const leaseId=randomUUID();await db.whatsAppBurst.update({where:{id:row.id},data:{status:row.status==='COMMITTING'?'COMMITTING':'PROCESSING',leaseId,leaseUntil:farFuture(),dueAt:farFuture()}});
  return [{...row,leaseId,status:row.status==='COMMITTING'?'COMMITTING':'PROCESSING',state:row.state as unknown as BurstState,messages:row.messages.map(m=>({...m,envelope:m.envelope as unknown as BurstEnvelope,reading:m.reading as any}))}] as BurstSnapshot[];
 },
 saveReading:(id,reading,snapshot)=>base.saveReading(id,reading,snapshot),
 reserve:(snapshot,state)=>base.reserve(snapshot,state),
 async finish(snapshot,state,text) {
  const replyId=`${snapshot.id}-reply-${snapshot.revision}`;
  const saved={...state,outboundReplies:[...(state.outboundReplies??[]).filter(r=>r.revision!==snapshot.revision),{revision:snapshot.revision,messageId:replyId}]};
  await db.$transaction(async tx=>{
   assert.equal((await tx.whatsAppBurst.findUniqueOrThrow({where:{id:snapshot.id}})).leaseId,snapshot.leaseId);
   await tx.whatsAppBurst.update({where:{id:snapshot.id},data:{state:json(saved),status:state.question?'WAITING':'DONE',leaseId:null,leaseUntil:null,attempts:0,dueAt:farFuture()}});
   // SENT represents delivery to the eval report, never to a real phone.
   if(text)await tx.whatsAppBurstReply.upsert({where:{burstId_revision:{burstId:snapshot.id,revision:snapshot.revision}},create:{burstId:snapshot.id,revision:snapshot.revision,text,status:'SENT'},update:{}});
   const pending=agentState(state).agent.pending;
   if(pending?.proposalId)await tx.whatsAppAgentOperation.updateMany({where:{id:pending.proposalId,burstId:snapshot.id,status:'PROPOSED'},data:{displayedRevision:snapshot.revision}});
  });responses.push({case:activeCase,burstId:snapshot.id,revision:snapshot.revision,text,question:state.question,replyId});
 },
 async retry(snapshot,checkpoint) {
  await db.whatsAppBurst.updateMany({where:{id:snapshot.id,instance,leaseId:snapshot.leaseId},data:{status:'OPEN',dueAt:farFuture(),leaseId:null,leaseUntil:null}});
  calls.push({case:activeCase,method:'retry',checkpoint});
 },
 async flushReplies() {},
};
const service = new WhatsAppAgentService({ingestion:true,store,domain,reader,
 orchestrator:new WhatsAppAgentOrchestrator({client,extraction,domain,model:OPENAI_AGENT_MODEL}),
 async save(id,revision,leaseId,state){return (await db.whatsAppBurst.updateMany({where:{id,instance,userId:accountId,revision,leaseId,status:'PROCESSING'},data:{state:json(state)}})).count===1;},
 async send(){throw new Error('Evolution delivery is disabled for evaluations');},
});
async function send(text:string,quotedMessageId?:string) {
 const id=`${runId}-${++sequence}`;const accepted=await service.receive({instance,phone,messageId:id,type:'TEXT',text,media:null,sentAt:new Date().toISOString(),quotedMessageId});assert.ok(accepted);return id;
}
async function card(index:number,text?:string) {
 const id=`${runId}-${++sequence}`;media.set(id,resolve(folder,files[index-1]));
 assert.ok(await service.receive({instance,phone,messageId:id,type:'IMAGE',text:text??null,sentAt:new Date().toISOString(),media:{key:{id,remoteJid:`${phone}@s.whatsapp.net`,fromMe:false},message:{imageMessage:{}}}}));return id;
}
async function processBurst() {
 for(let i=0;i<12;i++) {
  await service.processDue(1);
  const row=await db.whatsAppBurst.findFirst({where:{instance,userId:accountId,...(activeBurst?{id:activeBurst}:{})},orderBy:{createdAt:'desc'}});assert.ok(row);
  activeBurst=row.id;
  if(['DONE','WAITING'].includes(row.status))return row;
  await new Promise(r=>setTimeout(r,1000));
 }
 throw new Error('Worker did not reach a terminal state after 12 windows');
}
async function checkpoint() {
 const products=await db.supplierProduct.findMany({where:{capture:{tripId},name:{contains:runId}},include:{images:true},orderBy:{createdAt:'asc'}});
 products.forEach(p=>allowedProducts.add(p.id));
 await writeFile(resolve(output,'report.json'),JSON.stringify({runId,tripId,accountId,model:OPENAI_AGENT_MODEL,sourceCommit:process.env.PRODUCTION_SOURCE_COMMIT??'UNVERIFIED-WORKTREE',transport:'local media injection; captured output; git archive deployed core/production database/R2/AI',scenarios,responses,calls,products:json(products)},null,2),{mode:0o600});
 return products;
}
async function scenario(label:string,action:()=>Promise<void>,check?:(row:any)=>Promise<void>) {
 activeCase=label;activeBurst=null;const start=Date.now();let result:any;
 try {await action();result=await processBurst();if(check)await check(result);scenarios.push({label,status:'PASS',durationMs:Date.now()-start,burstId:result.id,state:json(result.state)});}
 catch(e){scenarios.push({label,status:'FAIL',durationMs:Date.now()-start,error:e instanceof Error?e.message:'Unknown error',burstId:activeBurst});
  // Stop a failed infrastructure scenario from absorbing the following case.
  if(activeBurst)await db.whatsAppBurst.updateMany({where:{id:activeBurst,instance,status:{in:['OPEN','PROCESSING','COMMITTING']}},data:{status:'DONE',leaseId:null,leaseUntil:null}});
 }
 await checkpoint();console.log('EVAL_RESULT',JSON.stringify({label,...scenarios.at(-1),state:undefined}));
}
const savedProduct=async(n:string)=>db.supplierProduct.findFirst({where:{name:name(n),capture:{tripId}}});
async function requireProducts(ns:string[]) {for(const n of ns){const p=await savedProduct(n);assert.ok(p,`Missing product: ${n}`);assert.equal(p.status,'CONFIRMED');assert.equal(p.name,name(n));}}
try {
 const user=await db.user.findUniqueOrThrow({where:{email:'fvelazquez@brocosolutions.com'}});assert.equal(user.id,accountId);assert.ok(user.whatsappPhone);phone=user.whatsappPhone;
 const authorized=await store.catalog(accountId);assert.equal(authorized.trips.length,1);assert.equal(authorized.trips[0].id,tripId);assert.equal(authorized.trips[0].name,'Viaje de Pruebas');
 await writeFile(resolve(output,'baseline.json'),JSON.stringify({suppliers:await db.supplier.findMany({where:{tripId},select:{id:true,companyName:true,companyNameLatin:true}}),products:await db.supplierProduct.findMany({where:{capture:{tripId}},select:{id:true,name:true,status:true}})},null,2),{mode:0o600});
 console.log('EVAL_START',JSON.stringify({runId,tripId,cards:files.length,output}));
 if(!process.env.PRODUCTS_ONLY) {
 await scenario('01-single-card',async()=>{await card(1);},async row=>{assert.ok(agentState(row.state).agent.receipts.some(r=>r.status==='COMPLETED'));});
 await scenario('02-card-redelivery-existing-supplier',async()=>{await card(1);},async row=>{assert.ok(agentState(row.state).agent.receipts.some(r=>r.status==='COMPLETED'));});
 // Historical regression only: the intended flow sends single-sided cards.
 if(process.env.EVAL_FRONT_BACK==='1')await scenario('03-front-back-card',async()=>{await card(6);await card(7);},async row=>{assert.equal(row.state.ingestion.loads.filter((l:any)=>l.type==='SUPPLIER').length,1,'One supplier for front/back card');assert.equal(row.state.ingestion.loads.filter((l:any)=>l.type==='PRODUCT').length,0,'Back of card must not become product');});
 else await scenario('03-additional-single-card',async()=>{await card(6);});
 const groups=[[2,3,4,5,8,9],[10,11,12,13,14,15],[16,17,18,19,20,21],[22,23,24,25,26,27],[28,29,30,31,32,33,34]];
 for(const [i,group] of (process.env.CARDS_EDGE_ONLY?groups.slice(0,1):groups).entries())await scenario(`04-batch-cards-${i+1}`,async()=>{for(const index of group)await card(index);},async row=>{assert.doesNotMatch(responses.at(-1)?.text??'',/lo cargué como borrador|confirmar los datos extraídos/u);});
 }
 const suppliers=await db.supplier.findMany({where:{tripId,status:'CONFIRMED'},orderBy:{createdAt:'asc'}});
 const selected=suppliers.find(s=>/watersy/i.test(`${s.companyName} ${s.companyNameLatin}`))??suppliers[0];assert.ok(selected);const supplier=selected.companyNameLatin??selected.companyName;assert.ok(supplier);
 console.log('EVAL_SUPPLIER',JSON.stringify({id:selected.id,name:supplier}));
 if(process.env.CARDS_EDGE_ONLY) {
 } else if(process.env.PRODUCTS_ONLY==='5') {
 const target=await db.supplierProduct.findFirstOrThrow({where:{name:'Bloques de construcción EVAL-2026-10-07-de05355d',capture:{tripId}}});allowedProducts.add(target.id);const initial=Number(target.fobAmount);const updated=initial+3;
 await scenario('propose-eval-product-price-change',async()=>{await send(`Cambiá el precio FOB de ${target.name}, del proveedor ${supplier}, de USD ${initial} por unidad a USD ${updated} por unidad. Dato ficticio de prueba.`);},async row=>{assert.equal(Number((await db.supplierProduct.findUniqueOrThrow({where:{id:target.id}})).fobAmount),initial);assert.equal(agentState(row.state).agent.pending?.type,'APPROVAL');});
 const proposal=await db.whatsAppBurst.findFirst({where:{instance,status:'WAITING'},orderBy:{updatedAt:'desc'}});
 if(proposal&&agentState(proposal.state as any).agent.pending?.type==='APPROVAL')await scenario('explicit-approval-applies-eval-change',async()=>{await send('sí');},async()=>{assert.equal(Number((await db.supplierProduct.findUniqueOrThrow({where:{id:target.id}})).fobAmount),updated);});
 } else if(process.env.PRODUCTS_ONLY==='4') {
 await scenario('homonymous-supplier-no-arbitrary-selection',async()=>{await send(`Cargá ${name('Prueba de homonimia')} al proveedor Henan Chuxin Paper Technology CO.,Ltd. No sé distinguir entre los registros que tengan ese nombre.`);},async row=>{assert.ok(agentState(row.state).agent.pending);assert.equal(await savedProduct('Prueba de homonimia'),null);});
 await db.whatsAppBurst.updateMany({where:{instance,status:'WAITING'},data:{status:'DONE'}});
 await scenario('fuzzy-supplier-requires-selection',async()=>{await send(`Cargá ${name('Prueba de búsqueda fuzzy')} para el proveedor WATERSI. Es un dato ficticio de evaluación.`);},async row=>{assert.ok(agentState(row.state).agent.pending);assert.equal(await savedProduct('Prueba de búsqueda fuzzy'),null);});
 const row=await db.whatsAppBurst.findFirst({where:{instance,status:'WAITING'},orderBy:{updatedAt:'desc'}});
 if(row){const opts=agentState(row.state as any).agent.pending?.options??[];const index=opts.findIndex(o=>o.id===selected.id);if(index>=0)await scenario('fuzzy-supplier-numeric-selection',async()=>{await send(String(index+1));},async()=>{await requireProducts(['Prueba de búsqueda fuzzy']);assert.equal((await savedProduct('Prueba de búsqueda fuzzy'))!.supplierId,selected.id);});}
 } else if(process.env.PRODUCTS_ONLY==='3') {
 const pairs=[['Bloques de construcción','Rompecabezas infantil'],['Auto de juguete','Dispensador de agua'],['Cubiertos descartables','Botella reutilizable']];
 for(const [i,pair] of pairs.entries())await scenario(`paired-products-${i+1}`,async()=>{for(const [j,n] of pair.entries())await send(`Cargá el producto ${name(n)} para el proveedor ${supplier}. Datos ficticios: FOB USD ${i*2+j+3} por unidad, MOQ ${(i*2+j+1)*100} unidades.`);},()=>requireProducts(pair));
 await scenario('new-supplier-text',async()=>{await send(`Cargá un proveedor nuevo: Nihao Proveedor ${runId}, ciudad Hangzhou, email eval@example.com. Viaje de Pruebas, empresa Broco Solutions. Todos son datos ficticios de evaluación.`);},async row=>{assert.ok(agentState(row.state).agent.receipts.some(r=>r.tool==='create_supplier_draft'&&r.status==='COMPLETED'));});
 } else if(process.env.PRODUCTS_ONLY==='1') {
 const ns=['Servilletas de papel','Vasos descartables','Bloques de construcción','Rompecabezas infantil','Auto de juguete','Bolsa de papel','Caja de cartón','Dispensador de agua','Botella reutilizable','Bandeja de plástico','Cubiertos descartables','Mantel de papel'];
 for(const [i,n] of ns.slice(0,Number(process.env.PRODUCT_LIMIT??ns.length)).entries()) {
  await scenario(`product-${i+1}`,async()=>{await send(`Proveedor: ${supplier}. Producto: ${name(n)}. Registralo para Viaje de Pruebas y Broco Solutions. Es una prueba; no hay foto ni precio.`);},()=>requireProducts([n]));
  const pendingRow=await db.whatsAppBurst.findFirst({where:{instance,status:'WAITING'},orderBy:{updatedAt:'desc'}});
  if(pendingRow) {
   await scenario(`product-${i+1}-answer`,async()=>{await send(`${name(n)} → ${supplier}`,agentState(pendingRow.state as any).outboundReplies?.at(-1)?.messageId);},()=>requireProducts([n]));
   await db.whatsAppBurst.updateMany({where:{instance,status:'WAITING'},data:{status:'DONE'}});
  }
 }
 } else {
 await scenario('05-two-products-no-image-no-price',async()=>{await send(`Para ${supplier}, en Viaje de Pruebas / Broco Solutions: cargá dos productos separados: ${name('Servilletas de papel')} y ${name('Vasos descartables')}. Son datos ficticios de evaluación. No tengo fotos ni precios.`);},()=>requireProducts(['Servilletas de papel','Vasos descartables']));
 await scenario('06-three-products-distinct-commercial-facts',async()=>{await send(`Cargá estos tres productos separados para ${supplier}. Datos ficticios de evaluación.\n${name('Bloques de construcción')}: FOB USD 3 por unidad, MOQ 200 unidades, entrega 20 días; viene en rojo y azul.\n${name('Rompecabezas infantil')}: FOB USD 5 por unidad, MOQ 500 unidades, entrega 35 días; incluye caja de cartón.\n${name('Auto de juguete')}: sin precio, MOQ 100 unidades; con ruedas de goma.`);},async()=>{await requireProducts(['Bloques de construcción','Rompecabezas infantil','Auto de juguete']);assert.equal(Number((await savedProduct('Bloques de construcción'))!.fobAmount),3);assert.equal(Number((await savedProduct('Rompecabezas infantil'))!.fobAmount),5);assert.equal((await savedProduct('Auto de juguete'))!.fobAmount,null);});
 await scenario('07-batch-text-text',async()=>{await send(`Para ${supplier}: cargá el producto ${name('Bolsa de papel')}. Datos ficticios: MOQ 600 unidades.`);await send(`Para el mismo proveedor, también cargá ${name('Caja de cartón')}. Datos ficticios: FOB USD 2 por unidad, entrega 15 días.`);},()=>requireProducts(['Bolsa de papel','Caja de cartón']));
 await scenario('08-quoted-image-new-text',async()=>{const id=await card(1);await send(`A este proveedor cargale ${name('Dispensador de agua')}. Datos ficticios de evaluación: FOB USD 45 por unidad y MOQ 10 unidades.`,id);},()=>requireProducts(['Dispensador de agua']));
 await scenario('09-product-explicit-reference-after-unrelated-image',async()=>{await card(3);await send(`Para ${supplier}, no para la tarjeta que acabo de mandar, cargá ${name('Botella reutilizable')}. Datos ficticios: FOB USD 4 por unidad.`);},async()=>{await requireProducts(['Botella reutilizable']);assert.equal((await savedProduct('Botella reutilizable'))!.supplierId,selected.id);});
 await scenario('10-one-message-one-product',async()=>{await send(`Cargá ${name('Bandeja de plástico')} al proveedor ${supplier}. Datos ficticios de evaluación. No tengo imagen ni FOB.`);},()=>requireProducts(['Bandeja de plástico']));
 await scenario('11-recent-supplier-reference-next-conversation',async()=>{await send(`Al proveedor del producto ${name('Bandeja de plástico')}, agregale ${name('Cubiertos descartables')}. Datos ficticios: MOQ 1000 unidades.`);},()=>requireProducts(['Cubiertos descartables']));
 await scenario('12-two-products-quoted-text',async()=>{const id=await send(`El proveedor de esta carga es ${supplier}, para Broco Solutions en Viaje de Pruebas.`);await send(`Agregale ${name('Mantel de papel')} y ${name('Sorbetes de papel')}. Son datos ficticios: mantel FOB USD 1.5, sorbetes sin FOB.`,id);},()=>requireProducts(['Mantel de papel','Sorbetes de papel']));
 await scenario('13-unresolved-explicit-supplier-must-not-fall-back',async()=>{await send(`Cargá el producto ${name('Referencia inexistente')} al proveedor ZXQ-No-Existe-${runId}. No lo asocies a otro proveedor.`);},async row=>{assert.ok(agentState(row.state).agent.pending);assert.equal(await savedProduct('Referencia inexistente'),null);});
 await db.whatsAppBurst.updateMany({where:{instance,status:'WAITING'},data:{status:'DONE'}});
 await scenario('14-ambiguous-supplier-clarification-numeric',async()=>{await send(`Cargá ${name('Producto con proveedor ambiguo')}. No indiqué proveedor; preguntame cuál corresponde.`);},async row=>{assert.ok(agentState(row.state).agent.pending);});
 const pending=await db.whatsAppBurst.findFirst({where:{instance,status:'WAITING'},orderBy:{updatedAt:'desc'}});
 if(pending){const state=agentState(pending.state as any);if(state.agent.pending?.options.length)await scenario('15-numeric-answer-to-pending-question',async()=>{await send('1',state.outboundReplies?.at(-1)?.messageId);});else await scenario('15-explicit-answer-to-pending-question',async()=>{await send(`Para ${supplier}`,state.outboundReplies?.at(-1)?.messageId);});}
 await scenario('16-propose-product-price-update',async()=>{await send(`Corregí el FOB del producto ${name('Servilletas de papel')} de ${supplier} a USD 0.8 por unidad. Es un dato ficticio de evaluación.`);},async row=>{assert.equal((await savedProduct('Servilletas de papel'))!.fobAmount,null);assert.equal(agentState(row.state).agent.pending?.type,'APPROVAL');});
 const proposal=await db.whatsAppBurst.findFirst({where:{instance,status:'WAITING'},orderBy:{updatedAt:'desc'}});
 if(proposal&&agentState(proposal.state as any).agent.pending?.type==='APPROVAL')await scenario('17-approve-proposal',async()=>{await send('sí');},async()=>{assert.equal(Number((await savedProduct('Servilletas de papel'))!.fobAmount),0.8);});
 await scenario('18-propose-then-cancel',async()=>{await send(`Corregí el FOB del producto ${name('Vasos descartables')} de ${supplier} a USD 9 por unidad. Es un dato ficticio de evaluación.`);},async row=>{assert.equal(agentState(row.state).agent.pending?.type,'APPROVAL');});
 const cancel=await db.whatsAppBurst.findFirst({where:{instance,status:'WAITING'},orderBy:{updatedAt:'desc'}});
 if(cancel&&agentState(cancel.state as any).agent.pending?.type==='APPROVAL')await scenario('19-cancel-proposal',async()=>{await send('cancelar');},async()=>{assert.equal((await savedProduct('Vasos descartables'))!.fobAmount,null);});
 }
 const final=await checkpoint();console.log('EVAL_FINAL',JSON.stringify({runId,products:final.length,confirmed:final.filter(p=>p.status==='CONFIRMED').length,passed:scenarios.filter(s=>s.status==='PASS').length,failed:scenarios.filter(s=>s.status==='FAIL').length,output}));
 if(scenarios.some(s=>s.status==='FAIL'))process.exitCode=1;
 if(!process.env.CARDS_EDGE_ONLY&&!['4','5'].includes(process.env.PRODUCTS_ONLY??'')&&final.length<(process.env.PRODUCTS_ONLY==='3'?6:10))throw new Error('At least ten eval products were not persisted');
} catch(e){console.error('EVAL_FATAL',e instanceof Error?e.name+': '+e.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[redacted]'):'Unknown error');process.exitCode=1;}
finally{await checkpoint().catch(()=>{});await db.$disconnect();}
