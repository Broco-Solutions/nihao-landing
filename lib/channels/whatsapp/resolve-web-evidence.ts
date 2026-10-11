import type { PrismaClient, Prisma } from "../../../generated/prisma/client.ts";
import { AuthorizationError, requireTripMember } from "../../bot/authorization.ts";
import { PrismaTripAccessRepository } from "../../bot/persistence/prisma-trip-access-repository.ts";
import { accessibleCompanyIds } from "../../bot/persistence/company-access.ts";
import { CaptureConflictError } from "../../bot/persistence/repository.ts";
import { ValidationError } from "../../bot/validation.ts";
import { parseProduct } from "../../bot/supplier-edit.ts";
import { calculateMissingFields, normalizeTier1Data } from "../../bot/tier1.ts";
import { reconcileSupplierConfirmation } from "../../bot/persistence/supplier-confirmation.ts";
import { createProduct } from "../../nihao/operations/create-product.ts";
import { updateProduct } from "../../nihao/operations/update-product.ts";
import { burstBelongsToTrip, burstHasExplicitCompany } from "./web-evidence.ts";
import { isCommercialMessage } from "./commercial-review.ts";

type Action = "DISCARD" | "LINK_SUPPLIER" | "CREATE_SUPPLIER" | "LINK_PRODUCT" | "APPLY_PRODUCT" | "CREATE_PRODUCT";
type Command = { id: string; action: Action; companyId: string; supplierId?: string; captureId?: string; productId?: string; expectedVersion?: string; name?: string; city?: string; contact?: string; fields?: Record<string, unknown> };
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const clean = (value: unknown, max: number) => typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : null;

export function parseEvidenceDecision(value: unknown): Command {
  const body = object(value);
  if (typeof body.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/iu.test(body.id)) throw new ValidationError("Operación inválida");
  if (!["DISCARD", "LINK_SUPPLIER", "CREATE_SUPPLIER", "LINK_PRODUCT", "APPLY_PRODUCT", "CREATE_PRODUCT"].includes(String(body.action))) throw new ValidationError("Elegí una acción válida");
  if (typeof body.companyId !== "string" || !body.companyId) throw new ValidationError("Elegí una empresa");
  if (body.fields !== undefined && (typeof body.fields !== "object" || body.fields === null || Array.isArray(body.fields))) throw new ValidationError("Datos comerciales inválidos");
  return body as Command;
}

export async function resolveTripWhatsAppEvidence(prisma: PrismaClient, userId: string, tripId: string, messageId: string, command: Command) {
  const membership = await requireTripMember(new PrismaTripAccessRepository(prisma), { userId, tripId });
  const allowed = await accessibleCompanyIds(prisma, userId, tripId);
  const scoped = allowed ?? (await prisma.tripCompany.findMany({ where: { tripId }, select: { id: true } })).map((company) => company.id);
  if (allowed && !allowed.includes(command.companyId)) throw new AuthorizationError("No tenés acceso a esta empresa");
  const company = await prisma.tripCompany.findFirst({ where: { id: command.companyId, tripId, active: true }, select: { id: true } });
  if (!company) throw new AuthorizationError("La empresa no está disponible en este viaje");
  return prisma.$transaction(async (tx) => {
    // The source row serializes retries and competing browser edits.
    await tx.$queryRaw`SELECT id FROM "WhatsAppBurstMessage" WHERE id = ${messageId} FOR UPDATE`;
    const previous = await tx.whatsAppEvidenceDecision.findUnique({ where: { id: command.id } });
    if (previous) {
      if (previous.messageId !== messageId || previous.actorId !== userId || previous.tripId !== tripId || previous.companyId !== command.companyId || previous.action !== command.action || (command.productId && previous.productId !== command.productId)) throw new CaptureConflictError("La operación ya se usó para otra decisión");
      return previous;
    }
    const message = await tx.whatsAppBurstMessage.findUnique({ where: { id: messageId }, include: { burst: { include: { operations: { select: { arguments: true } } } }, commercialDecisions: true } });
    if (!message || message.burst.version !== 3 || membership.role === "TRAVELER" && message.burst.userId !== userId || !burstBelongsToTrip(message.burst.state, message.burst.operations, tripId, scoped) || membership.role === "ADMIN" && !burstHasExplicitCompany(message.burst.state, message.burst.operations, tripId, command.companyId) && !message.commercialDecisions.some((decision) => decision.tripId === tripId && decision.companyId === command.companyId)) throw new AuthorizationError("La evidencia no está disponible en este viaje");
    if (membership.role === "ADMIN" && (await tx.tripMember.findUnique({ where: { tripId_userId: { tripId, userId: message.burst.userId } }, select: { role: true } }))?.role !== "TRAVELER") throw new AuthorizationError("El viajero no pertenece a este viaje");
    const envelope = object(message.envelope);
    const type = String(envelope.type ?? "UNKNOWN");
    if (!isCommercialMessage(type, typeof envelope.text === "string" ? envelope.text : null, message.reading)) throw new ValidationError("Este mensaje pertenece al historial conversacional");
    const state = object(message.burst.state);
    const explicitCompany = [object(state.operationalContext), object(state.webReview), ...Object.values(object(state.loadContexts)).map(object)].map((item) => item.companyId).filter((id): id is string => typeof id === "string");
    if (explicitCompany.length && !explicitCompany.includes(command.companyId)) throw new AuthorizationError("La evidencia pertenece a otra empresa");
    const decisions = message.commercialDecisions;
    if (decisions.some((item) => item.tripId !== tripId || item.companyId !== command.companyId)) throw new AuthorizationError("La evidencia ya pertenece a otro viaje o empresa");
    if (decisions.some((item) => item.action === "DISCARD")) throw new CaptureConflictError("La evidencia ya fue descartada");
    if (command.action === "DISCARD" && decisions.length) throw new CaptureConflictError("La evidencia ya respalda un registro comercial");
    const sourceText = clean(envelope.text, 4000) ?? clean(object(message.reading).transcript, 4000) ?? clean(object(message.reading).ocr, 4000);
    const action = command.action;
    let captureId: string | null = null;
    let supplierId: string | null = null;
    let productId: string | null = null;
    let appliedFields: string[] = [];
    let reviewedValues: Record<string, unknown> = {};

    // A second tab repeating the same action must not apply the same fields twice.
    if (action === "LINK_SUPPLIER" && decisions.some((item) => item.action === action && (command.supplierId ? item.supplierId === command.supplierId : item.captureId === command.captureId))) return decisions.find((item) => item.action === action && (command.supplierId ? item.supplierId === command.supplierId : item.captureId === command.captureId))!;
    if (action === "LINK_PRODUCT" && decisions.some((item) => item.action === action && item.productId === command.productId)) return decisions.find((item) => item.action === action && item.productId === command.productId)!;
    if (action === "APPLY_PRODUCT" && decisions.some((item) => item.action === action && item.productId === command.productId && JSON.stringify(item.reviewedValues) === JSON.stringify(command.fields ?? {}))) return decisions.find((item) => item.action === action && item.productId === command.productId && JSON.stringify(item.reviewedValues) === JSON.stringify(command.fields ?? {}))!;

    if (action === "LINK_SUPPLIER" || action === "APPLY_PRODUCT" || action === "LINK_PRODUCT" || action === "CREATE_PRODUCT") {
      if (command.supplierId) {
        const supplier = await tx.supplier.findFirst({ where: { id: command.supplierId, tripId, companyId: command.companyId, deletedAt: null, capture: { deletedAt: null } }, select: { id: true, captureId: true } });
        if (!supplier) throw new AuthorizationError("Proveedor no disponible en esta empresa");
        supplierId = supplier.id; captureId = supplier.captureId;
      } else if (command.captureId) {
        const capture = await tx.supplierCapture.findFirst({ where: { id: command.captureId, tripId, companyId: command.companyId, deletedAt: null }, select: { id: true, supplier: { select: { id: true } } } });
        if (!capture) throw new AuthorizationError("Borrador no disponible en esta empresa");
        captureId = capture.id; supplierId = capture.supplier?.id ?? null;
      } else throw new ValidationError("Elegí un proveedor o borrador");
    }
    if (action === "CREATE_SUPPLIER") {
      const name = clean(command.name, 120);
      if (!name) throw new ValidationError("Escribí el nombre del proveedor");
      const city = clean(command.city, 120);
      const contact = clean(command.contact, 500);
      const normalized = normalizeTier1Data({ companyName: name, city, contact });
      const capture = await tx.supplierCapture.create({ data: {
        tripId, companyId: command.companyId, createdById: userId,
        sourceType: type === "AUDIO" ? "AUDIO_TRANSCRIPT" : type === "IMAGE" ? "IMAGE_BUSINESS_CARD" : "TEXT",
        sourceText, companyName: name, city, contact,
        missingFields: calculateMissingFields(normalized), reviewFields: [], acknowledgedUnknownFields: [],
        evidence: json([{ messageId, type, source: "WHATSAPP" }]),
      } });
      captureId = capture.id;
      const promotion = await reconcileSupplierConfirmation(tx, capture.id);
      supplierId = "id" in promotion && typeof promotion.id === "string" ? promotion.id : null;
      reviewedValues = { name, city, contact };
      appliedFields = ["companyName", ...(city ? ["city"] : []), ...(contact ? ["contact"] : [])];
    }
    if (action === "LINK_PRODUCT" || action === "APPLY_PRODUCT") {
      if (!command.productId) throw new ValidationError("Elegí un producto");
      const product = await tx.supplierProduct.findFirst({ where: { id: command.productId, captureId: captureId!, deletedAt: null, capture: { tripId, companyId: command.companyId, deletedAt: null } }, select: { id: true, updatedAt: true } });
      if (!product) throw new AuthorizationError("Producto no disponible en este proveedor");
      productId = product.id;
      if (action === "APPLY_PRODUCT") {
        if (!command.expectedVersion || command.expectedVersion !== product.updatedAt.toISOString()) throw new CaptureConflictError("El producto cambió. Recargá la evidencia antes de guardar");
        const patch = object(command.fields);
        if (!Object.keys(patch).some((key) => ["name", "category", "notes", "fob", "quotedPrice", "moq", "leadTime"].includes(key))) throw new ValidationError("Elegí al menos un dato para aplicar");
        const updated = await updateProduct(tx, { userId, tripId, companyId: command.companyId }, { captureId: captureId!, productId, expectedVersion: command.expectedVersion, patch: { ...patch, tripId } }, "web");
        appliedFields = Object.keys(patch).filter((key) => ["name", "category", "notes", "fob", "quotedPrice", "moq", "leadTime"].includes(key));
        reviewedValues = Object.fromEntries(appliedFields.map((key) => [key, patch[key]]));
        await tx.supplierProduct.update({ where: { id: updated.id }, data: { sourceEvidence: json([...(Array.isArray(updated.sourceEvidence) ? updated.sourceEvidence : []), { messageId, fields: appliedFields, decisionId: command.id }]) } });
      }
    }
    if (action === "CREATE_PRODUCT") {
      const fields: Record<string, unknown> = { ...object(command.fields), name: command.name };
      const parsed = parseProduct(fields);
      const created = await createProduct(tx, { userId, tripId, companyId: command.companyId }, { captureId: captureId!, supplierId, fields, trace: { sourceText, sourceEvidence: [{ messageId, fields: Object.keys(fields), decisionId: command.id }], reviewFields: [] } }, { access: "web", confirmation: "after-evidence" });
      productId = created.id;
      appliedFields = ["name", ...["category", "notes", "fob", "quotedPrice", "moq", "leadTime"].filter((key) => fields[key] !== undefined)];
      reviewedValues = { name: parsed.name, ...Object.fromEntries(appliedFields.filter((key) => key !== "name").map((key) => [key, fields[key]])) };
    }
    // Supplier association alone leaves product facts pending in the projection.
    return tx.whatsAppEvidenceDecision.create({ data: { id: command.id, messageId, tripId, companyId: command.companyId, actorId: userId, action, captureId, supplierId, productId, appliedFields: json(appliedFields), reviewedValues: json(reviewedValues) } });
  });
}
