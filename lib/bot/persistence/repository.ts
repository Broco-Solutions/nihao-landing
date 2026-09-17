import type {
  StructuredExtractionResult,
  SupplierCaptureRecord,
  SupplierRecord,
  Tier1FieldUpdate,
} from "../types.ts";
import type { TripMemberRole } from "../types.ts";

export type CaptureContext = {
  userId: string;
  tripId: string;
};

export type TripMembership = { role: TripMemberRole };

export interface TripRoleRepository {
  getTripMembership(context: CaptureContext): Promise<TripMembership | null>;
}

export type CreateCaptureInput = CaptureContext & {
  /** Used only by repositories that can bootstrap an isolated demo trip. */
  tripName?: string;
  extraction: StructuredExtractionResult;
};

export type CorrectCaptureInput = CaptureContext & Tier1FieldUpdate & {
  captureId: string;
  acknowledgedUnknown: boolean;
};

export interface SupplierCaptureRepository {
  createDraft(input: CreateCaptureInput): Promise<SupplierCaptureRecord>;
  replaceExtraction(context: CaptureContext, captureId: string, extraction: StructuredExtractionResult): Promise<SupplierCaptureRecord>;
  getCapture(context: CaptureContext, captureId: string): Promise<SupplierCaptureRecord | null>;
  correctField(input: CorrectCaptureInput): Promise<SupplierCaptureRecord>;
  confirm(context: CaptureContext, captureId: string): Promise<{ capture: SupplierCaptureRecord; supplier: SupplierRecord }>;
  listCaptures(context: CaptureContext): Promise<SupplierCaptureRecord[]>;
  listSuppliers(context: CaptureContext): Promise<SupplierRecord[]>;
}

/**
 * Authorization is intentionally separate from capture persistence so the
 * Tier 1 engine stays independent of database and session technologies.
 */
export interface TripAccessRepository {
  hasTripAccess(context: CaptureContext): Promise<boolean>;
}

export class CaptureNotFoundError extends Error {}
export class CaptureConflictError extends Error {}
