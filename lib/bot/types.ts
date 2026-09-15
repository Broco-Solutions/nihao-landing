export const TIER_1_FIELDS = [
  "companyName",
  "city",
  "province",
  "contact",
  "category",
  "supplierType",
  "fob",
  "moq",
  "leadTime",
  "interestScore",
] as const;

export type Tier1Field = (typeof TIER_1_FIELDS)[number];
export type SupplierType = "FACTORY" | "TRADING" | "UNKNOWN";
export type CaptureStatus = "DRAFT" | "CONFIRMED";
export type TripStatus = "PLANNED" | "ACTIVE" | "COMPLETED" | "ARCHIVED";
export type SourceType = "TEXT" | "IMAGE_BUSINESS_CARD" | "AUDIO_TRANSCRIPT";
export type AttachmentType = "BUSINESS_CARD" | "PRODUCT_IMAGE" | "AUDIO" | "OTHER";

export type Fob = {
  amount: number | null;
  currency: string | null;
  unit: string | null;
  rawText: string;
};

export type Moq = {
  quantity: number | null;
  unit: string | null;
  notes: string | null;
  rawText: string;
};

export type LeadTime = {
  rawText: string;
  days: number | null;
};

export type Tier1Data = {
  companyName: string | null;
  city: string | null;
  province: string | null;
  contact: string | null;
  category: string | null;
  supplierType: SupplierType;
  fob: Fob | null;
  moq: Moq | null;
  leadTime: LeadTime | null;
  interestScore: number | null;
};

export type Tier1FieldUpdate = {
  [Field in Tier1Field]: {
    field: Field;
    value: Tier1Data[Field];
  };
}[Tier1Field];

export type RawSource = {
  type: SourceType;
  text?: string;
  attachmentId?: string;
};

export type FieldEvidence = {
  field: Tier1Field;
  confidence: number;
  evidence: string;
};

export type ExtractionCandidate = {
  extractedFields: Partial<Tier1Data>;
  reviewFields: Tier1Field[];
  evidence: FieldEvidence[];
  rawSource: RawSource;
  /** Present only when a result was merged from more than one source. */
  mergedSources?: RawSource[];
  sourceConflicts?: ExtractionConflict[];
};

export type ExtractionConflict = {
  field: Tier1Field;
  candidates: Array<{ source: RawSource; value: unknown }>;
};

export type StructuredExtractionResult = Omit<ExtractionCandidate, "extractedFields"> & {
  extractedFields: Tier1Data;
  missingFields: Tier1Field[];
};

export type UserRecord = {
  id: string;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TripRecord = {
  id: string;
  userId: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  status: TripStatus;
  createdAt: string;
  updatedAt: string;
};

export type SupplierRecord = Tier1Data & {
  id: string;
  userId: string;
  tripId: string;
  captureId: string;
  status: CaptureStatus;
  pendingFields: Tier1Field[];
  createdAt: string;
  updatedAt: string;
};

export type SupplierContactRecord = {
  id: string;
  userId: string;
  tripId: string;
  supplierId: string;
  rawText: string;
  createdAt: string;
  updatedAt: string;
};

export type SupplierDetailRecord = SupplierRecord & {
  contacts: SupplierContactRecord[];
};

export type SupplierCaptureRecord = {
  id: string;
  userId: string;
  tripId: string;
  supplierId: string | null;
  status: CaptureStatus;
  source: RawSource;
  fields: Tier1Data;
  missingFields: Tier1Field[];
  reviewFields: Tier1Field[];
  acknowledgedUnknownFields: Tier1Field[];
  evidence: FieldEvidence[];
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
};

export type SupplierAttachmentRecord = {
  id: string;
  userId: string;
  tripId: string;
  captureId: string;
  type: AttachmentType;
  storageKey: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

export type SupplierAttachmentView = SupplierAttachmentRecord & {
  url: string;
};

export type BotDatabase = {
  schemaVersion: 1;
  users: UserRecord[];
  trips: TripRecord[];
  suppliers: SupplierRecord[];
  contacts: SupplierContactRecord[];
  captures: SupplierCaptureRecord[];
  attachments: SupplierAttachmentRecord[];
};

export const EMPTY_TIER_1_DATA: Tier1Data = {
  companyName: null,
  city: null,
  province: null,
  contact: null,
  category: null,
  supplierType: "UNKNOWN",
  fob: null,
  moq: null,
  leadTime: null,
  interestScore: null,
};
