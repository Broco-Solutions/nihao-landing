import { handleBurstWebhook } from "@/lib/channels/whatsapp/burst-webhook";
import { BURST_QUIET_MS } from "@/lib/channels/whatsapp/burst-types";
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
import { authenticateEvolutionWebhook } from "@/lib/channels/evolution/webhook-auth";
import { parseEvolutionWebhook } from "@/lib/channels/evolution/webhook";
import { getStorageProvider } from "@/lib/bot/storage";
import { PrismaWhatsAppQuarantineRepository, preserveQuarantinedWhatsAppMessage } from "@/lib/channels/whatsapp/quarantine";
import { isWhatsAppUatSenderAllowed, whatsappUatAllowedPhones } from "@/lib/channels/whatsapp/uat-access";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const authenticationFailure = authenticateEvolutionWebhook(request, process.env.EVOLUTION_WEBHOOK_SECRET);
  if (authenticationFailure) return authenticationFailure;
  const instance = process.env.EVOLUTION_INSTANCE?.trim() ?? "";
  let payload: unknown;
  try { payload = await request.json(); }
  catch { return Response.json({ received: true }); }
  try {
    const uatAllowedPhones = whatsappUatAllowedPhones();
    const event = parseEvolutionWebhook(payload, instance);
    if (uatAllowedPhones && event.kind === "message" && !isWhatsAppUatSenderAllowed(event.message.phone)) {
      await preserveQuarantinedWhatsAppMessage({ instance, message: event.message, payload }, {
        repository: new PrismaWhatsAppQuarantineRepository(getPrisma()),
        storage: getStorageProvider(),
        client: createEvolutionClientFromEnvironment(),
      });
      return Response.json({ received: true, quarantined: true });
    }
  } catch (error) {
    console.error("WhatsApp UAT quarantine failed", { error: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ received: false }, { status: 503 });
  }
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
    await new Promise<void>((resolve) => setTimeout(resolve, BURST_QUIET_MS + 250));
    await createWhatsAppBatchService().processDue(1);
  }));
}
