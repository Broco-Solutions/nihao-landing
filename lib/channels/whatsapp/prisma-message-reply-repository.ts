import type { PrismaClient } from "../../../generated/prisma/client.ts";
import { normalizeWhatsAppPhone } from "../../bot/whatsapp-phone.ts";

type Reply = { kind: "captured" | "unlinked" | "ambiguous" | "failed"; text: string };
type Claim = { kind: "owned" } | { kind: "completed"; reply: Reply } | { kind: "processing" };

export class PrismaWhatsAppMessageReplyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async claim(instance: string, messageId: string, phone: string): Promise<Claim> {
    const normalizedPhone = normalizeWhatsAppPhone(phone);
    try {
      await this.prisma.whatsAppMessageReply.create({ data: { instance, messageId, phone: normalizedPhone, status: "PROCESSING" } });
      return { kind: "owned" };
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "P2002") throw error;
      const existing = await this.prisma.whatsAppMessageReply.findUnique({ where: { instance_messageId: { instance, messageId } } });
      if (existing?.phone !== normalizedPhone) return { kind: "processing" };
      if (existing?.status === "COMPLETED" && existing.kind && existing.text) return { kind: "completed", reply: { kind: existing.kind as Reply["kind"], text: existing.text } };
      const stale = new Date(Date.now() - 10 * 60_000);
      const reclaimed = await this.prisma.whatsAppMessageReply.updateMany({ where: { instance, messageId, status: "PROCESSING", updatedAt: { lt: stale } }, data: { updatedAt: new Date() } });
      return reclaimed.count ? { kind: "owned" } : { kind: "processing" };
    }
  }

  async complete(instance: string, messageId: string, reply: Reply): Promise<void> {
    await this.prisma.whatsAppMessageReply.update({ where: { instance_messageId: { instance, messageId } }, data: { status: "COMPLETED", kind: reply.kind, text: reply.text } });
  }
}
