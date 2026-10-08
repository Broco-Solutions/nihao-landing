import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';
const db = new PrismaClient({ adapter: new PrismaPg({connectionString:process.env.DATABASE_URL!}) });
try {
 const user = await db.user.findUniqueOrThrow({where:{email:'fvelazquez@brocosolutions.com'},select:{id:true,whatsappPhone:true}});
 if(user.id !== 'iHPdAuHlSE3KNtp1VvYQ7qtmvlMYXI8Y') throw new Error('Authenticated account and database mismatch');
 if(process.argv.includes('--abort-exhausted-key-run')) {
  const result=await db.whatsAppBurst.updateMany({where:{userId:user.id,instance:'production-eval-EVAL-2026-10-07-07648da4'},data:{status:'DONE',leaseId:null,leaseUntil:null}});
  console.log(JSON.stringify({abortedInfrastructureRun:result.count}));
 }
 const trip = await db.trip.findUniqueOrThrow({where:{id:'60e57ace-136b-4604-b3e1-a44f0a1e1e32'},select:{id:true,name:true,status:true,members:{where:{userId:user.id},select:{role:true}},companies:{where:{members:{some:{userId:user.id}}},select:{id:true}}}});
 console.log(JSON.stringify({accountMatches:true,linkedPhone:!!user.whatsappPhone,trip,baseline:{suppliers:await db.supplier.count({where:{tripId:trip.id}}),products:await db.supplierProduct.count({where:{capture:{tripId:trip.id}}})}}));
} catch(e) {console.error(e instanceof Error ? e.name+': '+e.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[redacted]') : 'Probe failed');process.exitCode=1;}
finally{await db.$disconnect();}
