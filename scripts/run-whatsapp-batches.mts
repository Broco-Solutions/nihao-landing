import { safeDeadline } from "../lib/channels/whatsapp/operational-runtime.ts";
import { processPersistedWhatsApp } from "../lib/channels/whatsapp/durable-routing.ts";
import { createWhatsAppBatchService } from "../lib/channels/whatsapp/batch-composition.ts";

const service = createWhatsAppBatchService();
const once = process.argv.includes("--once");
let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

do {
  try {
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
