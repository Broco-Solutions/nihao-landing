import type { PrismaClient, SupplierProduct } from "../../generated/prisma/client.ts";
import { AuthorizationError } from "./authorization.ts";
import { accessibleCompanyIds } from "./persistence/company-access.ts";
import type { Fob, LeadTime, Moq, SupplierProductRecord } from "./types.ts";
import { ValidationError } from "./validation.ts";

export function productRecord(product: SupplierProduct & { images?: { id: string }[] }): SupplierProductRecord {
  return {
    id: product.id, name: product.name, status: product.status, sourceText: product.sourceText, reviewFields: Array.isArray(product.reviewFields) ? product.reviewFields.filter((v): v is string => typeof v === "string") : [],
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
export function productUpdateData(existing: SupplierProduct, value: unknown) {
  const body = record(value);
  if ("confirm" in body && body.confirm !== true) throw new ValidationError("Confirmación inválida");
  if (body.confirm === true && !existing.supplierId) throw new ValidationError("El producto debe estar asociado a un proveedor confirmado");
  const allowed = ["tripId", "confirm", "status", "name", "fob", "moq", "leadTime"];
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw new ValidationError("Campo de producto inválido");
  const current = productRecord(existing);
  const merged = { ...current, ...body };
  const empty = { fob: { amount: null, currency: null, unit: null, rawText: "" }, moq: { quantity: null, unit: null, notes: null, rawText: "" }, leadTime: { days: null, rawText: "" } };
  for (const field of ["fob", "moq", "leadTime"] as const) {
    if (body[field] && typeof body[field] === "object") merged[field] = { ...(current[field] ?? empty[field]), ...body[field] } as never;
  }
  const data = parseProduct(merged);
  if (body.confirm === true && data.name === "Producto sin nombre") throw new ValidationError("Completá el nombre antes de confirmar el producto");
  return { ...data, ...(body.confirm === true ? { status: "CONFIRMED" as const, reviewFields: [] } : {}) };
}

export function parseSupplierEdit(value: unknown) {
  const input = record(value);
  const allowed = ["tripId", "companyName", "city", "province", "category", "supplierType", "interestScore", "website", "contacts"];
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw new ValidationError("Campo de proveedor inválido");
  const data: Record<string, unknown> = {};
  for (const key of ["companyName", "city", "province", "category"] as const) if (key in input) data[key] = optionalText(input[key], key);
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
  return capture;
}

export async function writableSupplier(prisma: PrismaClient, userId: string, tripId: string, supplierId: string) {
  const companies = await accessibleCompanyIds(prisma, userId, tripId);
  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, tripId, ...(companies ? { companyId: { in: companies } } : {}) } });
  if (!supplier) throw new AuthorizationError("Proveedor no encontrado en este viaje");
  if (companies && !companies.includes(supplier.companyId)) throw new AuthorizationError("No tenés acceso a esta empresa");
  return supplier;
}
