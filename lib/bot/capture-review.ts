/** Missing fields acknowledged by the traveler are not pending review. */
export function needsCaptureReview(record: { status: string; needsReanalysis?: boolean; reviewFields?: unknown }): boolean {
  return record.status === "DRAFT" || record.needsReanalysis === true || hasReviewFields(record.reviewFields);
}

export function hasReviewFields(fields: unknown): boolean {
  return Array.isArray(fields) && fields.some((field) => typeof field === "string");
}

export function needsProductReview(record: { status: string; supplierId?: string | null; reviewFields?: unknown; capture: { needsReanalysis?: boolean } }): boolean {
  return record.status === "DRAFT" || hasReviewFields(record.reviewFields) || record.capture.needsReanalysis === true;
}
