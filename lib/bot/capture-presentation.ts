import { TIER_1_FIELDS, type Tier1Field } from "./types.ts";

export function groupCaptureFields(reviewFields: Tier1Field[], missingFields: Tier1Field[], acknowledgedUnknownFields: Tier1Field[]) {
  const review = TIER_1_FIELDS.filter((field) => reviewFields.includes(field));
  const missing = TIER_1_FIELDS.filter((field) => missingFields.includes(field) && !review.includes(field) && !acknowledgedUnknownFields.includes(field));
  const detected = TIER_1_FIELDS.filter((field) => !review.includes(field) && !missingFields.includes(field));
  return { detected, review, missing };
}
