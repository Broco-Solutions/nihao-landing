import { handleBurstWebhook } from "@/lib/channels/whatsapp/burst-webhook";
import { createEvolutionClientFromEnvironment } from "@/lib/channels/evolution/client";
import { handleWhatsAppWebhookRequest } from "@/lib/channels/evolution/webhook";
import { createWhatsAppCaptureService } from "@/lib/channels/whatsapp/composition";
import { createWhatsAppBatchService } from "@/lib/channels/whatsapp/batch-composition";
import { createDurableWhatsAppService, durableWhatsAppActive } from "@/lib/channels/whatsapp/durable-routing";
import { after } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const instance = process.env.EVOLUTION_INSTANCE?.trim() ?? "";
  if (await durableWhatsAppActive(instance)) {
    let payload: unknown;
    try { payload = await request.json(); }
    catch { return Response.json({ received: true }); }
    const durable = await handleBurstWebhook(payload, instance, createDurableWhatsAppService, (work) => after(work));
    if (durable) return durable;
    return handleWhatsAppWebhookRequest({ json: async () => payload }, instance, createEvolutionClientFromEnvironment, createWhatsAppCaptureService, (work) => after(work));
  }
  return handleWhatsAppWebhookRequest(request, instance, createEvolutionClientFromEnvironment, createWhatsAppCaptureService, (work) => after(async () => {
    await work();
    await new Promise<void>((resolve) => setTimeout(resolve, 10_250));
    await createWhatsAppBatchService().processDue(1);
  }));
}
