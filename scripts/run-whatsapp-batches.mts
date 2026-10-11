import { getPrisma } from "../lib/auth/prisma.ts";
import { getStorageProvider } from "../lib/bot/storage/index.ts";
import { createEvolutionClientFromEnvironment } from "../lib/channels/evolution/client.ts";
import { PrismaWhatsAppQuarantineRepository, recoverQuarantinedWhatsAppOriginals } from "../lib/channels/whatsapp/quarantine.ts";
import { safeDeadline } from "../lib/channels/whatsapp/operational-runtime.ts";
import { processPersistedWhatsApp } from "../lib/channels/whatsapp/durable-routing.ts";
import { createWhatsAppBatchService } from "../lib/channels/whatsapp/batch-composition.ts";

const service = createWhatsAppBatchService();
const prisma = getPrisma();
const client = createEvolutionClientFromEnvironment();
const quarantine = new PrismaWhatsAppQuarantineRepository(prisma);
const once = process.argv.includes("--once");
let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

do {
  try {
    // Storage recovery and direct sends have their own bounded loop; the
    // operational supervisor runs in a separate process and never awaits them.
    await recoverQuarantinedWhatsAppOriginals(prisma, { storage: getStorageProvider(), client }, 2);
    await quarantine.flushReplies((phone, text, onMessageId) => client.sendText({ number: phone, text, onSentMessageId: onMessageId }));
    const deadline = safeDeadline();
    await processPersistedWhatsApp(10, deadline);
    if (Date.now() + 30_000 < deadline) await service.processDue(10, deadline);
  } catch (error) {
    console.error("WhatsApp batch worker failed", { error: error instanceof Error ? error.name : "UnknownError" });
    if (once) process.exitCode = 1;
  }
  if (once || stopping) break;
  await new Promise<void>((resolve) => setTimeout(resolve, 10_000));
} while (!stopping);

await prisma.$disconnect();
