import type { PrismaClient } from "../../../generated/prisma/client.ts";
import { createEmptyEvidenceCapture, deleteEmptySupplierCapture } from "../../nihao/operations/capture-lifecycle.ts";

export type CardContext = { userId: string; tripId: string; companyId?: string };
export type WhatsAppCard = {
  id: string;
  state: "PENDING" | "ANALYZING" | "ANALYZED";
  analyzedAttachmentIds: string[];
  updatedAt: Date;
};
export type CommandReceipt = {
  status: "PROCESSING" | "COMPLETED" | "FAILED" | "IGNORED";
  supplierCaptureId: string | null;
};
export type BeginCommandResult = { kind: "owned" | "existing" | "ignored"; receipt: CommandReceipt };

export interface WhatsAppCardRepository {
  withUserLock<T>(context: CardContext, work: () => Promise<T>): Promise<T>;
  findActive(context: CardContext): Promise<WhatsAppCard | null>;
  get(context: CardContext, captureId: string): Promise<WhatsAppCard | null>;
  createPending(context: CardContext, captureId: string, evidenceId: string): Promise<{ card: WhatsAppCard; created: boolean }>;
  beginAnalyzeCommand(context: CardContext, instance: string, messageId: string, staleBefore: Date): Promise<BeginCommandResult>;
  settleAnalyzeCommand(context: CardContext, instance: string, messageId: string, captureId: string, status: "COMPLETED" | "FAILED" | "IGNORED"): Promise<boolean>;
  deleteIfEmpty(context: CardContext, captureId: string): Promise<boolean>;
}

const select = { id: true, whatsappCardState: true, analyzedAttachmentIds: true, updatedAt: true } as const;
function toCard(row: { id: string; whatsappCardState: string | null; analyzedAttachmentIds: unknown; updatedAt: Date } | null): WhatsAppCard | null {
  if (!row || !row.whatsappCardState) return null;
  return {
    id: row.id,
    state: row.whatsappCardState as WhatsAppCard["state"],
    analyzedAttachmentIds: Array.isArray(row.analyzedAttachmentIds) ? row.analyzedAttachmentIds.filter((id): id is string => typeof id === "string") : [],
    updatedAt: row.updatedAt,
  };
}

export class PrismaWhatsAppCardRepository implements WhatsAppCardRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async withUserLock<T>(context: CardContext, work: () => Promise<T>): Promise<T> {
    // The transaction owns only the advisory lock. AttachmentService uses its own
    // connection so it can see a newly committed capture and retain R2 cleanup.
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tripId}:${context.companyId ?? ""}:${context.userId}`}, 0))::text`;
      return work();
    }, { maxWait: 10_000, timeout: 120_000 });
  }

  async findActive(context: CardContext): Promise<WhatsAppCard | null> {
    return toCard(await this.prisma.supplierCapture.findFirst({
      where: { tripId: context.tripId, ...(context.companyId ? { companyId: context.companyId } : {}), createdById: context.userId, whatsappCardState: { in: ["PENDING", "ANALYZING"] } },
      select,
    }));
  }

  async get(context: CardContext, captureId: string): Promise<WhatsAppCard | null> {
    return toCard(await this.prisma.supplierCapture.findFirst({
      where: { id: captureId, tripId: context.tripId, ...(context.companyId ? { companyId: context.companyId } : {}), createdById: context.userId }, select,
    }));
  }

  async createPending(context: CardContext, captureId: string, evidenceId: string): Promise<{ card: WhatsAppCard; created: boolean }> {
    const companyId = context.companyId;
    if (!companyId) throw new Error("No hay empresa para esta tarjeta");
    try {
      const row = await this.prisma.$transaction(async tx => {
        const capture = await createEmptyEvidenceCapture(tx, context, { captureId, evidenceId });
        return tx.supplierCapture.update({ where: { id: capture.id }, data: { whatsappCardState: "PENDING" }, select });
      });
      return { card: toCard(row)!, created: true };
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "P2002") throw error;
      const card = await this.findActive(context);
      if (!card) throw error;
      return { card, created: false };
    }
  }

  async beginAnalyzeCommand(context: CardContext, instance: string, messageId: string, staleBefore: Date): Promise<BeginCommandResult> {
    const key = { instance_messageId: { instance, messageId } };
    const existing = await this.prisma.whatsAppCommandReceipt.findUnique({ where: key });
    if (existing) return { kind: "existing", receipt: existing };
    try {
      return await this.prisma.$transaction(async (tx): Promise<BeginCommandResult> => {
        // The unique receipt consumes this event before looking at the current card.
        await tx.whatsAppCommandReceipt.create({ data: {
          instance, messageId, command: "ANALYZE_CARD", status: "IGNORED",
          tripId: context.tripId, createdById: context.userId,
        } });
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tripId}:${context.companyId ?? ""}:${context.userId}`}, 0))::text`;
        const active = await tx.supplierCapture.findFirst({ where: {
          tripId: context.tripId, ...(context.companyId ? { companyId: context.companyId } : {}), createdById: context.userId, status: "DRAFT",
          whatsappCardState: { in: ["PENDING", "ANALYZING"] },
        }, select: { id: true, whatsappCardState: true, updatedAt: true } });
        if (!active) return { kind: "ignored", receipt: { status: "IGNORED", supplierCaptureId: null } };
        if (active.whatsappCardState === "ANALYZING" && active.updatedAt <= staleBefore) {
          // Ten-minute crash recovery: the abandoned event remains consumed forever.
          await tx.whatsAppCommandReceipt.updateMany({ where: {
            supplierCaptureId: active.id, status: "PROCESSING",
          }, data: { status: "FAILED" } });
          await tx.supplierCapture.updateMany({ where: {
            id: active.id, whatsappCardState: "ANALYZING", updatedAt: { lte: staleBefore },
          }, data: { whatsappCardState: "PENDING" } });
        }
        const claim = await tx.supplierCapture.updateMany({ where: {
          id: active.id, tripId: context.tripId, createdById: context.userId,
          status: "DRAFT", whatsappCardState: "PENDING",
        }, data: { whatsappCardState: "ANALYZING" } });
        const status = claim.count === 1 ? "PROCESSING" : "IGNORED";
        await tx.whatsAppCommandReceipt.update({ where: key, data: { status, supplierCaptureId: active.id } });
        return { kind: claim.count === 1 ? "owned" : "ignored", receipt: { status, supplierCaptureId: active.id } };
      }, { maxWait: 10_000, timeout: 10_000 });
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "P2002") throw error;
      const receipt = await this.prisma.whatsAppCommandReceipt.findUnique({ where: key });
      if (!receipt) throw error;
      return { kind: "existing", receipt };
    }
  }

  async settleAnalyzeCommand(context: CardContext, instance: string, messageId: string, captureId: string, status: "COMPLETED" | "FAILED" | "IGNORED"): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const receipt = await tx.whatsAppCommandReceipt.updateMany({ where: {
        instance, messageId, tripId: context.tripId, createdById: context.userId,
        supplierCaptureId: captureId, status: "PROCESSING",
      }, data: { status } });
      if (receipt.count !== 1) return false;
      const card = await tx.supplierCapture.updateMany({ where: {
        id: captureId, tripId: context.tripId, createdById: context.userId, status: "DRAFT",
        whatsappCardState: "ANALYZING",
      }, data: { whatsappCardState: status === "COMPLETED" ? "ANALYZED" : "PENDING" } });
      if (card.count !== 1) throw new Error("No se pudo completar la transición de la tarjeta");
      return true;
    });
  }

  async deleteIfEmpty(context: CardContext, captureId: string): Promise<boolean> {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "SupplierCapture" WHERE id = ${captureId} FOR UPDATE`;
      const card = await tx.supplierCapture.findFirst({ where: { id: captureId, tripId: context.tripId, createdById: context.userId, whatsappCardState: "PENDING" } });
      if (!card) return false;
      return deleteEmptySupplierCapture(tx, context, captureId);
    });
  }
}
