import type { PrismaClient, Supplier, SupplierCapture } from "../../../generated/prisma/client.ts";
import { CaptureStatus, CaptureSourceType } from "../../../generated/prisma/client.ts";
import { calculateMissingFields, canConfirmCapture, setTier1Field } from "../tier1.ts";
import { EMPTY_TIER_1_DATA, TIER_1_FIELDS, type FieldEvidence, type RawSource, type SupplierCaptureRecord, type SupplierRecord, type Tier1Data, type Tier1Field } from "../types.ts";
import { CaptureConflictError, CaptureNotFoundError, type CaptureContext, type CorrectCaptureInput, type CreateCaptureInput, type SupplierCaptureRepository, type TripAccessRepository } from "./repository.ts";
import { AuthorizationError } from "../authorization.ts";
import { PrismaTripAccessRepository } from "./prisma-trip-access-repository.ts";

function serializeFieldList(fields: Tier1Field[]): string[] { return [...fields]; }

function parseFieldList(value: unknown): Tier1Field[] {
  if (!Array.isArray(value)) return [];
  return value.filter((field): field is Tier1Field => typeof field === "string" && TIER_1_FIELDS.includes(field as Tier1Field));
}

function isTier1Field(value: unknown): value is Tier1Field {
  return typeof value === "string" && TIER_1_FIELDS.includes(value as Tier1Field);
}

function parseEvidence(value: unknown): FieldEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const record = candidate as Record<string, unknown>;
    if (!isTier1Field(record.field)) return [];
    if (typeof record.confidence !== "number" || typeof record.evidence !== "string") return [];
    return [{ field: record.field, confidence: record.confidence, evidence: record.evidence }];
  });
}

function sourceFromCapture(capture: SupplierCapture): RawSource {
  const type = capture.sourceType as RawSource["type"];
  if (capture.sourceAttachmentId) return { type, attachmentId: capture.sourceAttachmentId };
  return { type, ...(capture.sourceText ? { text: capture.sourceText } : {}) };
}

function fieldsFromRecord(record: Pick<SupplierCapture | Supplier,
  "companyName" | "city" | "province" | "supplierType" | "fobAmount" | "fobCurrency" | "fobUnit" | "fobRawText" | "moqQuantity" | "moqUnit" | "moqNotes" | "moqRawText" | "leadTimeRawText" | "leadTimeDays" | "interestScore"
> & { contact?: string | null; category?: string | null }): Tier1Data {
  const fob = record.fobAmount !== null || record.fobCurrency !== null || record.fobUnit !== null || record.fobRawText !== null
    ? { amount: record.fobAmount === null ? null : Number(record.fobAmount), currency: record.fobCurrency, unit: record.fobUnit, rawText: record.fobRawText ?? "" }
    : null;
  const moq = record.moqQuantity !== null || record.moqUnit !== null || record.moqNotes !== null || record.moqRawText !== null
    ? { quantity: record.moqQuantity, unit: record.moqUnit, notes: record.moqNotes, rawText: record.moqRawText ?? "" }
    : null;
  const leadTime = record.leadTimeRawText !== null || record.leadTimeDays !== null
    ? { rawText: record.leadTimeRawText ?? "", days: record.leadTimeDays }
    : null;
  return {
    ...EMPTY_TIER_1_DATA,
    companyName: record.companyName,
    city: record.city,
    province: record.province,
    contact: record.contact ?? null,
    category: record.category ?? null,
    supplierType: record.supplierType,
    fob,
    moq,
    leadTime,
    interestScore: record.interestScore,
  };
}

function fieldsToColumns(fields: Tier1Data) {
  return {
    companyName: fields.companyName,
    city: fields.city,
    province: fields.province,
    contact: fields.contact,
    category: fields.category,
    supplierType: fields.supplierType,
    fobAmount: fields.fob?.amount ?? null,
    fobCurrency: fields.fob?.currency ?? null,
    fobUnit: fields.fob?.unit ?? null,
    fobRawText: fields.fob?.rawText ?? null,
    moqQuantity: fields.moq?.quantity ?? null,
    moqUnit: fields.moq?.unit ?? null,
    moqNotes: fields.moq?.notes ?? null,
    moqRawText: fields.moq?.rawText ?? null,
    leadTimeRawText: fields.leadTime?.rawText ?? null,
    leadTimeDays: fields.leadTime?.days ?? null,
    interestScore: fields.interestScore,
  };
}

function toCaptureRecord(capture: SupplierCapture & { supplier?: Supplier | null }): SupplierCaptureRecord {
  return {
    id: capture.id,
    userId: capture.createdById,
    tripId: capture.tripId,
    supplierId: capture.supplier?.id ?? null,
    status: capture.status,
    source: sourceFromCapture(capture),
    fields: fieldsFromRecord(capture),
    missingFields: parseFieldList(capture.missingFields),
    reviewFields: parseFieldList(capture.reviewFields),
    acknowledgedUnknownFields: parseFieldList(capture.acknowledgedUnknownFields),
    evidence: parseEvidence(capture.evidence),
    createdAt: capture.createdAt.toISOString(),
    updatedAt: capture.updatedAt.toISOString(),
    confirmedAt: capture.confirmedAt?.toISOString() ?? null,
  };
}

function toSupplierRecord(supplier: Supplier): SupplierRecord {
  return {
    ...fieldsFromRecord(supplier),
    id: supplier.id,
    userId: supplier.createdById,
    tripId: supplier.tripId,
    captureId: supplier.captureId,
    status: supplier.status,
    pendingFields: parseFieldList(supplier.pendingFields),
    createdAt: supplier.createdAt.toISOString(),
    updatedAt: supplier.updatedAt.toISOString(),
  };
}

export class PrismaSupplierCaptureRepository implements SupplierCaptureRepository, TripAccessRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async hasTripAccess(context: CaptureContext): Promise<boolean> {
    return new PrismaTripAccessRepository(this.prisma).hasTripAccess(context);
  }

  private async requireTripAccess(context: CaptureContext): Promise<void> {
    if (!(await this.hasTripAccess(context))) throw new AuthorizationError("No tenés acceso a este viaje");
  }

  async createDraft(input: CreateCaptureInput): Promise<SupplierCaptureRecord> {
    await this.requireTripAccess(input);
    const source = input.extraction.rawSource;
    const capture = await this.prisma.supplierCapture.create({
      data: {
        tripId: input.tripId,
        createdById: input.userId,
        sourceType: source.type as CaptureSourceType,
        sourceText: source.text ?? null,
        sourceAttachmentId: source.attachmentId ?? null,
        ...fieldsToColumns(input.extraction.extractedFields),
        missingFields: serializeFieldList(input.extraction.missingFields),
        reviewFields: serializeFieldList(input.extraction.reviewFields),
        acknowledgedUnknownFields: [],
        evidence: input.extraction.evidence,
      },
      include: { supplier: true },
    });
    return toCaptureRecord(capture);
  }

  async getCapture(context: CaptureContext, captureId: string): Promise<SupplierCaptureRecord | null> {
    await this.requireTripAccess(context);
    const capture = await this.prisma.supplierCapture.findFirst({
      where: { id: captureId, tripId: context.tripId },
      include: { supplier: true },
    });
    return capture ? toCaptureRecord(capture) : null;
  }

  async correctField(input: CorrectCaptureInput): Promise<SupplierCaptureRecord> {
    await this.requireTripAccess(input);
    const capture = await this.prisma.supplierCapture.findFirst({
      where: { id: input.captureId, tripId: input.tripId },
      include: { supplier: true },
    });
    if (!capture) throw new CaptureNotFoundError("Captura no encontrada en este viaje");
    if (capture.createdById !== input.userId) throw new AuthorizationError("No podés modificar una captura creada por otra persona");
    if (capture.status === CaptureStatus.CONFIRMED) throw new CaptureConflictError("Una captura confirmada no se puede modificar desde este flujo");

    const fields = setTier1Field(fieldsFromRecord(capture), input.field, input.value);
    const missingFields = calculateMissingFields(fields);
    const unknowns = new Set(parseFieldList(capture.acknowledgedUnknownFields));
    if (input.acknowledgedUnknown) unknowns.add(input.field);
    else unknowns.delete(input.field);
    const updated = await this.prisma.supplierCapture.update({
      where: { id: capture.id },
      data: {
        ...fieldsToColumns(fields),
        missingFields: serializeFieldList(missingFields),
        reviewFields: serializeFieldList(parseFieldList(capture.reviewFields).filter((field) => field !== input.field)),
        acknowledgedUnknownFields: serializeFieldList([...unknowns].filter((field) => missingFields.includes(field))),
      },
      include: { supplier: true },
    });
    return toCaptureRecord(updated);
  }

  async confirm(context: CaptureContext, captureId: string): Promise<{ capture: SupplierCaptureRecord; supplier: SupplierRecord }> {
    await this.requireTripAccess(context);
    return this.prisma.$transaction(async (transaction) => {
      const capture = await transaction.supplierCapture.findFirst({
        where: { id: captureId, tripId: context.tripId },
        include: { supplier: true },
      });
      if (!capture) throw new CaptureNotFoundError("Captura no encontrada en este viaje");
      if (capture.createdById !== context.userId) throw new AuthorizationError("No podés modificar una captura creada por otra persona");
      if (capture.status === CaptureStatus.CONFIRMED && capture.supplier) {
        return { capture: toCaptureRecord(capture), supplier: toSupplierRecord(capture.supplier) };
      }
      const captureRecord = toCaptureRecord(capture);
      if (!canConfirmCapture(captureRecord)) throw new CaptureConflictError("La categoría debe completarse o marcarse como pendiente");

      const { contact, ...supplierColumns } = fieldsToColumns(captureRecord.fields);
      const supplier = await transaction.supplier.create({
        data: {
          tripId: context.tripId,
          createdById: context.userId,
          captureId: capture.id,
          ...supplierColumns,
          pendingFields: serializeFieldList(captureRecord.missingFields),
          ...(contact ? { contacts: { create: { tripId: context.tripId, createdById: context.userId, rawText: contact } } } : {}),
        },
      });
      const updated = await transaction.supplierCapture.update({
        where: { id: capture.id },
        data: { status: CaptureStatus.CONFIRMED, confirmedAt: new Date() },
        include: { supplier: true },
      });
      if (!updated.supplier) throw new CaptureConflictError("No se pudo asociar el proveedor a la captura");
      return { capture: toCaptureRecord(updated), supplier: toSupplierRecord(supplier) };
    });
  }

  async listCaptures(context: CaptureContext): Promise<SupplierCaptureRecord[]> {
    await this.requireTripAccess(context);
    const captures = await this.prisma.supplierCapture.findMany({
      where: { tripId: context.tripId },
      include: { supplier: true },
      orderBy: { updatedAt: "desc" },
    });
    return captures.map(toCaptureRecord);
  }

  async listSuppliers(context: CaptureContext): Promise<SupplierRecord[]> {
    await this.requireTripAccess(context);
    const suppliers = await this.prisma.supplier.findMany({
      where: { tripId: context.tripId },
      orderBy: { updatedAt: "desc" },
    });
    return suppliers.map(toSupplierRecord);
  }
}
