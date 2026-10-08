import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {PrismaPg} from '@prisma/adapter-pg';
import {PrismaClient} from '../generated/prisma/client.ts';
import {PrismaBurstStore} from '../lib/channels/whatsapp/prisma-burst-store.ts';
import type {BurstEnvelope} from '../lib/channels/whatsapp/burst-types.ts';
const run=process.argv[2];assert.match(run??'',/^EVAL-2026-10-07-[a-f0-9]{8}$/);
if(process.env.PRODUCTION_EVAL!=='Viaje de Pruebas')throw new Error('Explicit eval authorization required');
const instance=`production-eval-${run}`;
const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL!}),transactionOptions:{timeout:60000}});
try{
 const row=await db.whatsAppBurstMessage.findFirstOrThrow({where:{burst:{instance,userId:'iHPdAuHlSE3KNtp1VvYQ7qtmvlMYXI8Y',status:'DONE'}},include:{burst:true},orderBy:{receivedAt:'asc'}});
 const store=new PrismaBurstStore(db,{newVersion:3,claimVersions:[3]});
 assert.ok(await store.receive(row.envelope as unknown as BurstEnvelope));
 const after=await db.whatsAppBurst.findUniqueOrThrow({where:{id:row.burstId},include:{messages:true}});
 assert.equal(after.revision,row.burst.revision);assert.equal(after.messages.length,1);
 assert.equal(await db.whatsAppBurstMessage.count({where:{instance,messageId:row.messageId}}),1);
 const report={case:'duplicate-delivery-id',status:'PASS',burstId:row.burstId,revisionBefore:row.burst.revision,revisionAfter:after.revision,messageRows:1};
 await writeFile(`replay-output/${run}/idempotency.json`,JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
}finally{await db.$disconnect();}
