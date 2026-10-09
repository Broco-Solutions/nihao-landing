import type { BurstMessage } from "./burst-types.ts";
import type { CaptionFacts } from "./reading-enrichment.ts";
import { explicitlySupplierGeneral } from "./pending-commercial-evidence.ts";

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
  const productFact = <K extends "fob" | "moq" | "leadTime">(key: K): CaptionFacts[K] => {
    const value = caption?.pendingFacts?.[key];
    return value && !explicitlySupplierGeneral(message.envelope.text ?? "", value.rawText) ? value : null;
  };
  return { name, notes: caption?.pendingFacts?.notes ?? null, fob: productFact("fob"),
    moq: productFact("moq"), leadTime: productFact("leadTime"), origin: "VISUAL_OBSERVATION" };
}
