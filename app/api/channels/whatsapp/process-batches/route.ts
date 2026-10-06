import { safeDeadline } from "@/lib/channels/whatsapp/operational-runtime";
import { processPersistedWhatsApp } from "@/lib/channels/whatsapp/durable-routing";
import { createWhatsAppBatchService } from "@/lib/channels/whatsapp/batch-composition";
import { after } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const deadline = safeDeadline(maxDuration * 1000);
  const secret = process.env.WHATSAPP_BATCH_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  if (!process.env.EVOLUTION_API_URL || !process.env.EVOLUTION_API_KEY || !process.env.EVOLUTION_INSTANCE) {
    return Response.json({ accepted: false, reason: "Evolution not configured" });
  }
  after(async () => {
    await processPersistedWhatsApp(10, deadline);
    if (Date.now() + 30_000 < deadline) await createWhatsAppBatchService().processDue(10, deadline);
  });
  return Response.json({ accepted: true });
}
