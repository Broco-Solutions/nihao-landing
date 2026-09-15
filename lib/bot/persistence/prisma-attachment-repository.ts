import type { PrismaClient, SupplierAttachment } from "../../../generated/prisma/client.ts";
import type { AttachmentRepository, CaptureAttachmentOwner } from "../attachments.ts";
import type { AttachmentType, SupplierAttachmentRecord } from "../types.ts";
import { PrismaTripAccessRepository } from "./prisma-trip-access-repository.ts";

type AttachmentWithCapture = SupplierAttachment & {
  supplierCapture: { tripId: string; createdById: string };
};

function toRecord(attachment: AttachmentWithCapture): SupplierAttachmentRecord {
  return {
    id: attachment.id,
    userId: attachment.supplierCapture.createdById,
    tripId: attachment.supplierCapture.tripId,
    captureId: attachment.supplierCaptureId,
    type: attachment.type as AttachmentType,
    storageKey: attachment.storageKey,
    mimeType: attachment.mimeType,
    size: attachment.size,
    createdAt: attachment.createdAt.toISOString(),
  };
}

export class PrismaAttachmentRepository implements AttachmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async hasTripAccess(context: { userId: string; tripId: string }): Promise<boolean> {
    return new PrismaTripAccessRepository(this.prisma).hasTripAccess(context);
  }

  async getCapture(captureId: string): Promise<CaptureAttachmentOwner | null> {
    return this.prisma.supplierCapture.findUnique({
      where: { id: captureId },
      select: { id: true, tripId: true, createdById: true },
    });
  }

  async create(input: { supplierCaptureId: string; type: AttachmentType; storageKey: string; mimeType: string; size: number }) {
    return toRecord(await this.prisma.supplierAttachment.create({
      data: input,
      include: { supplierCapture: { select: { tripId: true, createdById: true } } },
    }));
  }

  async list(captureId: string) {
    return (await this.prisma.supplierAttachment.findMany({
      where: { supplierCaptureId: captureId },
      include: { supplierCapture: { select: { tripId: true, createdById: true } } },
      orderBy: { createdAt: "desc" },
    })).map(toRecord);
  }

  async get(attachmentId: string) {
    const attachment = await this.prisma.supplierAttachment.findUnique({
      where: { id: attachmentId },
      include: { supplierCapture: { select: { tripId: true, createdById: true } } },
    });
    return attachment ? toRecord(attachment) : null;
  }

  async deleteMetadata(attachmentId: string) {
    await this.prisma.supplierAttachment.delete({ where: { id: attachmentId } });
  }
}
