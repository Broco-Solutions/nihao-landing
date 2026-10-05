import { createWhatsAppAIClient, OPENAI_AGENT_MODEL } from "../../lib/channels/whatsapp/agent-provider.ts";
import { MistralExtractionProvider } from "../../lib/bot/extraction/mistral-extraction-provider.ts";
import { MistralBatchAnalyzer } from "../../lib/channels/whatsapp/batch-association.ts";
import { BurstReader } from "../../lib/channels/whatsapp/burst-reader.ts";
import { WhatsAppAgentOrchestrator } from "../../lib/channels/whatsapp/agent-orchestrator.ts";
import { WhatsAppAgentService } from "../../lib/channels/whatsapp/agent-service.ts";
import { PrismaBurstStore } from "../../lib/channels/whatsapp/prisma-burst-store.ts";
import { handleBurstWebhook } from "../../lib/channels/whatsapp/burst-webhook.ts";
import { createEvolutionClient, type EvolutionSendListInput } from "../../lib/channels/evolution/client.ts";
import { sendSupplierReply } from "../../lib/channels/whatsapp/supplier-picker.ts";
import type { PrismaClient } from "../../generated/prisma/client.ts";
import type { EvalCase, FieldDelta } from "../core/types.ts";
import { errorCase } from "../core/scoring.ts";
import { PRODUCT_CATALOG } from "../whatsapp-products/cases.ts";
import { createAgentEnvironment } from "./environment.ts";
export const PICKER_SCENARIO_IDS = ["WA38-supplier-list-tap"];
export async function runPickerScenario(prisma: PrismaClient, filter?: string[]): Promise<EvalCase[]> {
  const caseId=PICKER_SCENARIO_IDS[0];if(filter&&!filter.includes(caseId))return [];
  const catalog=structuredClone(PRODUCT_CATALOG);catalog.trips[0].suppliers![0].name="Broco";
  const env=await createAgentEnvironment(prisma,catalog);const start=performance.now();const conversation:unknown[]=[];const lists:EvolutionSendListInput[]=[];
  try {
    const client=createWhatsAppAIClient();const extraction=new MistralExtractionProvider({client,businessCards:{async resolve(){throw new Error("No images");}}});
    const transport=createEvolutionClient({apiUrl:"https://evolution.test",apiKey:"test",instance:"picker-eval",fetch:async(url,init)=>{const input=JSON.parse(String(init?.body));conversation.push({role:"assistant",type:String(url).includes("sendList")?"LIST":"TEXT",...input});if(String(url).includes("sendList"))lists.push(input);return new Response(null,{status:201});}});
    const service=new WhatsAppAgentService({store:new PrismaBurstStore(prisma,{newVersion:3,claimVersions:[3]}),domain:env.domain,orchestrator:new WhatsAppAgentOrchestrator({client,extraction,domain:env.domain}),reader:new BurstReader({storage:env.storage,analyzer:new MistralBatchAnalyzer(client),extraction,mistral:client,client:{async getMedia(){throw new Error("No media");}},transcription:{async transcribe(){throw new Error("No audio");}}}),async save(id,revision,leaseId,state){return(await prisma.whatsAppBurst.updateMany({where:{id,revision,leaseId,status:"PROCESSING"},data:{state:JSON.parse(JSON.stringify(state))}})).count===1;},send:(phone,text,context)=>sendSupplierReply(transport,phone,text,context)});
    const user=await prisma.user.findUniqueOrThrow({where:{id:env.userId}});const instance=`picker-${env.prefix}`;
    const receive=async(message:Record<string,unknown>,suffix:string)=>{const deferred:Array<()=>Promise<void>>=[];const response=await handleBurstWebhook({event:"MESSAGES_UPSERT",instance,data:{key:{id:`${env.prefix}-${suffix}`,remoteJid:`${user.whatsappPhone}@s.whatsapp.net`,fromMe:false},message}},instance,()=>service,(callback)=>deferred.push(callback),async()=>{});if(response?.status!==200)throw new Error("Webhook did not accept selection");await prisma.whatsAppBurst.updateMany({where:{userId:env.userId},data:{dueAt:new Date(0)}});await deferred[0]();};
    const text="Tengo un vendedor de sillas de plastico con fob 90 y leadtime de 45 dias";conversation.push({role:"user",text});await receive({conversation:text},"product");
    const before=await prisma.supplierProduct.count({where:{capture:{tripId:env.id("trip-china")}}});
    const list=lists[0];if(!list)throw new Error("Expected interactive supplier list");const row=list.sections.flatMap((s)=>s.rows).find((r)=>r.title==="Broco");if(!row)throw new Error("Broco missing from supplier list");
    conversation.push({role:"user",action:"tap",title:"Broco",selectionId:row.rowId});await receive({listResponseMessage:{title:"Broco",singleSelectReply:{selectedRowId:row.rowId}}},"selection");
    const products=await prisma.supplierProduct.findMany({where:{capture:{tripId:env.id("trip-china")}}});const p=products[0];const burst=await prisma.whatsAppBurst.findFirstOrThrow({where:{userId:env.userId}});
    const actual={initialProducts:before,listCount:lists.length,products:products.length,supplier:p?.supplierId,name:p?.name.toLowerCase(),fob:p?.fobAmount==null?null:Number(p.fobAmount),currency:p?.fobCurrency,days:p?.leadTimeDays,moq:p?.moqQuantity??null,status:p?.status,done:burst.status==="DONE",supplierDrafts:await prisma.supplierCapture.count({where:{createdById:env.userId,status:"DRAFT"}})};
    const expected={initialProducts:0,listCount:1,products:1,supplier:env.id("supplier-alfa"),name:"sillas de plastico",fob:90,currency:null,days:45,moq:null,status:"DRAFT",done:true,supplierDrafts:0};const correctFields:FieldDelta[]=[];const wrongFields:FieldDelta[]=[];
    for(const[field,value]of Object.entries(expected))(JSON.stringify(value)===JSON.stringify(actual[field as keyof typeof actual])?correctFields:wrongFields).push({field,expected:value,actual:actual[field as keyof typeof actual]});
    const result:EvalCase={caseId,suite:"whatsapp-agent",status:wrongFields.length?"FAIL":"PASS",correctFields,wrongFields,missingExpectedFields:[],hallucinatedFields:[],reviewExpected:[],reviewActual:[],reviewCorrect:null,latencyMs:Math.round(performance.now()-start),model:OPENAI_AGENT_MODEL,metadata:{conversation,actual,realModel:true,realWhatsApp:false,persistence:"isolated PostgreSQL",route:"webhook → worker → Evolution sendList mock → listResponseMessage → draft"}};console.log(`agent ${caseId}: ${result.status}`);return[result];
  }catch(error){const result=errorCase("whatsapp-agent",caseId,error,Math.round(performance.now()-start),OPENAI_AGENT_MODEL);result.metadata={...result.metadata,conversation};console.log(`agent ${caseId}: ERROR`);return[result];}finally{await env.cleanup();}
}
