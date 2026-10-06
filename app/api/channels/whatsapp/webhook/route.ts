import { handleBurstWebhook } from "@/lib/channels/whatsapp/burst-webhook";
import { createEvolutionClientFromEnvironment } from "@/lib/channels/evolution/client";
import { handleWhatsAppWebhookRequest } from "@/lib/channels/evolution/webhook";
import { createWhatsAppCaptureService } from "@/lib/channels/whatsapp/composition";
import { createWhatsAppBatchService } from "@/lib/channels/whatsapp/batch-composition";
import { createDurableWhatsAppService, durableWhatsAppActive } from "@/lib/channels/whatsapp/durable-routing";
import { after } from "next/server";
import { getPrisma } from "@/lib/auth/prisma";
import { PrismaWhatsAppIdentityRepository } from "@/lib/channels/whatsapp/prisma-identity-repository";
import { gateWhatsAppInbound } from "@/lib/channels/whatsapp/inbound-gate";
import { whatsappAgentEnabled } from "@/lib/channels/whatsapp/agent-composition";
import { whatsappAgentHelpReply, whatsappHelpReply } from "@/lib/channels/whatsapp/help-reply";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const instance = process.env.EVOLUTION_INSTANCE?.trim() ?? "";
  let payload: unknown;
  try { payload = await request.json(); }
  catch { return Response.json({ received: true }); }
  try {
    const gated = await gateWhatsAppInbound(payload, instance, {
      identities: new PrismaWhatsAppIdentityRepository(getPrisma()),
      helpReply: () => whatsappAgentEnabled() ? whatsappAgentHelpReply() : whatsappHelpReply(),
      send: (phone, text) => createEvolutionClientFromEnvironment().sendText({ number: phone, text }),
      defer: (work) => after(work),
    });
    if (gated) return gated;
  } catch (error) {
    console.error("WhatsApp sender verification failed", { error: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ received: false }, { status: 503 });
  }
  if (await durableWhatsAppActive(instance)) {
    const durable = await handleBurstWebhook(payload, instance, createDurableWhatsAppService, (work) => after(work));
    if (durable) return durable;
    return handleWhatsAppWebhookRequest({ json: async () => payload }, instance, createEvolutionClientFromEnvironment, createWhatsAppCaptureService, (work) => after(work));
  }
  return handleWhatsAppWebhookRequest({ json: async () => payload }, instance, createEvolutionClientFromEnvironment, createWhatsAppCaptureService, (work) => after(async () => {
    await work();
    await new Promise<void>((resolve) => setTimeout(resolve, 10_250));
    await createWhatsAppBatchService().processDue(1);
  }));
}
