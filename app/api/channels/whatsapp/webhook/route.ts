import { createEvolutionClientFromEnvironment } from "@/lib/channels/evolution/client";
import { handleWhatsAppWebhookRequest } from "@/lib/channels/evolution/webhook";
import { createWhatsAppCaptureService } from "@/lib/channels/whatsapp/composition";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleWhatsAppWebhookRequest(request, process.env.EVOLUTION_INSTANCE?.trim() ?? "", createEvolutionClientFromEnvironment, createWhatsAppCaptureService);
}
