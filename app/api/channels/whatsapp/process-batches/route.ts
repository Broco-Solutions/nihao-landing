import { createWhatsAppBatchService } from "@/lib/channels/whatsapp/batch-composition";
import { after } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const secret = process.env.WHATSAPP_BATCH_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  after(async () => { await createWhatsAppBatchService().processDue(10); });
  return Response.json({ accepted: true });
}
