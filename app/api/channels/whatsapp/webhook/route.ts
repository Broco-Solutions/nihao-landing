import { createEvolutionClientFromEnvironment } from "@/lib/channels/evolution/client";
import { handleWhatsAppWebhookRequest } from "@/lib/channels/evolution/webhook";
import { createWhatsAppCaptureService } from "@/lib/channels/whatsapp/composition";
import { createWhatsAppBatchService } from "@/lib/channels/whatsapp/batch-composition";
import { after } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  return handleWhatsAppWebhookRequest(request, process.env.EVOLUTION_INSTANCE?.trim() ?? "", createEvolutionClientFromEnvironment, createWhatsAppCaptureService, (work) => after(async () => {
    await work();
    await new Promise<void>((resolve) => setTimeout(resolve, 10_250));
    try { await createWhatsAppBatchService().processDue(1); }
    catch (error) { console.error("WhatsApp delayed batch processing failed", { error: error instanceof Error ? error.name : "UnknownError" }); }
  }));
}
