import type { Prisma, PrismaClient } from "../../../generated/prisma/client.ts";
import { PrismaSupplierCaptureRepository } from "../../bot/persistence/prisma-repository.ts";
import { CaptureNotFoundError } from "../../bot/persistence/repository.ts";
import { authorizedOperationCompanies, writableCaptureForOperation, type OperationContext, type OperationAccess } from "./capture-access.ts";

export async function operationCompanies(db: Prisma.TransactionClient, context: OperationContext, access: OperationAccess) {
  const ids = await authorizedOperationCompanies(db, context, access);
  return db.tripCompany.findMany({ where: { tripId: context.tripId, ...(context.companyId ? { id: context.companyId } : ids ? { id: { in: ids } } : {}), ...(access === "automation" ? { active: true } : {}) }, select: { id: true, catalogCompany: { select: { name: true } } } });
}

/** Record references may span authorized trips; identity always comes from server. */
export async function getBusinessRecord(db: Prisma.TransactionClient, actor: { userId: string }, kind: "SUPPLIER" | "PRODUCT", id: string) {
  if (kind === "PRODUCT") {
    const product = await db.supplierProduct.findUnique({ where: { id }, include: { capture: true, images: true } });
    if (!product) throw new CaptureNotFoundError("Producto no encontrado");
    await operationCompanies(db, { ...actor, tripId: product.capture.tripId, companyId: product.capture.companyId }, "automation");
    return { kind: "PRODUCT" as const, product };
  }
  const supplier = await db.supplier.findFirst({ where: { OR: [{ id }, { captureId: id }] }, include: { contacts: true } });
  if (supplier) {
    const companies = await operationCompanies(db, { ...actor, tripId: supplier.tripId, companyId: supplier.companyId }, "automation");
    return { kind: "SUPPLIER" as const, supplier, companyLabel: companies.find(c => c.id === supplier.companyId)!.catalogCompany.name };
  }
  const capture = await db.supplierCapture.findUnique({ where: { id } });
  if (!capture || capture.deletedAt || capture.status !== "DRAFT") throw new CaptureNotFoundError("Proveedor o borrador no encontrado");
  const companies = await operationCompanies(db, { ...actor, tripId: capture.tripId, companyId: capture.companyId }, "automation");
  return { kind: "SUPPLIER_DRAFT" as const, capture, companyLabel: companies.find(c => c.id === capture.companyId)!.catalogCompany.name };
}

/** Authorized candidate catalogue; interpretation and ranking remain with consumer. */
export async function supplierCandidates(db: Prisma.TransactionClient, context: OperationContext, access: OperationAccess, confirmedOnly = true) {
  const companies = await operationCompanies(db, context, access);
  const scope = { tripId: context.tripId, companyId: { in: companies.map(c => c.id) } };
  const suppliers = await db.supplier.findMany({ where: { ...scope, ...(confirmedOnly ? { status: "CONFIRMED" as const } : {}) }, include: { contacts: true }, orderBy: [{ companyName: "asc" }, { id: "asc" }] });
  const captures = await db.supplierCapture.findMany({ where: { ...scope, status: "DRAFT", deletedAt: null }, orderBy: [{ companyName: "asc" }, { id: "asc" }] });
  return { suppliers, captures, companies };
}

export async function productCandidates(db: Prisma.TransactionClient, context: OperationContext, access: OperationAccess, parentId?: string) {
  const companies = await operationCompanies(db, context, access);
  if (parentId && access === "automation") await getBusinessRecord(db, context, "SUPPLIER", parentId);
  return db.supplierProduct.findMany({ where: { capture: { tripId: context.tripId, companyId: { in: companies.map(c => c.id) } }, ...(parentId ? { OR: [{ supplierId: parentId }, { captureId: parentId }] } : {}) }, orderBy: [{ name: "asc" }, { id: "asc" }] });
}

export async function captureProducts(db: Prisma.TransactionClient, context: OperationContext, captureId: string) {
  await writableCaptureForOperation(db, context, captureId, "web");
  return db.supplierProduct.findMany({ where: { captureId }, include: { images: { select: { id: true } } }, orderBy: { createdAt: "asc" } });
}

export async function getCaptureDetails(db: Prisma.TransactionClient, context: OperationContext, captureId: string) {
  await authorizedOperationCompanies(db, context, "web");
  return new PrismaSupplierCaptureRepository(db as PrismaClient).getCapture(context, captureId);
}
