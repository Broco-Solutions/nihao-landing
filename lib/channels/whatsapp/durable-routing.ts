import { safeDeadline } from "./operational-runtime.ts";
import { getPrisma } from "../../auth/prisma.ts";
import { PrismaBurstStore } from "./prisma-burst-store.ts";
import { createWhatsAppAgentService, whatsappAgentEnabled } from "./agent-composition.ts";
import { createWhatsAppBurstService, whatsappBurstsEnabled } from "./burst-composition.ts";

function missingInbox(error: unknown) { return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2021" && JSON.stringify(error).includes("WhatsAppBurst")); }
async function persistedVersions(instance?: string) {
  try { return await getPrisma().whatsAppBurst.findMany({ where: { ...(instance ? { instance } : {}), OR: [{ status: { not: "DONE" } }, { replies: { some: { status: { in: ["PENDING", "SENDING"] } } } }] }, select: { version: true }, distinct: ["version"] }); }
  catch (error) { if (missingInbox(error) && !whatsappAgentEnabled() && !whatsappBurstsEnabled()) return []; throw error; }
}
/** Flags select NEW conversations; persisted versions always retain their processor. */
export async function processPersistedWhatsApp(limit = 10, deadline = safeDeadline()) {
  const versions = await persistedVersions();
  if (versions.some((v) => v.version === 3)) await createWhatsAppAgentService().processDue(limit, deadline);
  if (versions.some((v) => v.version === 2)) await createWhatsAppBurstService().processDue(limit, deadline);
}
export async function durableWhatsAppActive(instance: string) {
  return whatsappAgentEnabled() || whatsappBurstsEnabled() || (await persistedVersions(instance)).length > 0;
}
export function createDurableWhatsAppService() {
  const store = new PrismaBurstStore(getPrisma(), { newVersion: whatsappAgentEnabled() ? 3 : 2, allowNew: whatsappAgentEnabled() || whatsappBurstsEnabled() });
  return { receive: store.receive.bind(store), processDue: processPersistedWhatsApp };
}
