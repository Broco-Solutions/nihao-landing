import { TIER_1_FIELDS, type Tier1Field } from "./types.ts";

export function groupCaptureFields(reviewFields: Tier1Field[], missingFields: Tier1Field[], acknowledgedUnknownFields: Tier1Field[]) {
  const supplierFields = TIER_1_FIELDS.filter((field) => field !== "fob" && field !== "moq" && field !== "leadTime");
  const review = supplierFields.filter((field) => reviewFields.includes(field));
  const missing = supplierFields.filter((field) => missingFields.includes(field) && !review.includes(field) && !acknowledgedUnknownFields.includes(field));
  const detected = supplierFields.filter((field) => !review.includes(field) && !missingFields.includes(field));
  return { detected, review, missing };
}
