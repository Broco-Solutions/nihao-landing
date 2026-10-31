import { getPrisma } from "../lib/auth/prisma.ts";
import { processPersistedWhatsApp } from "../lib/channels/whatsapp/durable-routing.ts";
import { createEvolutionClientFromEnvironment } from "../lib/channels/evolution/client.ts";
import { PrismaBurstStore } from "../lib/channels/whatsapp/prisma-burst-store.ts";
import { PrismaWhatsAppQuarantineRepository, recoverQuarantinedWhatsAppOriginals } from "../lib/channels/whatsapp/quarantine.ts";
import { monitorIntervalMs, operationalThresholds, runOperationalMonitor } from "../lib/channels/whatsapp/operational-monitor.ts";
import { getStorageProvider } from "../lib/bot/storage/index.ts";

const prisma = getPrisma();
const client = createEvolutionClientFromEnvironment();
const store = new PrismaBurstStore(prisma);
const quarantine = new PrismaWhatsAppQuarantineRepository(prisma);
const storage = getStorageProvider();
let stopping = false;
let monitoring = false;

process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const sendBurst = (phone: string, text: string, context?: import("../lib/channels/whatsapp/supplier-picker.ts").ReplyContext) => client.sendText({ number: phone, text, onSentMessageId: context?.delivery ? (id) => { context.delivery!.messageId = id; } : undefined });
const sendDirect = (phone: string, text: string, onMessageId: (id: string) => void, reason: import("../lib/channels/whatsapp/quarantine.ts").DirectReplyReason) => client.sendText({ number: phone, text, audience: reason === "PUBLIC_WELCOME" ? "PUBLIC_WELCOME" : "AUTHORIZED", onSentMessageId: onMessageId });

async function monitorCycle() {
  if (monitoring) return;
  monitoring = true;
  try {
    const thresholds = operationalThresholds();
    await recoverQuarantinedWhatsAppOriginals(prisma, { storage, client });
    await store.enqueueTimedFeedback(new Date(), thresholds.noticeMs, thresholds.criticalMs);
    await store.flushReplies(sendBurst);
    await quarantine.flushReplies(sendDirect);
    const result = await runOperationalMonitor(prisma);
    console.info("WhatsApp operational monitor", {
      evolutionState: result.evolution.state,
      webhookOk: result.evolution.webhookOk,
      evolutionProbeError: result.evolution.probeError ?? null,
      activeAlerts: result.findings.length,
      alertCategories: result.findings.map(({ fingerprint, category, severity, details }) => ({ fingerprint, category, severity, count: details.count ?? null, failedTool: details.failedTool ?? null, errorCode: details.errorCode ?? null, incidentIds: details.incidentIds ?? null })),
    });
  } catch (error) {
    console.error("WhatsApp operational monitor failed", { error: error instanceof Error ? error.name : "UnknownError" });
  } finally {
    monitoring = false;
  }
}

async function monitorLoop() {
  while (!stopping) {
    await monitorCycle();
    await wait(monitorIntervalMs());
  }
}

async function workerLoop() {
  while (!stopping) {
    try { await processPersistedWhatsApp(10); }
    catch (error) { console.error("WhatsApp recovery worker failed", { error: error instanceof Error ? error.name : "UnknownError" }); }
    await wait(1_000);
  }
}

await Promise.all([monitorLoop(), workerLoop()]);
await prisma.$disconnect();
