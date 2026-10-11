import type { PrismaClient } from "../../../generated/prisma/client.ts";
import { AuthorizationError, requireTripMember } from "../../bot/authorization.ts";
import { ValidationError } from "../../bot/validation.ts";
import { PrismaTripAccessRepository } from "../../bot/persistence/prisma-trip-access-repository.ts";
import { accessibleCompanyIds } from "../../bot/persistence/company-access.ts";
import type { BurstReading, BurstState } from "./burst-types.ts";

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};

function burstScopes(state: JsonObject, operations: Array<{ arguments: unknown }>) {
  const agent = object(state.agent);
  const contexts: unknown[] = [state.operationalContext, state.webReview, ...Object.values(object(state.loadContexts)), ...(Array.isArray(agent.receipts) ? agent.receipts : [])];
  return contexts.concat(operations.map(({ arguments: args }) => args)).map(object);
}

export function burstHasExplicitAssignment(stateValue: unknown, operations: Array<{ arguments: unknown }>): boolean {
  const state = object(stateValue);
  if (typeof state.tripId === "string") return true;
  return burstScopes(state, operations).some((context) => typeof context.tripId === "string" || typeof context.companyId === "string");
}

export function canViewUnassignedEvidence(role: "ADMIN" | "TRAVELER", viewerUserId: string, ownerUserId: string): boolean {
  return role === "TRAVELER" && viewerUserId === ownerUserId;
}

export function burstBelongsToTrip(stateValue: unknown, operations: Array<{ arguments: unknown }>, tripId: string, allowedCompanyIds: string[] | null): boolean {
  const state = object(stateValue) as BurstState & JsonObject;
  const allowed = allowedCompanyIds === null ? null : new Set(allowedCompanyIds);
  const scopes = burstScopes(state, operations);
  const scoped = scopes.filter((context) => typeof context.tripId === "string");
  const companyScoped = scopes.filter((context) => typeof context.companyId === "string");
  // A burst can contain multiple explicit targets. Require every target to stay
  // inside the requested trip and the caller's company scope before exposing it.
  if (scoped.some((context) => context.tripId !== tripId)) return false;
  if (typeof state.tripId === "string" && state.tripId !== tripId) return false;
  if (companyScoped.some((context) => allowed !== null && !allowed.has(String(context.companyId)))) return false;
  // An authorized traveler can still review raw evidence before the agent has
  // resolved a trip or company. The Web associates it only after a human choice.
  return true;
}

function evidenceStatus(status: string, stateValue: unknown) {
  const state = object(stateValue);
  const agent = object(state.agent);
  const ingestion = object(state.ingestion);
  const summary = object(ingestion.summary);
  const termination = object(agent.termination);
  if (status === "FAILED") return { code: "error", label: "Error de procesamiento" };
  if (termination.reason === "tool_error") return { code: "error", label: "Error de herramienta; evidencia conservada" };
  if (state.question || agent.pending) return { code: "human", label: "Espera tu confirmación" };
  if (Number(summary.pending ?? 0) > 0 || status === "OPEN" || status === "PROCESSING" || status === "COMMITTING") return { code: "processing", label: "Pendiente de interpretación" };
  if (Number(summary.failed ?? 0) > 0) return { code: "error", label: "Pendiente por un error" };
  if (Number(summary.needsReview ?? 0) > 0) return { code: "human", label: "Pendiente de revisión" };
  return { code: "complete", label: "Procesada" };
}

function commercialFacts(reading: JsonObject, ingestion: JsonObject) {
  const caption = object(ingestion.caption);
  const products = Array.isArray(caption.products) ? caption.products.map((item) => {
    const product = object(item);
    return { name: product.name ?? null, fob: product.fob ?? null, moq: product.moq ?? null, leadTime: product.leadTime ?? null, notes: product.notes ?? null };
  }) : [];
  const segments = Array.isArray(reading.segments) ? reading.segments : [];
  const candidates = segments.flatMap((segment) => {
    const fields = object(object(object(segment).candidate).extractedFields);
    const picked = Object.fromEntries(["companyName", "category", "fob", "moq", "leadTime", "interestScore"].filter((key) => fields[key] !== undefined && fields[key] !== null).map((key) => [key, fields[key]]));
    return Object.keys(picked).length ? [picked] : [];
  });
  return { supplierNotes: caption.supplierNotes ?? null, products, pendingFacts: caption.pendingFacts ?? null, candidates };
}

export async function listTripWhatsAppEvidence(prisma: PrismaClient, userId: string, tripId: string) {
  const membership = await requireTripMember(new PrismaTripAccessRepository(prisma), { userId, tripId });
  const allowedCompanyIds = await accessibleCompanyIds(prisma, userId, tripId);
  const travelerIds = membership.role === "ADMIN"
    ? (await prisma.tripMember.findMany({ where: { tripId, role: "TRAVELER" }, select: { userId: true } })).map((item) => item.userId)
    : [userId];
  const rows = await prisma.whatsAppBurst.findMany({
    where: { version: 3, userId: { in: travelerIds } },
    select: {
      id: true, userId: true, status: true, revision: true, attempts: true, createdAt: true, lastErrorCode: true, state: true,
      operations: { select: { arguments: true } },
      messages: { orderBy: { sequence: "asc" }, select: { id: true, sequence: true, sentAt: true, receivedAt: true, envelope: true, reading: true, storageStatus: true, storageLastErrorCode: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.filter((row) => (membership.role === "ADMIN" || row.userId === userId)
    && (burstHasExplicitAssignment(row.state, row.operations) || canViewUnassignedEvidence(membership.role, userId, row.userId))
    && burstBelongsToTrip(row.state, row.operations, tripId, allowedCompanyIds)).map((row) => {
    const state = object(row.state);
    const agent = object(state.agent);
    const receipts = Array.isArray(agent.receipts) ? agent.receipts.map(object) : [];
    const targets = receipts.flatMap((receipt) => typeof receipt.id === "string" ? [{ id: receipt.id, kind: receipt.tool === "create_product_draft" || receipt.tool === "update_product" ? "PRODUCT" : "SUPPLIER" as const, name: typeof receipt.name === "string" ? receipt.name : null, supplierId: typeof receipt.supplierId === "string" ? receipt.supplierId : null }] : []);
    const association = object(state.webReview);
    const status = evidenceStatus(row.status, row.state);
    return {
      id: row.id, createdAt: row.createdAt.toISOString(), revision: row.revision, attempts: row.attempts, status,
      unassigned: !burstHasExplicitAssignment(row.state, row.operations),
      failureCode: status.code === "error" ? row.lastErrorCode ?? (typeof object(agent.termination).errorCode === "string" ? String(object(agent.termination).errorCode) : null) : null,
      targets,
      association: typeof association.companyId === "string" ? { companyId: association.companyId, supplierId: typeof association.supplierId === "string" ? association.supplierId : null } : null,
      messages: row.messages.map((message) => {
        const envelope = object(message.envelope);
        const reading = object(message.reading) as BurstReading & JsonObject;
        const ingestion = object(reading.ingestion);
        const assetStatus = typeof ingestion.status === "string" ? ingestion.status : message.storageStatus;
        return {
          id: message.id, sequence: message.sequence, sentAt: message.sentAt?.toISOString() ?? message.receivedAt.toISOString(),
          type: typeof envelope.type === "string" ? envelope.type : "UNKNOWN",
          text: typeof envelope.text === "string" ? envelope.text : null,
          transcript: typeof reading.transcript === "string" ? reading.transcript : null,
          ocr: typeof reading.ocr === "string" ? reading.ocr : null,
          visual: typeof reading.visual === "string" ? reading.visual : null,
          extractedCommercial: commercialFacts(reading, ingestion),
          status: typeof assetStatus === "string" ? assetStatus : "RECIBIDA",
          mediaAvailable: Boolean(reading.storageKey && message.storageStatus === "STORED"),
          storagePending: message.storageStatus === "PENDING_STORAGE",
        };
      }),
    };
  });
}

export async function associateTripWhatsAppEvidence(prisma: PrismaClient, userId: string, tripId: string, burstId: string, input: { companyId: string; supplierId?: string | null }) {
  const membership = await requireTripMember(new PrismaTripAccessRepository(prisma), { userId, tripId });
  const allowedCompanyIds = await accessibleCompanyIds(prisma, userId, tripId);
  const companyId = input.companyId;
  if (!companyId || (allowedCompanyIds && !allowedCompanyIds.includes(companyId))) throw new AuthorizationError("No tenés acceso a esta empresa");
  const company = await prisma.tripCompany.findFirst({ where: { id: companyId, tripId, active: true }, select: { id: true } });
  if (!company) throw new ValidationError("La empresa no pertenece a este viaje");
  let supplierId: string | null = null;
  if (input.supplierId) {
    const supplier = await prisma.supplier.findFirst({ where: { id: input.supplierId, tripId, companyId }, select: { id: true } });
    if (!supplier) throw new ValidationError("El proveedor no pertenece a la empresa elegida");
    supplierId = supplier.id;
  }
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "WhatsAppBurst" WHERE id = ${burstId} FOR UPDATE`;
    const burst = await tx.whatsAppBurst.findUnique({ where: { id: burstId }, select: { id: true, userId: true, state: true, operations: { select: { arguments: true } } } });
    if (!burst || (membership.role !== "ADMIN" && burst.userId !== userId) || !burstBelongsToTrip(burst.state, burst.operations, tripId, allowedCompanyIds)) throw new AuthorizationError("La evidencia no está disponible para este viaje");
    const state = object(burst.state);
    const webReview = { tripId, companyId, supplierId, associatedBy: userId, associatedAt: new Date().toISOString() };
    await tx.whatsAppBurst.update({ where: { id: burst.id }, data: { state: JSON.parse(JSON.stringify({ ...state, webReview })) } });
    return { companyId, supplierId };
  });
}

export async function getTripWhatsAppEvidenceMedia(prisma: PrismaClient, userId: string, tripId: string, messageId: string) {
  const membership = await requireTripMember(new PrismaTripAccessRepository(prisma), { userId, tripId });
  const allowedCompanyIds = await accessibleCompanyIds(prisma, userId, tripId);
  const message = await prisma.whatsAppBurstMessage.findUnique({
    where: { id: messageId },
    select: { reading: true, storageStatus: true, burst: { select: { userId: true, state: true, operations: { select: { arguments: true } } } } },
  });
  if (!message || (membership.role !== "ADMIN" && message.burst.userId !== userId) || !burstBelongsToTrip(message.burst.state, message.burst.operations, tripId, allowedCompanyIds)) return null;
  const key = object(message.reading).storageKey;
  if (message.storageStatus !== "STORED" || typeof key !== "string") return null;
  return { key, mimeType: typeof object(message.reading).mimeType === "string" ? String(object(message.reading).mimeType) : "application/octet-stream" };
}
