import { getPrisma } from "../lib/auth/prisma.ts";
import { collectMonitorHeartbeatFinding, reconcileOperationalAlerts, monitorIntervalMs } from "../lib/channels/whatsapp/operational-monitor.ts";

// Run as its own service. It must remain independent of the monitor process
// and of Evolution/R2/LLM work, so it can detect a stalled or stopped monitor.
const prisma = getPrisma();
let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });
const once = process.argv.includes("--once");
do {
  try {
    const now = new Date();
    const findings = await collectMonitorHeartbeatFinding(prisma, now);
    await reconcileOperationalAlerts(prisma, findings, now, undefined, ["MONITOR_HEARTBEAT"]);
    await prisma.whatsAppServiceHeartbeat.upsert({ where: { id: "watchdog" }, create: { id: "watchdog", checkedAt: now }, update: { checkedAt: now } });
    console.info("WhatsApp monitor watchdog", { stale: findings.length > 0 });
  } catch (error) {
    console.error("WhatsApp watchdog failed", { error: error instanceof Error ? error.name : "UnknownError" });
    if (once) process.exitCode = 1;
  }
  if (once || stopping) break;
  await new Promise(resolve => setTimeout(resolve, monitorIntervalMs()));
} while (!stopping);
await prisma.$disconnect();
