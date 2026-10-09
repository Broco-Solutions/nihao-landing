import { deriveProductStatus, isProductConfirmable } from "./record-completeness.ts";
import { parseNotes, mergeNotes } from "./notes.ts";
import type { PrismaClient, SupplierProduct } from "../../generated/prisma/client.ts";
import { CaptureConflictError } from "./persistence/repository.ts";
import { AuthorizationError } from "./authorization.ts";
import { accessibleCompanyIds } from "./persistence/company-access.ts";
import type { Fob, LeadTime, Moq, SupplierProductRecord } from "./types.ts";
import { ValidationError } from "./validation.ts";

type ProductData = Omit<SupplierProduct, "notes"> & { notes?: string | null };

export function productRecord(product: ProductData & { images?: { id: string }[] }): SupplierProductRecord {
  return {
    notes: product.notes ?? null, id: product.id, name: product.name, status: product.status, sourceText: product.sourceText, reviewFields: Array.isArray(product.reviewFields) ? product.reviewFields.filter((v): v is string => typeof v === "string") : [],
    fob: product.fobAmount !== null || product.fobCurrency !== null || product.fobUnit !== null || product.fobRawText !== null ? { amount: product.fobAmount === null ? null : Number(product.fobAmount), currency: product.fobCurrency, unit: product.fobUnit, rawText: product.fobRawText ?? "" } : null,
    moq: product.moqQuantity !== null || product.moqUnit !== null || product.moqNotes !== null || product.moqRawText !== null ? { quantity: product.moqQuantity, unit: product.moqUnit, notes: product.moqNotes, rawText: product.moqRawText ?? "" } : null,
    leadTime: product.leadTimeRawText !== null || product.leadTimeDays !== null ? { rawText: product.leadTimeRawText ?? "", days: product.leadTimeDays } : null,
    imageIds: product.images?.map((image) => image.id) ?? [],
  };
}

function optionalText(value: unknown, label: string, max = 500): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > max) throw new ValidationError(`${label} no es válido`);
  return value.trim();
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("Datos inválidos");
  return value as Record<string, unknown>;
}

function nonnegative(value: unknown, label: string, integer = false): number | null {
  if (value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) throw new ValidationError(`${label} no es válido`);
  return value;
}

export function parseProduct(value: unknown) {
  const input = record(value);
  const name = optionalText(input.name, "Nombre", 120);
  if (!name) throw new ValidationError("El producto necesita un nombre");
  const fob = input.fob == null ? null : record(input.fob) as Fob;
  const moq = input.moq == null ? null : record(input.moq) as Moq;
  const leadTime = input.leadTime == null ? null : record(input.leadTime) as LeadTime;
  return {
    notes: parseNotes(input.notes),
    name,
    fobAmount: fob ? nonnegative(fob.amount, "FOB") : null,
    fobCurrency: fob ? optionalText(fob.currency, "Moneda", 12) : null,
    fobUnit: fob ? optionalText(fob.unit, "Unidad FOB", 80) : null,
    fobRawText: fob ? optionalText(fob.rawText, "Texto FOB") : null,
    moqQuantity: moq ? nonnegative(moq.quantity, "MOQ", true) : null,
    moqUnit: moq ? optionalText(moq.unit, "Unidad MOQ", 80) : null,
    moqNotes: moq ? optionalText(moq.notes, "Notas MOQ") : null,
    moqRawText: moq ? optionalText(moq.rawText, "Texto MOQ") : null,
    leadTimeRawText: leadTime ? optionalText(leadTime.rawText, "Lead time") : null,
    leadTimeDays: leadTime ? nonnegative(leadTime.days, "Días", true) : null,
  };
}

/** Manual web confirmation remains supported; the agent also derives status from completeness. */
export function productUpdateData(existing: ProductData, value: unknown) {
  const body = record(value);
  if ("confirm" in body && body.confirm !== true) throw new ValidationError("Confirmación inválida");
  const allowed = ["tripId", "confirm", "status", "notes", "notesMode", "name", "fob", "moq", "leadTime"];
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw new ValidationError("Campo de producto inválido");
  const current = productRecord(existing);
  const merged = { ...current, ...body };
  const empty = { fob: { amount: null, currency: null, unit: null, rawText: "" }, moq: { quantity: null, unit: null, notes: null, rawText: "" }, leadTime: { days: null, rawText: "" } };
  for (const field of ["fob", "moq", "leadTime"] as const) {
    if (body[field] && typeof body[field] === "object") merged[field] = { ...(current[field] ?? empty[field]), ...body[field] } as never;
  }
  if (body.notesMode !== undefined && !["append", "replace"].includes(String(body.notesMode))) throw new ValidationError("Modo de notas inválido");
  if ("notes" in body) merged.notes = body.notesMode === "replace" ? parseNotes(body.notes) : mergeNotes(existing.notes, body.notes);
  const data = parseProduct(merged);
  if (body.confirm === true && !isProductConfirmable(data)) throw new ValidationError("Completá el nombre antes de confirmar el producto");
  return { ...data, status: deriveProductStatus({ ...data, status: existing.status }), ...(body.confirm === true ? { reviewFields: [] } : {}) };
}

/** Preserve omitted components when updating a supplier's commercial conditions. */
export function supplierCommercialUpdate(existing: Pick<SupplierProduct, "fobCurrency" | "fobUnit" | "fobRawText" | "moqQuantity" | "moqUnit" | "moqNotes" | "moqRawText" | "leadTimeDays" | "leadTimeRawText"> & { fobAmount: SupplierProduct["fobAmount"] | number }, patch: Record<string, unknown>) {
  const current = {
    fob: { amount: existing.fobAmount == null ? null : Number(existing.fobAmount), currency: existing.fobCurrency, unit: existing.fobUnit, rawText: existing.fobRawText ?? "" },
    moq: { quantity: existing.moqQuantity, unit: existing.moqUnit, notes: existing.moqNotes, rawText: existing.moqRawText ?? "" },
    leadTime: { days: existing.leadTimeDays, rawText: existing.leadTimeRawText ?? "" },
  };
  const result: Record<string, unknown> = {};
  for (const key of ["fob", "moq", "leadTime"] as const) if (key in patch) {
    const value = patch[key];
    const merged = value && typeof value === "object" ? { ...current[key], ...value } : value;
    const parsed = parseProduct({ name: "Condiciones de proveedor", [key]: merged });
    const columns = key === "fob" ? ["fobAmount", "fobCurrency", "fobUnit", "fobRawText"] as const : key === "moq" ? ["moqQuantity", "moqUnit", "moqNotes", "moqRawText"] as const : ["leadTimeDays", "leadTimeRawText"] as const;
    for (const column of columns) result[column] = parsed[column];
  }
  return result;
}

export function parseSupplierEdit(value: unknown) {
  const input = record(value);
  const allowed = ["tripId", "notes", "notesMode", "companyName", "companyNameLatin", "city", "province", "category", "supplierType", "interestScore", "website", "contacts", "fob", "moq", "leadTime"];
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw new ValidationError("Campo de proveedor inválido");
  const data: Record<string, unknown> = {};
  Object.assign(data, supplierCommercialUpdate(parseProduct({ name: "Condiciones de proveedor" }), input));
  if ("notes" in input) data.notes = parseNotes(input.notes);
  if (input.notesMode !== undefined && !["append", "replace"].includes(String(input.notesMode))) throw new ValidationError("Modo de notas inválido");
  for (const key of ["companyName", "companyNameLatin", "city", "province", "category"] as const) if (key in input) data[key] = optionalText(input[key], key);
  if ("supplierType" in input) {
    if (!["FACTORY", "TRADING", "UNKNOWN"].includes(String(input.supplierType))) throw new ValidationError("Tipo de proveedor inválido");
    data.supplierType = input.supplierType;
  }
  if ("interestScore" in input) {
    const score = input.interestScore;
    if (score !== null && (!Number.isInteger(score) || Number(score) < 1 || Number(score) > 10)) throw new ValidationError("Interés debe estar entre 1 y 10");
    data.interestScore = score;
  }
  if ("website" in input) {
    const website = optionalText(input.website, "Sitio web", 2048);
    if (website && (!/^https?:\/\//i.test(website) || !URL.canParse(website))) throw new ValidationError("El sitio web debe empezar con http:// o https://");
    data.website = website;
  }
  let contacts: Array<{ type: string | null; rawText: string }> | undefined;
  if ("contacts" in input) {
    if (!Array.isArray(input.contacts) || input.contacts.length > 30) throw new ValidationError("Contactos inválidos");
    contacts = input.contacts.map((item) => {
      const contact = record(item);
      const type = contact.type == null ? null : String(contact.type);
      if (type !== null && !["EMAIL", "PHONE", "FAX", "WECHAT"].includes(type)) throw new ValidationError("Tipo de contacto inválido");
      const rawText = optionalText(contact.rawText, "Contacto");
      if (!rawText) throw new ValidationError("El contacto no puede estar vacío");
      if (type === "EMAIL" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawText)) throw new ValidationError("Email inválido");
      return { type, rawText };
    });
  }
  return { data, contacts };
}

export async function writableCapture(prisma: PrismaClient, userId: string, tripId: string, captureId: string) {
  const companies = await accessibleCompanyIds(prisma, userId, tripId);
  const capture = await prisma.supplierCapture.findFirst({ where: { id: captureId, tripId, ...(companies ? { companyId: { in: companies } } : {}) }, include: { supplier: true } });
  if (!capture) throw new AuthorizationError("Captura no encontrada en este viaje");
  if (capture.deletedAt) throw new CaptureConflictError("El proveedor fue eliminado. Esta captura conserva las evidencias originales y no admite cambios.");
  return capture;
}

export async function writableSupplier(prisma: Pick<PrismaClient, "supplier" | "tripMember" | "tripCompanyMember">, userId: string, tripId: string, supplierId: string) {
  const companies = await accessibleCompanyIds(prisma, userId, tripId);
  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, tripId, ...(companies ? { companyId: { in: companies } } : {}) } });
  if (!supplier) throw new AuthorizationError("Proveedor no encontrado en este viaje");
  if (companies && !companies.includes(supplier.companyId)) throw new AuthorizationError("No tenés acceso a esta empresa");
  return supplier;
}
