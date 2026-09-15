import type {
  StructuredExtractionResult,
  SupplierCaptureRecord,
  SupplierRecord,
  Tier1FieldUpdate,
} from "../types.ts";

export type CaptureContext = {
  userId: string;
  tripId: string;
};

export type CreateCaptureInput = CaptureContext & {
  tripName: string;
  extraction: StructuredExtractionResult;
};

export type CorrectCaptureInput = CaptureContext & Tier1FieldUpdate & {
  captureId: string;
  acknowledgedUnknown: boolean;
};

export interface SupplierCaptureRepository {
  createDraft(input: CreateCaptureInput): Promise<SupplierCaptureRecord>;
  getCapture(context: CaptureContext, captureId: string): Promise<SupplierCaptureRecord | null>;
  correctField(input: CorrectCaptureInput): Promise<SupplierCaptureRecord>;
  confirm(context: CaptureContext, captureId: string): Promise<{ capture: SupplierCaptureRecord; supplier: SupplierRecord }>;
  listSuppliers(context: CaptureContext): Promise<SupplierRecord[]>;
}

export class CaptureNotFoundError extends Error {}
export class CaptureConflictError extends Error {}
