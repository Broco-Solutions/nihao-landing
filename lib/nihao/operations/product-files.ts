import type { Prisma } from "../../../generated/prisma/client.ts";
import { CaptureConflictError, CaptureNotFoundError } from "../../bot/persistence/repository.ts";
import { deriveProductStatus, isValidProductImage } from "../../bot/record-completeness.ts";
import { ValidationError } from "../../bot/validation.ts";
import { writableProductCapture, type ProductAccess, type ProductOperationContext } from "./product-access.ts";

export type ProductAttachmentCommand = { captureId: string; attachmentId: string; productId: string | null };
export type ProductSourceEvidence = { id: string; [field: string]: unknown };

/** Metadata only. Upload/storage/transcription stay outside this transaction. */
export async function assignProductAttachment(tx: Prisma.TransactionClient, context: ProductOperationContext, command: ProductAttachmentCommand, access: ProductAccess) {
  await writableProductCapture(tx, context, command.captureId, access);
  if (access === "automation" && command.productId === null) throw new ValidationError("La automatización no desasigna evidencias");
  if (command.productId !== null) {
    if (typeof command.productId !== "string") throw new ValidationError("Producto inválido");
    await tx.$queryRaw`SELECT id FROM "SupplierProduct" WHERE id = ${command.productId} AND "captureId" = ${command.captureId} FOR UPDATE`;
    if (!await tx.supplierProduct.findFirst({ where: { id: command.productId, captureId: command.captureId } })) throw new ValidationError("Producto inválido");
  }
  return assignAuthorizedAttachment(tx, command, access);
}

/** Capture access and target product lock have already been checked by the caller. */
async function assignAuthorizedAttachment(tx: Prisma.TransactionClient, command: ProductAttachmentCommand, access: ProductAccess) {
  await tx.$queryRaw`SELECT id FROM "SupplierAttachment" WHERE id = ${command.attachmentId} AND "supplierCaptureId" = ${command.captureId} FOR UPDATE`;
  const attachment = await tx.supplierAttachment.findFirst({ where: { id: command.attachmentId, supplierCaptureId: command.captureId, ...(access === "web" ? { type: "PRODUCT_IMAGE" } : {}) } });
  if (!attachment) throw new ValidationError(access === "web" ? "Imagen no encontrada" : "Evidencia no encontrada en esta captura");
  if (access === "automation" && attachment.productId !== null && attachment.productId !== command.productId) throw new CaptureConflictError("La evidencia ya pertenece a otro producto");
  if (attachment.productId === command.productId) return attachment;
  return tx.supplierAttachment.update({ where: { id: attachment.id }, data: { productId: command.productId } });
}

/** Caller records completion/receipt in this same transaction after all uploads succeed. */
export async function finalizeProduct(tx: Prisma.TransactionClient, context: ProductOperationContext, command: {
  captureId: string; productId: string;
  attachmentIds?: string[];
  sources?: ProductSourceEvidence[];
}, access: ProductAccess) {
  await writableProductCapture(tx, context, command.captureId, access);
  await tx.$queryRaw`SELECT id FROM "SupplierProduct" WHERE id = ${command.productId} AND "captureId" = ${command.captureId} FOR UPDATE`;
  const product = await tx.supplierProduct.findFirst({ where: { id: command.productId, captureId: command.captureId } });
  if (!product) throw new CaptureNotFoundError("Producto no encontrado");
  // Stable order keeps overlapping attachment batches from acquiring locks differently.
  for (const attachmentId of [...new Set(command.attachmentIds ?? [])].sort()) {
    await assignAuthorizedAttachment(tx, { captureId: command.captureId, productId: product.id, attachmentId }, access);
  }
  const images = await tx.supplierAttachment.findMany({ where: { productId: product.id } });
  const oldSources = Array.isArray(product.sourceEvidence) ? product.sourceEvidence as ProductSourceEvidence[] : [];
  const sources = new Map(oldSources.map(source => [source.id, source]));
  for (const source of command.sources ?? []) {
    if (source.productImageVerified === true) {
      const image = images.find(image => image.id === source.attachmentId);
      if (!image || !isValidProductImage({ ...image, verified: true }, product.id)) throw new ValidationError("La prueba visual no corresponde a una imagen válida de este producto");
    }
    sources.set(source.id, { ...sources.get(source.id), ...source });
  }
  const status = deriveProductStatus({ ...product, images });
  const data = {
    ...(status !== product.status ? { status } : {}),
    ...(command.sources !== undefined ? { sourceEvidence: JSON.parse(JSON.stringify([...sources.values()])) as Prisma.InputJsonValue } : {}),
  };
  if (Object.keys(data).length) await tx.supplierProduct.update({ where: { id: product.id }, data });
  return { name: product.name, resourceStatus: status, newlyConfirmed: status === "CONFIRMED" && status !== product.status };
}
