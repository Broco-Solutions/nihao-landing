import { orderedBurstMessages } from "./burst-types.ts";
import type { BurstMessage, BurstSnapshot } from "./burst-types.ts";

/** Refer to the user's actual asset, never an unidentifiable “esta imagen”. */
const evidenceNouns = { IMAGE: ["la", "foto"], AUDIO: ["el", "audio"], DOCUMENT: ["el", "documento"], TEXT: ["el", "mensaje"], VIDEO: ["el", "video"] } as const;
const evidenceKind = (m: BurstMessage) => m.envelope.unsupportedType ?? m.envelope.type;
/** Per-burst ordinal by media type, as the traveler counts them in the chat: “la foto 3”, “el audio 2”. */
export function evidenceLabel(snapshot: BurstSnapshot, messageId: string): string {
  const message = snapshot.messages.find(m => m.id === messageId);
  if (!message) return "la evidencia";
  const kind = evidenceKind(message);
  const ordinal = orderedBurstMessages(snapshot).filter(m => evidenceKind(m) === kind).findIndex(m => m.id === messageId) + 1;
  return `${evidenceNouns[kind].join(" ")} ${ordinal}`;
}
/** “la foto 2”, “la foto 2 y el audio 1”, “la foto 2, la foto 4 y el audio 1”. */
export function joinEvidenceLabels(snapshot: BurstSnapshot, messageIds: string[]): string {
  const labels = messageIds.map(id => evidenceLabel(snapshot, id));
  return labels.length > 1 ? `${labels.slice(0, -1).join(", ")} y ${labels.at(-1)}` : labels[0] ?? "";
}
