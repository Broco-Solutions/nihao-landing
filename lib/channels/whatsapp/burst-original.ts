import { createHash } from "node:crypto";

export function burstOriginalKey(inboxId: string) {
  return `whatsapp/bursts/${createHash("sha256").update(inboxId).digest("hex")}`;
}
