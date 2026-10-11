/** Transport limits apply to each part, never to the complete answer. */
export function splitWhatsAppReply(text: string, limit = 4_000): string[] {
  if (!Number.isSafeInteger(limit) || limit < 2) throw new Error("InvalidWhatsAppReplyPartLimit");
  if (!text) return [];
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    let end = limit;
    // Never separate the two UTF-16 code units of an emoji.
    if (/[\uD800-\uDBFF]/u.test(remaining[end - 1]) && /[\uDC00-\uDFFF]/u.test(remaining[end])) end--;
    const paragraph = remaining.lastIndexOf("\n", end - 1);
    const space = remaining.lastIndexOf(" ", end - 1);
    const boundary = Math.max(paragraph, space);
    if (boundary >= Math.floor(limit / 2)) end = boundary + 1;
    parts.push(remaining.slice(0, end));
    remaining = remaining.slice(end);
  }
  if (remaining) parts.push(remaining);
  return parts;
}

// Preserve the historical unique key and kind of part zero. Trailing parts
// carry an explicit ordinal, so older readers continue to see the main reply.
export const replyPartKind = (kind: string, index: number) => index ? `${kind}_PART_${index}` : kind;
export const replyBaseKind = (kind: string) => kind.replace(/_PART_\d+$/u, "");
