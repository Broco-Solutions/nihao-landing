import { AuthorizationError } from "../../bot/authorization.ts";
import type { Prisma } from "../../../generated/prisma/client.ts";
import { writableCaptureForOperation, type OperationContext } from "./capture-access.ts";
import { writableSupplier } from "../../bot/supplier-edit.ts";
import { CaptureConflictError, CaptureNotFoundError } from "../../bot/persistence/repository.ts";
import { ValidationError } from "../../bot/validation.ts";

/** Web capability only: sharing operations does not grant deletion to automation. */
export async function deleteProduct(tx: Prisma.TransactionClient, context: OperationContext, command: { captureId: string; productId: string }) {
  await writableCaptureForOperation(tx, context, command.captureId, "web");
  await tx.$queryRaw`SELECT id FROM "SupplierProduct" WHERE id = ${command.productId} FOR UPDATE`;
  const product = await tx.supplierProduct.findFirst({ where: { id: command.productId, captureId: command.captureId }, include: { images: { select: { id: true } } } });
  if (!product) throw new CaptureNotFoundError("Producto no encontrado");
  if (product.images.length) throw new ValidationError("Desasigná las imágenes antes de eliminar el producto");
  await tx.supplierProduct.delete({ where: { id: product.id } });
}

export async function deleteSupplierRecord(tx: Prisma.TransactionClient, context: OperationContext, supplierId: string) {
  const supplier = await writableSupplier(tx, context.userId, context.tripId, supplierId);
  if (context.companyId && supplier.companyId !== context.companyId) throw new AuthorizationError("Proveedor no encontrado en esta empresa");
  await tx.$queryRaw`SELECT id FROM "SupplierCapture" WHERE id = ${supplier.captureId} FOR UPDATE`;
  const capture = await tx.supplierCapture.findUniqueOrThrow({ where: { id: supplier.captureId } });
  if (capture.tripId !== context.tripId || capture.companyId !== supplier.companyId) throw new CaptureConflictError("El proveedor cambió de contexto. Actualizá la página antes de eliminarlo.");
  await tx.supplierCapture.update({ where: { id: capture.id }, data: { deletedAt: new Date(), deletedById: context.userId } });
  await tx.supplierProduct.deleteMany({ where: { captureId: capture.id, supplierId: null } });
  await tx.supplier.delete({ where: { id: supplier.id, tripId: context.tripId, companyId: supplier.companyId } });
  return capture.id;
}
