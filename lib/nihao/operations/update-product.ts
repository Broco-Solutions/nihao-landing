import type { Prisma } from "../../../generated/prisma/client.ts";
import { CaptureConflictError, CaptureNotFoundError } from "../../bot/persistence/repository.ts";
import { productUpdateData } from "../../bot/supplier-edit.ts";
import { ValidationError } from "../../bot/validation.ts";
import { writableProductCapture, type ProductOperationContext, type ProductAccess } from "./product-access.ts";

export type UpdateProductCommand = {
  captureId: string;
  productId: string;
  patch: unknown;
  /** Server-observed version, including the version of a previously approved proposal. */
  expectedVersion?: string;
};

/** Caller keeps any approval, receipt and lease checks in this same transaction. */
export async function updateProduct(tx: Prisma.TransactionClient, context: ProductOperationContext, command: UpdateProductCommand, access: ProductAccess) {
  const capture = await writableProductCapture(tx, context, command.captureId, access);
  if (access === "web" && command.patch && typeof command.patch === "object" && "confirm" in command.patch && command.patch.confirm === true && capture.needsReanalysis) {
    throw new ValidationError("Analizá la nueva evidencia antes de confirmar el producto");
  }
  // Serialize read/merge/write so concurrent partial edits preserve omitted fields.
  await tx.$queryRaw`SELECT id FROM "SupplierProduct" WHERE id = ${command.productId} AND "captureId" = ${capture.id} FOR UPDATE`;
  const existing = await tx.supplierProduct.findFirst({ where: { id: command.productId, captureId: capture.id } });
  if (!existing) throw new CaptureNotFoundError("Producto no encontrado");
  if (command.expectedVersion !== undefined && existing.updatedAt.toISOString() !== command.expectedVersion) {
    throw new CaptureConflictError("El registro cambió. Volvé a consultarlo antes de aplicar la corrección");
  }
  return tx.supplierProduct.update({ where: { id: existing.id }, data: productUpdateData(existing, command.patch), include: { images: { select: { id: true } } } });
}
