import { getPrisma } from "../lib/auth/prisma.ts";
import { PrismaBurstStore } from "../lib/channels/whatsapp/prisma-burst-store.ts";
import { monitorIntervalMs, operationalThresholds, runOperationalMonitor } from "../lib/channels/whatsapp/operational-monitor.ts";

const prisma = getPrisma();
const store = new PrismaBurstStore(prisma);
let stopping = false;
let monitoring = false;

process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function monitorCycle() {
  if (monitoring) return;
  monitoring = true;
  try {
    const thresholds = operationalThresholds();
    await store.enqueueTimedFeedback(new Date(), thresholds.noticeMs, thresholds.criticalMs);
    const result = await runOperationalMonitor(prisma);
    console.info("WhatsApp operational monitor", { evolutionState: result.evolution.state, webhookOk: result.evolution.webhookOk, activeAlerts: result.findings.length });
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

await monitorLoop();
await prisma.$disconnect();
