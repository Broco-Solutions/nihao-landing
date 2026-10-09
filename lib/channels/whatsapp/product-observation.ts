import type { BurstMessage } from "./burst-types.ts";
import type { CaptionFacts } from "./reading-enrichment.ts";

/** A user's literal name wins; vision supplies identity only, never commercial facts. */
export function observedProduct(message: BurstMessage): (CaptionFacts & { name: string; origin: "IMAGE_CAPTION" | "VISUAL_OBSERVATION" }) | null {
  const reading = message.reading;
  if (message.envelope.type !== "IMAGE" || reading?.productImageVerified !== true) return null;
  const caption = reading.ingestion?.caption;
  if (caption?.products.length === 1) return { ...caption.products[0], origin: "IMAGE_CAPTION" };
  if (caption?.products.length) return null;
  const visual = reading.ingestion?.classification;
  if (visual?.type !== "PRODUCT" || ["ambiguous", "unreadable"].includes(visual.readability)) return null;
  const description = visual.product?.description.trim();
  if (!description) return null;
  // Product names have a 120-character storage limit; retain the full observation in reading.
  const name = description.length <= 120 ? description : description.slice(0, 120).replace(/\s+\S*$/u, "").trim();
  return { name, notes: caption?.pendingFacts?.notes ?? null, fob: caption?.pendingFacts?.fob ?? null,
    moq: caption?.pendingFacts?.moq ?? null, leadTime: caption?.pendingFacts?.leadTime ?? null, origin: "VISUAL_OBSERVATION" };
}
