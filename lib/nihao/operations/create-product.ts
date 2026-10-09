import type { Prisma } from "../../../generated/prisma/client.ts";
import { AuthorizationError } from "../../bot/authorization.ts";
import { CaptureConflictError } from "../../bot/persistence/repository.ts";
import { deriveProductStatus } from "../../bot/record-completeness.ts";
import { parseProduct } from "../../bot/supplier-edit.ts";

import { writableProductCapture, type ProductOperationContext, type ProductAccess } from "./product-access.ts";
export type { ProductOperationContext } from "./product-access.ts";

export type CreateProductCommand = {
  captureId: string;
  /** undefined derives the confirmed supplier; null deliberately keeps a draft target. */
  supplierId?: string | null;
  fields: unknown;
  /** Existing deterministic product ID. The caller's durable receipt owns command replay. */
  id?: string;
  trace?: { sourceText?: string | null; sourceEvidence?: unknown; sourceConflicts?: unknown; reviewFields?: unknown };
};

/** These capabilities are selected by server code, not by the model or the browser. */
export type ProductCreationPolicy = {
  access: ProductAccess;
  confirmation: "immediate" | "after-evidence";
};

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/**
 * Caller owns the transaction, including its lease/revision guard and durable receipt.
 * No model, channel or file transfer is performed here. Reusing the same transaction
 * keeps product creation atomic with the adapter's operation record.
 */
export async function createProduct(
  tx: Prisma.TransactionClient,
  context: ProductOperationContext,
  command: CreateProductCommand,
  policy: ProductCreationPolicy,
) {
  const capture = await writableProductCapture(tx, context, command.captureId, policy.access);
  const supplierId = command.supplierId === undefined ? capture.supplier?.id ?? null : command.supplierId;
  if (supplierId !== null && supplierId !== capture.supplier?.id) throw new AuthorizationError("Proveedor no encontrado en esta captura");
  // A null target is retained for in-flight draft operations; promotion links it later.
  const fields = parseProduct(command.fields);
  const status = policy.confirmation === "after-evidence" ? "DRAFT" : deriveProductStatus({ ...fields, status: "DRAFT" });
  const trace = command.trace;
  const data = {
    ...fields, status, captureId: capture.id, supplierId,
    ...(command.id ? { id: command.id } : {}),
    ...(trace?.sourceText !== undefined ? { sourceText: trace.sourceText } : {}),
    ...(trace?.sourceEvidence !== undefined ? { sourceEvidence: json(trace.sourceEvidence) } : {}),
    ...(trace?.sourceConflicts !== undefined ? { sourceConflicts: json(trace.sourceConflicts) } : {}),
    ...(trace?.reviewFields !== undefined ? { reviewFields: json(trace.reviewFields) } : {}),
  } satisfies Prisma.SupplierProductUncheckedCreateInput;
  // Also serializes legacy retries, whose caller has no operation receipt table.
  if (command.id) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`nihao-product:${command.id}`}))`;
  const product = command.id
    ? await tx.supplierProduct.upsert({ where: { id: command.id }, create: data, update: {}, include: { images: { select: { id: true } } } })
    : await tx.supplierProduct.create({ data, include: { images: { select: { id: true } } } });
  if (product.captureId !== capture.id || product.supplierId !== supplierId) throw new CaptureConflictError("El destino del producto cambió");
  return product;
}
