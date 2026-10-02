import { processPersistedWhatsApp } from "../lib/channels/whatsapp/durable-routing.ts";
import { createWhatsAppBatchService } from "../lib/channels/whatsapp/batch-composition.ts";

const service = createWhatsAppBatchService();
const once = process.argv.includes("--once");
let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

do {
  try {
    await processPersistedWhatsApp(10);
    await service.processDue(10);
  } catch (error) {
    console.error("WhatsApp batch worker failed", { error: error instanceof Error ? error.name : "UnknownError" });
    if (once) process.exitCode = 1;
  }
  if (once || stopping) break;
  await new Promise<void>((resolve) => setTimeout(resolve, 10_000));
} while (!stopping);
