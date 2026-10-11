import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "../../../generated/prisma/client.ts";
import type { StorageProvider } from "../../bot/storage/provider.ts";
import type { EvolutionClient } from "../evolution/client.ts";
import type { IncomingWhatsAppMessage } from "../evolution/webhook.ts";
import type { WhatsAppDeliveryStatus } from "../evolution/webhook.ts";
import { EvolutionRequestError } from "../evolution/client.ts";
import { parseEvolutionWebhook } from "../evolution/webhook.ts";
import { originalBytes } from "./operational-runtime.ts";
import { whatsappUatAllowedPhones } from "./uat-access.ts";
import { PUBLIC_WELCOME_COOLDOWN_MS, whatsappPublicWelcomeEnabled } from "./public-welcome.ts";

export type DirectReplyReason = "GREETING" | "UNLINKED_ALLOWED" | "PUBLIC_WELCOME";

type QuarantineRow = {
  id: string;
  storageKey: string | null;
  originalSha256: string | null;
};

export type QuarantineReceipt = {
  instance: string;
  message: IncomingWhatsAppMessage;
  payload: unknown;
};

export type QuarantineRepository = {
  receive(input: QuarantineReceipt, requiresOriginal: boolean): Promise<QuarantineRow>;
  preserved(id: string, original?: { storageKey: string; mimeType: string; sha256: string; size: number }): Promise<void>;
  failed(id: string, reason: string): Promise<void>;
};

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export class PrismaWhatsAppQuarantineRepository implements QuarantineRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async receive(input: QuarantineReceipt, requiresOriginal: boolean) {
    return this.prisma.whatsAppQuarantinedMessage.upsert({
      where: { instance_messageId: { instance: input.instance, messageId: input.message.id } },
      create: {
        instance: input.instance,
        messageId: input.message.id,
        phone: input.message.phone,
        type: input.message.type,
        sentAt: input.message.sentAt ? new Date(input.message.sentAt) : null,
        payload: json(input.payload),
        status: requiresOriginal ? "RECEIVED" : "PRESERVED",
      },
      update: {},
      select: { id: true, storageKey: true, originalSha256: true },
    });
  }

  async preserved(id: string, original?: { storageKey: string; mimeType: string; sha256: string; size: number }) {
    await this.prisma.whatsAppQuarantinedMessage.update({ where: { id }, data: {
      status: "PRESERVED",
      lastError: null,
      ...(original ? { storageKey: original.storageKey, mimeType: original.mimeType, originalSha256: original.sha256, originalSize: original.size } : {}),
    } });
  }

  async failed(id: string, reason: string) {
    await this.prisma.whatsAppQuarantinedMessage.update({ where: { id }, data: { status: "RECEIVED", lastError: reason } });
  }

  async enqueueReply(id: string, text: string, reason: Exclude<DirectReplyReason, "PUBLIC_WELCOME">) {
    await this.prisma.whatsAppQuarantinedMessage.updateMany({
      where: { id, replyText: null },
      data: { reason, replyText: text, replyStatus: "PENDING" },
    });
  }

  async enqueuePublicWelcome(id: string, input: { instance: string; phone: string; text: string; now?: Date }) {
    const now = input.now ?? new Date();
    const cutoff = new Date(now.getTime() - PUBLIC_WELCOME_COOLDOWN_MS);
    return this.prisma.$transaction(async (tx) => {
      const lockKey = `nihao-public-welcome:${input.instance}:${input.phone}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
      const recent = await tx.whatsAppQuarantinedMessage.findFirst({
        where: {
          instance: input.instance,
          phone: input.phone,
          reason: "PUBLIC_WELCOME",
          replyText: { not: null },
          OR: [
            { receivedAt: { gt: cutoff } },
            { replyStatus: { in: ["PENDING", "SENDING", "DELIVERY_UNKNOWN"] } },
          ],
        },
        select: { id: true },
      });
      if (recent) return false;
      const queued = await tx.whatsAppQuarantinedMessage.updateMany({
        where: { id, replyText: null },
        data: { reason: "PUBLIC_WELCOME", replyText: input.text, replyStatus: "PENDING" },
      });
      return queued.count === 1;
    });
  }

  async flushReplies(send: (phone: string, text: string, onMessageId: (id: string) => void, reason: DirectReplyReason) => Promise<void>) {
    const now = new Date();
    const allowedPhones = whatsappUatAllowedPhones();
    const publicWelcomeEnabled = whatsappPublicWelcomeEnabled();
    await this.prisma.whatsAppQuarantinedMessage.updateMany({ where: { replyStatus: "SENDING", replyLeaseUntil: { lt: now } }, data: { replyStatus: "DELIVERY_UNKNOWN", replyLeaseUntil: null, replyLastErrorAt: now, replyLastErrorCode: "SEND_LEASE_EXPIRED" } });
    const rows = await this.prisma.whatsAppQuarantinedMessage.findMany({
      where: {
        ...(allowedPhones
          ? publicWelcomeEnabled
            ? { OR: [{ phone: { in: [...allowedPhones] }, reason: { not: "PUBLIC_WELCOME" } }, { reason: "PUBLIC_WELCOME" }] }
            : { phone: { in: [...allowedPhones] }, reason: { not: "PUBLIC_WELCOME" } }
          : publicWelcomeEnabled ? {} : { reason: { not: "PUBLIC_WELCOME" } }),
        replyText: { not: null },
        replyStatus: "PENDING",
      },
      orderBy: { receivedAt: "asc" },
      take: 10,
    });
    for (const row of rows) {
      const claimed = await this.prisma.whatsAppQuarantinedMessage.updateMany({
        where: { id: row.id, replyStatus: "PENDING" },
        data: { replyStatus: "SENDING", replyLeaseUntil: new Date(now.getTime() + 30_000), replySendStartedAt: now, replyLastErrorAt: null, replyLastErrorCode: null },
      });
      if (!claimed.count || !row.replyText) continue;
      let providerMessageId: string | undefined;
      try {
        await send(row.phone, row.replyText, (id) => { providerMessageId = id; }, row.reason as DirectReplyReason);
        await this.prisma.whatsAppQuarantinedMessage.update({ where: { id: row.id }, data: { replyStatus: "ACCEPTED", replyProviderMessageId: providerMessageId, replyAcceptedAt: new Date(), replyLeaseUntil: null } });
      } catch (error) {
        if (error instanceof EvolutionRequestError) {
          await this.prisma.whatsAppQuarantinedMessage.update({ where: { id: row.id }, data: { replyStatus: "DELIVERY_FAILED", replyLeaseUntil: null, replyLastErrorAt: new Date(), replyLastErrorCode: `EVOLUTION_HTTP_${error.status}` } });
        } else {
          await this.prisma.whatsAppQuarantinedMessage.update({ where: { id: row.id }, data: { replyStatus: "DELIVERY_UNKNOWN", replyLeaseUntil: null, replyLastErrorAt: new Date(), replyLastErrorCode: "EVOLUTION_TRANSPORT_UNKNOWN" } });
        }
      }
    }
  }

  async applyDeliveryStatus(instance: string, messageId: string, status: WhatsAppDeliveryStatus) {
    const row = await this.prisma.whatsAppQuarantinedMessage.findFirst({ where: { instance, replyProviderMessageId: messageId } });
    if (!row || !row.replyStatus) return false;
    const rank: Record<string, number> = { ACCEPTED: 1, SERVER_ACK: 2, DELIVERED: 3, READ: 4, PLAYED: 5 };
    const currentRank = rank[row.replyStatus] ?? 0;
    const nextRank = status === "DELIVERY_FAILED" ? 0 : rank[status];
    if (row.replyStatus === "DELIVERY_FAILED" || (status !== "DELIVERY_FAILED" && currentRank >= nextRank)) return false;
    if (status === "DELIVERY_FAILED" && currentRank >= rank.DELIVERED) return false;
    await this.prisma.whatsAppQuarantinedMessage.update({ where: { id: row.id }, data: {
      replyStatus: status,
      replyDeliveryUpdatedAt: new Date(),
      replyLeaseUntil: null,
      ...(status === "DELIVERY_FAILED" ? { replyLastErrorAt: new Date(), replyLastErrorCode: "EVOLUTION_DELIVERY_FAILED" } : {}),
    } });
    return true;
  }
}

function quarantineOriginalKey(id: string) {
  return `whatsapp/quarantine/${createHash("sha256").update(id).digest("hex")}`;
}

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export async function preserveQuarantinedWhatsAppMessage(
  input: QuarantineReceipt,
  dependencies: {
    repository: QuarantineRepository;
    storage: StorageProvider;
    client: Pick<EvolutionClient, "getMedia">;
  },
) {
  const requiresOriginal = ["IMAGE", "AUDIO", "DOCUMENT"].includes(input.message.type);
  const row = await dependencies.repository.receive(input, requiresOriginal);
  if (!requiresOriginal) {
    await dependencies.repository.preserved(row.id);
    return row;
  }
  try {
    if (row.storageKey && row.originalSha256) {
      const copy = await dependencies.storage.get(row.storageKey);
      if (copy && digest(await originalBytes(copy)) === row.originalSha256) return row;
    }
    if (!input.message.media) throw new Error("MissingMediaDescriptor");
    const original = await dependencies.client.getMedia({ message: input.message.media });
    const mimeType = original.mimeType.split(";", 1)[0].trim().toLowerCase();
    const storageKey = quarantineOriginalKey(row.id);
    await dependencies.storage.put({ key: storageKey, body: original.bytes, contentType: mimeType });
    const stored = await dependencies.storage.get(storageKey);
    if (!stored) throw new Error("OriginalUnavailable");
    const bytes = await originalBytes(stored);
    if (digest(bytes) !== digest(original.bytes)) throw new Error("OriginalHashMismatch");
    await dependencies.repository.preserved(row.id, { storageKey, mimeType, sha256: digest(bytes), size: bytes.length });
    return { ...row, storageKey, originalSha256: digest(bytes) };
  } catch (error) {
    await dependencies.repository.failed(row.id, error instanceof Error ? error.name : "UnknownError");
    throw error;
  }
}

export async function preserveAndQueueDirectWhatsAppReply(input: QuarantineReceipt, text: string, reason: Exclude<DirectReplyReason, "PUBLIC_WELCOME">, dependencies: {
  repository: PrismaWhatsAppQuarantineRepository;
  storage: StorageProvider;
  client: Pick<EvolutionClient, "getMedia">;
}) {
  const row = await preserveQuarantinedWhatsAppMessage(input, dependencies);
  await dependencies.repository.enqueueReply(row.id, text, reason);
  return row.id;
}

export async function preserveAndQueuePublicWhatsAppWelcome(input: QuarantineReceipt, text: string, dependencies: {
  repository: PrismaWhatsAppQuarantineRepository;
  storage: StorageProvider;
  client: Pick<EvolutionClient, "getMedia">;
  now?: Date;
}) {
  const row = await preserveQuarantinedWhatsAppMessage(input, dependencies);
  return dependencies.repository.enqueuePublicWelcome(row.id, { instance: input.instance, phone: input.message.phone, text, now: dependencies.now });
}

export async function recoverQuarantinedWhatsAppOriginals(prisma: PrismaClient, dependencies: {
  storage: StorageProvider;
  client: Pick<EvolutionClient, "getMedia">;
}, limit = 10) {
  const rows = await prisma.whatsAppQuarantinedMessage.findMany({ where: { status: "RECEIVED" }, orderBy: { receivedAt: "asc" }, take: limit });
  let recovered = 0;
  for (const row of rows) {
    const event = parseEvolutionWebhook(row.payload, row.instance);
    if (event.kind !== "message") {
      await prisma.whatsAppQuarantinedMessage.update({ where: { id: row.id }, data: { lastError: "InvalidStoredWebhook" } });
      continue;
    }
    try {
      await preserveQuarantinedWhatsAppMessage({ instance: row.instance, message: event.message, payload: row.payload }, { repository: new PrismaWhatsAppQuarantineRepository(prisma), ...dependencies });
      recovered++;
    } catch {}
  }
  return recovered;
}
