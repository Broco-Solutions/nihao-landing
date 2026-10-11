import { handleBurstWebhook } from "@/lib/channels/whatsapp/burst-webhook";
import { BURST_QUIET_MS } from "@/lib/channels/whatsapp/burst-types";
import { createEvolutionClientFromEnvironment } from "@/lib/channels/evolution/client";
import type { EvolutionGetMediaInput } from "@/lib/channels/evolution/client";
import { handleWhatsAppWebhookRequest } from "@/lib/channels/evolution/webhook";
import { createWhatsAppCaptureService } from "@/lib/channels/whatsapp/composition";
import { createWhatsAppBatchService } from "@/lib/channels/whatsapp/batch-composition";
import { createDurableWhatsAppService, durableWhatsAppActive } from "@/lib/channels/whatsapp/durable-routing";
import { after } from "next/server";
import { getPrisma } from "@/lib/auth/prisma";
import { PrismaWhatsAppIdentityRepository } from "@/lib/channels/whatsapp/prisma-identity-repository";
import { gateWhatsAppInbound } from "@/lib/channels/whatsapp/inbound-gate";
import { whatsappAgentEnabled } from "@/lib/channels/whatsapp/agent-composition";
import { isWhatsAppGreeting, whatsappAgentHelpReply, whatsappHelpReply } from "@/lib/channels/whatsapp/help-reply";
import { authenticateEvolutionWebhook } from "@/lib/channels/evolution/webhook-auth";
import { parseEvolutionWebhook } from "@/lib/channels/evolution/webhook";
import { PrismaBurstStore } from "@/lib/channels/whatsapp/prisma-burst-store";
import { getStorageProvider } from "@/lib/bot/storage";
import { PrismaWhatsAppQuarantineRepository, preserveAndQueueDirectWhatsAppReply, preserveAndQueuePublicWhatsAppWelcome, preserveQuarantinedWhatsAppMessage } from "@/lib/channels/whatsapp/quarantine";
import { isWhatsAppUatSenderAllowed, whatsappUatAllowedPhones } from "@/lib/channels/whatsapp/uat-access";
import { recordWhatsAppWebhookObservation } from "@/lib/channels/whatsapp/operational-state";
import { resolveWhatsAppIdentity } from "@/lib/channels/whatsapp/identity";
import { isWhatsAppBlocked, shouldQueueWhatsAppPublicWelcome, WHATSAPP_PUBLIC_WELCOME, whatsappPublicWelcomeEnabled } from "@/lib/channels/whatsapp/public-welcome";
import { PrismaTravelerWelcomeService } from "@/lib/channels/whatsapp/traveler-welcome";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const authenticationFailure = authenticateEvolutionWebhook(request, process.env.EVOLUTION_WEBHOOK_SECRET);
  if (authenticationFailure) return authenticationFailure;
  const instance = process.env.EVOLUTION_INSTANCE?.trim() ?? "";
  let payload: unknown;
  let allowUnlinkedReply = false;
  const mediaClient = { getMedia: (input: EvolutionGetMediaInput) => createEvolutionClientFromEnvironment().getMedia(input) };
  try { payload = await request.json(); }
  catch { return Response.json({ received: true }); }
  try {
    const uatAllowedPhones = whatsappUatAllowedPhones();
    const event = parseEvolutionWebhook(payload, instance);
    await recordWhatsAppWebhookObservation(getPrisma(), event);
    allowUnlinkedReply = event.kind === "message" && Boolean(uatAllowedPhones && isWhatsAppUatSenderAllowed(event.message.phone));
    if (event.kind === "message-status") {
      const updatedBurst = await new PrismaBurstStore(getPrisma()).applyDeliveryStatus(event.instance, event.messageId, event.status);
      const updatedDirect = await new PrismaWhatsAppQuarantineRepository(getPrisma()).applyDeliveryStatus(event.instance, event.messageId, event.status);
      const updatedWelcome = await new PrismaTravelerWelcomeService(getPrisma()).applyDeliveryStatus(event.messageId, event.status);
      const updated = updatedBurst || updatedDirect || updatedWelcome;
      return Response.json({ received: true, deliveryStatusUpdated: updated });
    }
    if (event.kind === "message" && isWhatsAppBlocked(event.message.phone)) {
      await preserveQuarantinedWhatsAppMessage({ instance, message: event.message, payload }, {
        repository: new PrismaWhatsAppQuarantineRepository(getPrisma()),
        storage: getStorageProvider(),
        client: mediaClient,
      });
      return Response.json({ received: true, quarantined: true, restricted: true, publicWelcomeQueued: false });
    }
    if (uatAllowedPhones && event.kind === "message" && !isWhatsAppUatSenderAllowed(event.message.phone)) {
      const prisma = getPrisma();
      const repository = new PrismaWhatsAppQuarantineRepository(prisma);
      const dependencies = { repository, storage: getStorageProvider(), client: mediaClient };
      const receipt = { instance, message: event.message, payload };
      const preserved = await preserveQuarantinedWhatsAppMessage(receipt, dependencies);
      const publicWelcomeEnabled = whatsappPublicWelcomeEnabled();
      const publicWelcomeBlocked = false;
      if (publicWelcomeEnabled && !publicWelcomeBlocked) {
        const identity = await resolveWhatsAppIdentity(event.message.phone, new PrismaWhatsAppIdentityRepository(prisma));
        if (shouldQueueWhatsAppPublicWelcome({ enabled: publicWelcomeEnabled, blocked: publicWelcomeBlocked, identityKind: identity.kind })) {
          const queued = await repository.enqueuePublicWelcome(preserved.id, { instance, phone: event.message.phone, text: WHATSAPP_PUBLIC_WELCOME });
          if (queued) after(() => repository.flushReplies((phone, reply, onMessageId, reason) => createEvolutionClientFromEnvironment().sendText({ number: phone, text: reply, audience: reason === "PUBLIC_WELCOME" ? "PUBLIC_WELCOME" : "AUTHORIZED", onSentMessageId: onMessageId })));
          return Response.json({ received: true, quarantined: true, publicWelcomeQueued: queued });
        }
      }
      return Response.json({ received: true, quarantined: true, publicWelcomeQueued: false });
    }
  } catch (error) {
    console.error("WhatsApp UAT quarantine failed", { error: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ received: false }, { status: 503 });
  }
  try {
    const quarantine = new PrismaWhatsAppQuarantineRepository(getPrisma());
    const storage = getStorageProvider();
    const gated = await gateWhatsAppInbound(payload, instance, {
      identities: new PrismaWhatsAppIdentityRepository(getPrisma()),
      allowUnlinkedReply,
      helpReply: () => whatsappAgentEnabled() ? whatsappAgentHelpReply() : whatsappHelpReply(),
      send: (phone, text) => createEvolutionClientFromEnvironment().sendText({ number: phone, text }),
      defer: (work) => after(work),
      persistAndReply: async (message, text, reason) => {
        await preserveAndQueueDirectWhatsAppReply({ instance, message, payload }, text, reason, { repository: quarantine, storage, client: mediaClient });
        after(() => quarantine.flushReplies((phone, reply, onMessageId, reason) => createEvolutionClientFromEnvironment().sendText({ number: phone, text: reply, audience: reason === "PUBLIC_WELCOME" ? "PUBLIC_WELCOME" : "AUTHORIZED", onSentMessageId: onMessageId })));
      },
      personalizedWelcome: async (identity, message) => {
        const welcome = new PrismaTravelerWelcomeService(getPrisma());
        const queued = await welcome.activateFromInbound(identity.userId, identity.tripId, message.phone);
        if (!queued) return false;
        if (message.type === "TEXT" && isWhatsAppGreeting(message.text ?? "")) {
          await preserveQuarantinedWhatsAppMessage({ instance, message, payload }, { repository: quarantine, storage, client: mediaClient });
        }
        after(() => welcome.flushReady((phone, text, onMessageId) => createEvolutionClientFromEnvironment().sendText({ number: phone, text, onSentMessageId: onMessageId })));
        return true;
      },
      ...(whatsappPublicWelcomeEnabled() ? {
        publicUnlinkedReply: () => WHATSAPP_PUBLIC_WELCOME,
        persistPublicAndReply: async (message, text) => {
          const queued = await preserveAndQueuePublicWhatsAppWelcome({ instance, message, payload }, text, { repository: quarantine, storage, client: mediaClient });
          if (queued) after(() => quarantine.flushReplies((phone, reply, onMessageId, reason) => createEvolutionClientFromEnvironment().sendText({ number: phone, text: reply, audience: reason === "PUBLIC_WELCOME" ? "PUBLIC_WELCOME" : "AUTHORIZED", onSentMessageId: onMessageId })));
          return queued;
        },
      } : {}),
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
