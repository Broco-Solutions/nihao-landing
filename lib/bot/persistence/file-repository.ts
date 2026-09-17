import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { calculateMissingFields, canConfirmCapture, setTier1Field } from "../tier1.ts";
import type { BotDatabase, StructuredExtractionResult, SupplierCaptureRecord, SupplierRecord, Tier1Field } from "../types.ts";
import {
  CaptureConflictError,
  CaptureNotFoundError,
  type CaptureContext,
  type CorrectCaptureInput,
  type CreateCaptureInput,
  type SupplierCaptureRepository,
} from "./repository.ts";

const EMPTY_DATABASE: BotDatabase = {
  schemaVersion: 1,
  users: [],
  trips: [],
  suppliers: [],
  contacts: [],
  captures: [],
  attachments: [],
};

let writeQueue: Promise<unknown> = Promise.resolve();

function cloneEmptyDatabase(): BotDatabase {
  return structuredClone(EMPTY_DATABASE);
}

function scopedCapture(database: BotDatabase, context: CaptureContext, captureId: string): SupplierCaptureRecord {
  const capture = database.captures.find(
    (candidate) => candidate.id === captureId && candidate.userId === context.userId && candidate.tripId === context.tripId,
  );
  if (!capture) throw new CaptureNotFoundError("Captura no encontrada en este usuario/viaje");
  return capture;
}

export class FileSupplierCaptureRepository implements SupplierCaptureRepository {
  constructor(private readonly filename = process.env.NIHAO_BOT_DATA_FILE ?? path.join(process.cwd(), ".data", "nihao-bot.json")) {}

  private async read(): Promise<BotDatabase> {
    try {
      const database = JSON.parse(await readFile(this.filename, "utf8")) as BotDatabase;
      if (database.schemaVersion !== 1 || !Array.isArray(database.captures) || !Array.isArray(database.suppliers)) {
        throw new Error("Formato de persistencia no compatible");
      }
      return database;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return cloneEmptyDatabase();
      throw error;
    }
  }

  private async transaction<T>(operation: (database: BotDatabase) => T | Promise<T>): Promise<T> {
    const run = writeQueue.then(async () => {
      const database = await this.read();
      const result = await operation(database);
      await mkdir(path.dirname(this.filename), { recursive: true });
      const temporary = `${this.filename}.${randomUUID()}.tmp`;
      await writeFile(temporary, `${JSON.stringify(database, null, 2)}\n`, "utf8");
      await rename(temporary, this.filename);
      return result;
    });
    writeQueue = run.catch(() => undefined);
    return run;
  }

  async createDraft(input: CreateCaptureInput): Promise<SupplierCaptureRecord> {
    return this.transaction((database) => {
      const now = new Date().toISOString();
      const existingUser = database.users.find((user) => user.id === input.userId);
      if (!existingUser) database.users.push({ id: input.userId, displayName: null, createdAt: now, updatedAt: now });

      const existingTrip = database.trips.find((trip) => trip.id === input.tripId);
      if (existingTrip && existingTrip.userId !== input.userId) throw new CaptureConflictError("El viaje pertenece a otro usuario");
      if (!existingTrip) database.trips.push({ id: input.tripId, userId: input.userId, name: input.tripName ?? "Viaje sin nombre", startDate: null, endDate: null, status: "ACTIVE", role: "ADMIN", createdAt: now, updatedAt: now });

      const capture: SupplierCaptureRecord = {
        id: randomUUID(),
        userId: input.userId,
        tripId: input.tripId,
        supplierId: null,
        status: "DRAFT",
        source: input.extraction.rawSource,
        fields: input.extraction.extractedFields,
        missingFields: input.extraction.missingFields,
        reviewFields: input.extraction.reviewFields,
        acknowledgedUnknownFields: [],
        evidence: input.extraction.evidence,
        humanCorrectedFields: [],
        analyzedAttachmentIds: [],
        needsReanalysis: false,
        createdAt: now,
        updatedAt: now,
        confirmedAt: null,
      };
      database.captures.push(capture);
      return capture;
    });
  }

  async getCapture(context: CaptureContext, captureId: string): Promise<SupplierCaptureRecord | null> {
    const database = await this.read();
    return database.captures.find(
      (capture) => capture.id === captureId && capture.userId === context.userId && capture.tripId === context.tripId,
    ) ?? null;
  }

  async replaceExtraction(context: CaptureContext, captureId: string, extraction: StructuredExtractionResult, options?: { analyzedAttachmentIds?: string[] }): Promise<SupplierCaptureRecord> {
    return this.transaction((database) => {
      const capture = scopedCapture(database, context, captureId);
      if (capture.status === "CONFIRMED") throw new CaptureConflictError("Una captura confirmada no se puede modificar desde este flujo");
      capture.source = extraction.rawSource;
      const corrected = new Set(capture.humanCorrectedFields ?? []);
      const fields = { ...extraction.extractedFields };
      for (const field of corrected) fields[field] = capture.fields[field] as never;
      capture.fields = fields;
      capture.missingFields = calculateMissingFields(fields);
      capture.reviewFields = extraction.reviewFields.filter((field) => !corrected.has(field));
      capture.acknowledgedUnknownFields = capture.acknowledgedUnknownFields.filter((field) => capture.missingFields.includes(field));
      capture.evidence = extraction.evidence;
      capture.analyzedAttachmentIds = [...new Set(options?.analyzedAttachmentIds ?? [])];
      capture.needsReanalysis = false;
      capture.updatedAt = new Date().toISOString();
      return capture;
    });
  }

  async correctField(input: CorrectCaptureInput): Promise<SupplierCaptureRecord> {
    return this.transaction((database) => {
      const capture = scopedCapture(database, input, input.captureId);
      if (capture.status === "CONFIRMED") throw new CaptureConflictError("Una captura confirmada no se puede modificar desde este flujo");

      capture.fields = setTier1Field(capture.fields, input.field, input.value);
      capture.missingFields = calculateMissingFields(capture.fields);
      capture.reviewFields = capture.reviewFields.filter((field) => field !== input.field);
      const unknowns = new Set(capture.acknowledgedUnknownFields);
      if (input.acknowledgedUnknown) unknowns.add(input.field);
      else unknowns.delete(input.field);
      capture.acknowledgedUnknownFields = [...unknowns].filter((field): field is Tier1Field => capture.missingFields.includes(field));
      capture.humanCorrectedFields = [...new Set([...(capture.humanCorrectedFields ?? []), input.field])];
      capture.updatedAt = new Date().toISOString();
      return capture;
    });
  }

  async confirm(context: CaptureContext, captureId: string): Promise<{ capture: SupplierCaptureRecord; supplier: SupplierRecord }> {
    return this.transaction((database) => {
      const capture = scopedCapture(database, context, captureId);
      if (capture.status === "CONFIRMED" && capture.supplierId) {
        const supplier = database.suppliers.find((candidate) => candidate.id === capture.supplierId);
        if (!supplier) throw new CaptureConflictError("La captura confirmada no tiene proveedor asociado");
        return { capture, supplier };
      }
      if (!canConfirmCapture(capture)) throw new CaptureConflictError("La categoría debe completarse o marcarse como pendiente");

      const now = new Date().toISOString();
      const supplier: SupplierRecord = {
        ...capture.fields,
        id: randomUUID(),
        userId: context.userId,
        tripId: context.tripId,
        captureId: capture.id,
        status: "CONFIRMED",
        pendingFields: capture.missingFields,
        createdAt: now,
        updatedAt: now,
      };
      database.suppliers.push(supplier);
      if (capture.fields.contact) {
        database.contacts.push({
          id: randomUUID(),
          userId: context.userId,
          tripId: context.tripId,
          supplierId: supplier.id,
          rawText: capture.fields.contact,
          createdAt: now,
          updatedAt: now,
        });
      }
      capture.status = "CONFIRMED";
      capture.supplierId = supplier.id;
      capture.confirmedAt = now;
      capture.updatedAt = now;
      return { capture, supplier };
    });
  }

  async listCaptures(context: CaptureContext): Promise<SupplierCaptureRecord[]> {
    const database = await this.read();
    return database.captures
      .filter((capture) => capture.userId === context.userId && capture.tripId === context.tripId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async listSuppliers(context: CaptureContext): Promise<SupplierRecord[]> {
    const database = await this.read();
    return database.suppliers
      .filter((supplier) => supplier.userId === context.userId && supplier.tripId === context.tripId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }
}
