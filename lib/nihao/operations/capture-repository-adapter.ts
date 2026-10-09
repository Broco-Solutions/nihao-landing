import type { PrismaClient } from "../../../generated/prisma/client.ts";
import type { CaptureContext, CorrectCaptureInput, CreateCaptureInput, SupplierCaptureRepository, TripAccessRepository } from "../../bot/persistence/repository.ts";
import { PrismaSupplierCaptureRepository } from "../../bot/persistence/prisma-repository.ts";
import { PrismaTripAccessRepository } from "../../bot/persistence/prisma-trip-access-repository.ts";
import { authorizedOperationCompanies, writableCaptureForOperation, type OperationAccess } from "./capture-access.ts";
import { createSupplierCapture, replaceSupplierExtraction } from "./capture-lifecycle.ts";
import { correctSupplierCapture, confirmSupplierCapture } from "./supplier-operations.ts";
import type { StructuredExtractionResult } from "../../bot/types.ts";

/** Compatibility port for extraction and legacy consumers; all mutations use operations. */
export class OperationsCaptureRepository implements SupplierCaptureRepository, TripAccessRepository {
  constructor(private readonly prisma: PrismaClient, private readonly access: OperationAccess = "web") {}

  hasTripAccess(context: CaptureContext) { return new PrismaTripAccessRepository(this.prisma).hasTripAccess(context); }

  private async reader(context: CaptureContext) {
    await authorizedOperationCompanies(this.prisma, context, this.access);
    return new PrismaSupplierCaptureRepository(this.prisma);
  }

  async getCapture(context: CaptureContext, id: string) {
    const record = await (await this.reader(context)).getCapture(context, id);
    if (record) await authorizedOperationCompanies(this.prisma, { ...context, companyId: record.companyId }, this.access);
    return record;
  }
  async getSupplier(context: CaptureContext, id: string) {
    const record = await (await this.reader(context)).getSupplier(context, id);
    if (record) await authorizedOperationCompanies(this.prisma, { ...context, companyId: record.companyId }, this.access);
    return record;
  }
  async listCaptures(context: CaptureContext) {
    const ids = await authorizedOperationCompanies(this.prisma, context, this.access);
    return (await (await this.reader(context)).listCaptures(context)).filter(record => !ids || Boolean(record.companyId && ids.includes(record.companyId)));
  }
  async listSuppliers(context: CaptureContext) {
    const ids = await authorizedOperationCompanies(this.prisma, context, this.access);
    return (await (await this.reader(context)).listSuppliers(context)).filter(record => !ids || Boolean(record.companyId && ids.includes(record.companyId)));
  }

  createDraft(input: CreateCaptureInput) {
    const { userId, tripId, companyId, ...command } = input;
    return this.prisma.$transaction(tx => createSupplierCapture(tx, { userId, tripId, companyId }, command, this.access));
  }

  replaceExtraction(context: CaptureContext, captureId: string, extraction: StructuredExtractionResult, options?: { analyzedAttachmentIds?: string[]; expectedVersion?: string }) {
    return this.prisma.$transaction(tx => replaceSupplierExtraction(tx, context, { captureId, extraction, ...options }, this.access));
  }

  correctField(input: CorrectCaptureInput) {
    return this.prisma.$transaction(async tx => {
      if (this.access === "automation") await writableCaptureForOperation(tx, input, input.captureId, this.access);
      return correctSupplierCapture(tx, input, input);
    });
  }

  confirm(context: CaptureContext, captureId: string) {
    return this.prisma.$transaction(async tx => {
      if (this.access === "automation") await writableCaptureForOperation(tx, context, captureId, this.access);
      return confirmSupplierCapture(tx, context, { captureId });
    });
  }
}
