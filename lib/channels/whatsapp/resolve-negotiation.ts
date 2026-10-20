import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "../../../generated/prisma/client.ts";
import { AuthorizationError, requireTripMember } from "../../bot/authorization.ts";
import { PrismaTripAccessRepository } from "../../bot/persistence/prisma-trip-access-repository.ts";
import { accessibleCompanyIds } from "../../bot/persistence/company-access.ts";
import { CaptureConflictError } from "../../bot/persistence/repository.ts";
import { ValidationError } from "../../bot/validation.ts";
import { calculateMissingFields, normalizeTier1Data } from "../../bot/tier1.ts";
import { parseProduct } from "../../bot/supplier-edit.ts";
import { createProduct } from "../../nihao/operations/create-product.ts";
import { updateProduct } from "../../nihao/operations/update-product.ts";
import { automatedEvidenceLinks, burstBelongsToTrip, burstHasExplicitCompany } from "./web-evidence.ts";
import { commercialFactsFromMessage, decisionStatus, hasProductFacts, isCommercialMessage } from "./commercial-review.ts";

type Mode = "SUPPLIER" | "PRODUCT" | "DISCARD" | "RECOVER";
type Command = { id: string; burstId: string; messageIds: string[]; companyId: string; mode: Mode; captureId?: string; newSupplier?: { name: string; city?: string; contact?: string }; productId?: string; expectedProductVersion?: string; createProduct?: boolean; fields: Record<string, unknown> };
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const string = (value: unknown, max = 120) => typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : null;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const decisionId = (batchId: string, messageId: string) => createHash("sha256").update(`${batchId}:${messageId}`).digest("hex").slice(0, 32);

export function parseNegotiationCommand(value: unknown): Command {
  const body = object(value);
  if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/iu.test(body.id)) throw new ValidationError("Operación inválida");
  if (typeof body.burstId !== "string" || !body.burstId || typeof body.companyId !== "string" || !body.companyId) throw new ValidationError("Elegí el contexto comercial");
  if (!Array.isArray(body.messageIds) || !body.messageIds.length || body.messageIds.length > 30 || body.messageIds.some((id) => typeof id !== "string") || new Set(body.messageIds).size !== body.messageIds.length) throw new ValidationError("Elegí los mensajes de esta negociación");
  const mode = body.mode === undefined ? "PRODUCT" : String(body.mode);
  if (!["SUPPLIER", "PRODUCT", "DISCARD", "RECOVER"].includes(mode)) throw new ValidationError("Elegí una acción válida");
  if (body.fields !== undefined && (typeof body.fields !== "object" || body.fields === null || Array.isArray(body.fields))) throw new ValidationError("Revisá los datos comerciales");
  if ((mode === "SUPPLIER" || mode === "PRODUCT") && Boolean(body.captureId) === Boolean(body.newSupplier)) throw new ValidationError("Elegí un proveedor existente o creá uno nuevo");
  if (mode === "PRODUCT" && Boolean(body.productId) === Boolean(body.createProduct)) throw new ValidationError("Elegí un producto existente o creá uno nuevo");
  const fields = object(body.fields);
  if (Object.keys(fields).some((key) => !["name", "category", "notes", "fob", "quotedPrice", "moq", "leadTime"].includes(key))) throw new ValidationError("Campo comercial inválido");
  if (mode === "PRODUCT" && body.createProduct) parseProduct(fields);
  return { ...body, mode, fields } as Command;
}

/** One browser save applies a whole negotiation atomically while retaining per-message provenance. */
export async function resolveTripNegotiation(prisma: PrismaClient, userId: string, tripId: string, command: Command) {
  const operationHash = createHash("sha256").update(JSON.stringify(command)).digest("hex");
  const membership = await requireTripMember(new PrismaTripAccessRepository(prisma), { userId, tripId });
  const allowed = await accessibleCompanyIds(prisma, userId, tripId);
  const scoped = allowed ?? (await prisma.tripCompany.findMany({ where: { tripId }, select: { id: true } })).map((company) => company.id);
  if (allowed && !allowed.includes(command.companyId)) throw new AuthorizationError("No tenés acceso a esta empresa");
  const company = await prisma.tripCompany.findFirst({ where: { id: command.companyId, tripId, active: true }, select: { id: true } });
  if (!company) throw new AuthorizationError("La empresa no está disponible en el viaje");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "WhatsAppBurst" WHERE id = ${command.burstId} FOR UPDATE`;
    const previous = await tx.whatsAppEvidenceDecision.findMany({ where: { batchId: command.id } });
    if (previous.length) {
      if (previous.length !== command.messageIds.length || previous.some((item) => item.actorId !== userId || item.tripId !== tripId || item.companyId !== command.companyId || !command.messageIds.includes(item.messageId) || object(item.reviewedValues)._operationHash !== operationHash)) throw new CaptureConflictError("La operación ya se usó para otra negociación");
      return { mode: command.mode, captureId: previous[0].captureId, productId: previous[0].productId, decisions: previous };
    }
    const burst = await tx.whatsAppBurst.findUnique({ where: { id: command.burstId }, include: { operations: { select: { id: true, arguments: true, result: true, status: true, tool: true, createdAt: true } }, messages: { where: { id: { in: command.messageIds } }, include: { commercialDecisions: true } } } });
    if (!burst || burst.version !== 3 || burst.messages.length !== command.messageIds.length || membership.role === "TRAVELER" && burst.userId !== userId || !burstBelongsToTrip(burst.state, burst.operations, tripId, scoped) || membership.role === "ADMIN" && !burstHasExplicitCompany(burst.state, burst.operations, tripId, command.companyId) && !burst.messages.every((message) => message.commercialDecisions.some((decision) => decision.tripId === tripId && decision.companyId === command.companyId))) throw new AuthorizationError("La negociación no está disponible en este viaje y empresa");
    if (membership.role === "ADMIN" && (await tx.tripMember.findUnique({ where: { tripId_userId: { tripId, userId: burst.userId } }, select: { role: true } }))?.role !== "TRAVELER") throw new AuthorizationError("El viajero no pertenece a este viaje");
    const state = object(burst.state);
    const explicitCompany = [object(state.operationalContext), object(state.webReview), ...Object.values(object(state.loadContexts)).map(object)].map((item) => item.companyId).filter((id): id is string => typeof id === "string");
    if (explicitCompany.length && !explicitCompany.includes(command.companyId)) throw new AuthorizationError("La evidencia pertenece a otra empresa");
    if (command.mode === "DISCARD" && !burstHasExplicitCompany(burst.state, burst.operations, tripId, command.companyId) && !burst.messages.every((message) => message.commercialDecisions.some((decision) => decision.tripId === tripId && decision.companyId === command.companyId))) throw new AuthorizationError("La negociación todavía no tiene una empresa verificada para el descarte");
    for (const message of burst.messages) {
      const envelope = object(message.envelope);
      const type = String(envelope.type ?? "UNKNOWN");
      const text = typeof envelope.text === "string" ? envelope.text : null;
      const automaticLinks = automatedEvidenceLinks(burst.operations, message.id);
      if (!message.commercialDecisions.length && !automaticLinks.length && !isCommercialMessage(type, text, message.reading)) throw new ValidationError("Un mensaje pertenece al historial conversacional");
      if (message.commercialDecisions.some((decision) => decision.tripId !== tripId || decision.companyId !== command.companyId)) throw new AuthorizationError("La evidencia ya pertenece a otra empresa o viaje");
      const resolution = decisionStatus(commercialFactsFromMessage(type, text, message.reading), message.commercialDecisions);
      const commercialDecisions = message.commercialDecisions.filter((decision) => !["DISCARD", "RECOVER", "FINISH_REVIEW", "REOPEN_REVIEW"].includes(decision.action));
      if (!["DISCARD", "RECOVER"].includes(command.mode) && automaticLinks.length) throw new CaptureConflictError("Esta evidencia ya tiene un registro; revisala individualmente");
      if (command.mode === "RECOVER" && resolution !== "discarded") throw new CaptureConflictError("Una evidencia ya no está descartada. Actualizá la vista");
      if (command.mode === "DISCARD" && (resolution === "discarded" || commercialDecisions.length || automaticLinks.length)) throw new CaptureConflictError(resolution === "discarded" ? "La evidencia ya fue descartada" : "La evidencia ya respalda un registro comercial");
      if (command.mode !== "DISCARD" && command.mode !== "RECOVER" && resolution !== "pending") throw new CaptureConflictError("Una evidencia ya fue gestionada. Actualizá la vista antes de guardar");
    }

    if (command.mode === "DISCARD" || command.mode === "RECOVER") {
      const decisions = [];
      for (const message of burst.messages) {
        decisions.push(await tx.whatsAppEvidenceDecision.create({ data: {
          id: decisionId(command.id, message.id), batchId: command.id, messageId: message.id, tripId, companyId: command.companyId,
          actorId: userId, action: command.mode, appliedFields: json([]), reviewedValues: json({ _operationHash: operationHash }),
        } }));
      }
      return { mode: command.mode, captureId: null, productId: null, decisions };
    }
    let captureId = command.captureId ?? "";
    let supplierId: string | null = null;
    if (command.newSupplier) {
      const name = string(command.newSupplier.name);
      if (!name) throw new ValidationError("Escribí el nombre del proveedor");
      const city = string(command.newSupplier.city);
      const contact = string(command.newSupplier.contact, 500);
      const normalized = normalizeTier1Data({ companyName: name, city, contact });
      const capture = await tx.supplierCapture.create({ data: { tripId, companyId: command.companyId, createdById: userId, sourceType: "TEXT", companyName: name, city, contact, missingFields: calculateMissingFields(normalized), reviewFields: [], acknowledgedUnknownFields: [], evidence: json(command.messageIds.map((messageId) => ({ source: "WHATSAPP", messageId }))) } });
      captureId = capture.id;
    } else {
      const capture = await tx.supplierCapture.findFirst({ where: { id: captureId, tripId, companyId: command.companyId, deletedAt: null }, select: { id: true, supplier: { select: { id: true } } } });
      if (!capture) throw new AuthorizationError("El proveedor no está disponible en esta empresa");
      supplierId = capture.supplier?.id ?? null;
    }
    let productId: string | null = command.productId ?? null;
    if (command.mode === "PRODUCT" && command.createProduct) {
      const product = await createProduct(tx, { userId, tripId, companyId: command.companyId }, { captureId, supplierId, fields: command.fields, trace: { sourceEvidence: [], reviewFields: [] } }, { access: "web", confirmation: "after-evidence" });
      productId = product.id;
    } else if (command.mode === "PRODUCT") {
      if (!command.expectedProductVersion) throw new CaptureConflictError("Actualizá el producto antes de aplicar los datos");
      const product = await tx.supplierProduct.findFirst({ where: { id: productId!, captureId, deletedAt: null }, select: { updatedAt: true } });
      if (!product || product.updatedAt.toISOString() !== command.expectedProductVersion) throw new CaptureConflictError("El producto cambió. Actualizá la vista antes de guardar");
      if (Object.keys(command.fields).length) await updateProduct(tx, { userId, tripId, companyId: command.companyId }, { captureId, productId: productId!, expectedVersion: command.expectedProductVersion, patch: { ...command.fields, tripId } }, "web");
    }
    const traces: Array<{ messageId: string; fields: string[]; decisionId: string }> = [];
    const decisions = [];
    for (const message of burst.messages) {
      const envelope = object(message.envelope);
      const type = String(envelope.type ?? "UNKNOWN");
      const facts = commercialFactsFromMessage(type, typeof envelope.text === "string" ? envelope.text : null, message.reading);
      const appliedFields = ["companyName", "city", "contact", "category", "fob", "quotedPrice", "moq", "leadTime", "notes", "productName"].filter((field) => {
        if (field === "companyName") return Boolean(facts.companyName && (command.newSupplier?.name ?? "").toLowerCase() === facts.companyName.toLowerCase() || facts.companyName && !command.newSupplier);
        if (["city", "contact"].includes(field)) return Boolean(facts[field as "city" | "contact"] && command.newSupplier);
        if (command.mode === "SUPPLIER") return false;
        if (field === "productName") return Boolean(facts.productName && command.fields.name);
        return Boolean(facts[field as "category" | "fob" | "quotedPrice" | "moq" | "leadTime" | "notes"] && command.fields[field] !== undefined && command.fields[field] !== null);
      });
      const action = command.mode === "SUPPLIER" ? command.newSupplier ? "CREATE_SUPPLIER" : "LINK_SUPPLIER" : hasProductFacts(facts) ? "APPLY_NEGOTIATION" : "LINK_PRODUCT";
      const id = decisionId(command.id, message.id);
      const decision = await tx.whatsAppEvidenceDecision.create({ data: { id, batchId: command.id, messageId: message.id, tripId, companyId: command.companyId, actorId: userId, action, captureId, supplierId, productId, appliedFields: json(appliedFields), reviewedValues: json({ _operationHash: operationHash, ...Object.fromEntries(appliedFields.map((field) => [field, field === "companyName" ? command.newSupplier?.name ?? facts.companyName : command.fields[field]])) }) } });
      if (command.mode === "PRODUCT") traces.push({ messageId: message.id, fields: appliedFields, decisionId: id });
      decisions.push(decision);
    }
    if (command.mode === "PRODUCT") {
      const product = await tx.supplierProduct.findUniqueOrThrow({ where: { id: productId! }, select: { sourceEvidence: true } });
      await tx.supplierProduct.update({ where: { id: productId! }, data: { sourceEvidence: json([...(Array.isArray(product.sourceEvidence) ? product.sourceEvidence : []), ...traces]) } });
    }
    return { mode: command.mode, captureId, productId, decisions };
  });
}
