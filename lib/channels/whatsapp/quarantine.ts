import { validateOriginalMedia, isTerminalMediaError } from "./media-ingress.ts";
import { recordDeliveryEvent, reconcileDeliveryEvents } from "./delivery-events.ts";
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
  failed(id: string, reason: string, terminal?: boolean): Promise<void>;
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
      recoveryLeaseUntil: null,
      ...(original ? { storageKey: original.storageKey, mimeType: original.mimeType, originalSha256: original.sha256, originalSize: original.size } : {}),
    } });
  }

  async failed(id: string, reason: string, terminal = false) {
    const row = await this.prisma.whatsAppQuarantinedMessage.findUniqueOrThrow({ where: { id }, select: { recoveryAttempts: true } });
    const attempts = row.recoveryAttempts + 1;
    const delay = Math.min(3_600_000, 15_000 * 2 ** Math.min(attempts - 1, 8));
    await this.prisma.whatsAppQuarantinedMessage.update({ where: { id }, data: {
      status: terminal ? "REJECTED" : attempts >= 12 ? "RECOVERY_EXHAUSTED" : "RECEIVED",
      lastError: reason, recoveryAttempts: attempts, recoveryLeaseUntil: null,
      nextRecoveryAt: new Date(Date.now() + delay),
    } });
  }

  async enqueueReply(id: string, text: string, reason: "GREETING" | "UNLINKED_ALLOWED" | "UNSUPPORTED_MEDIA") {
    await this.prisma.whatsAppQuarantinedMessage.updateMany({
      where: { id, replyText: null },
      data: { reason, replyText: text, replyStatus: "PENDING" },
    });
  }

  async flushReplies(send: (phone: string, text: string, onMessageId: (id: string) => void) => Promise<void>) {
    const now = new Date();
    const allowedPhones = whatsappUatAllowedPhones();
    await this.prisma.whatsAppQuarantinedMessage.updateMany({ where: { replyStatus: "SENDING", replyLeaseUntil: { lt: now } }, data: { replyStatus: "DELIVERY_UNKNOWN", replyLeaseUntil: null, replyLastErrorAt: now, replyLastErrorCode: "SEND_LEASE_EXPIRED" } });
    const rows = await this.prisma.whatsAppQuarantinedMessage.findMany({
      where: {
        ...(allowedPhones ? { phone: { in: [...allowedPhones] } } : {}),
        replyText: { not: null },
        replyStatus: "PENDING",
      },
      orderBy: { receivedAt: "asc" },
      take: 10,
    });
    for (const row of rows) {
      const claimed = await this.prisma.whatsAppQuarantinedMessage.updateMany({
        where: { id: row.id, replyStatus: "PENDING" },
        data: { replyStatus: "SENDING", replyLeaseUntil: new Date(Date.now() + 30_000), replySendStartedAt: new Date(), replyLastErrorAt: null, replyLastErrorCode: null },
      });
      if (!claimed.count || !row.replyText) continue;
      let providerMessageId: string | undefined;
      try {
        await send(row.phone, row.replyText, (id) => { providerMessageId = id; });
        await this.prisma.whatsAppQuarantinedMessage.update({ where: { id: row.id }, data: { replyStatus: "ACCEPTED", replyProviderMessageId: providerMessageId, replyAcceptedAt: new Date(), replyLeaseUntil: null } });
        if (providerMessageId) await reconcileDeliveryEvents(this.prisma, row.instance, providerMessageId);
      } catch (error) {
        if (error instanceof EvolutionRequestError) {
          await this.prisma.whatsAppQuarantinedMessage.updateMany({ where: { id: row.id, replyStatus: "SENDING" }, data: { replyStatus: "DELIVERY_FAILED", replyLeaseUntil: null, replyLastErrorAt: new Date(), replyLastErrorCode: `EVOLUTION_HTTP_${error.status}` } });
        } else {
          await this.prisma.whatsAppQuarantinedMessage.updateMany({ where: { id: row.id, replyStatus: "SENDING" }, data: { replyStatus: "DELIVERY_UNKNOWN", replyLeaseUntil: null, replyLastErrorAt: new Date(), replyLastErrorCode: "EVOLUTION_TRANSPORT_UNKNOWN" } });
        }
      }
    }
  }

  async applyDeliveryStatus(instance: string, messageId: string, status: WhatsAppDeliveryStatus) {
    return recordDeliveryEvent(this.prisma, instance, messageId, status);
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
      if (copy && digest(await originalBytes(copy)) === row.originalSha256) { await dependencies.repository.preserved(row.id); return row; }
    }
    if (!input.message.media) throw new Error("MissingMediaDescriptor");
    const original = await dependencies.client.getMedia({ message: input.message.media });
    const mimeType = original.mimeType.split(";", 1)[0].trim().toLowerCase();
    validateOriginalMedia(input.message.type, mimeType, original.bytes);
    const storageKey = quarantineOriginalKey(row.id);
    await dependencies.storage.put({ key: storageKey, body: original.bytes, contentType: mimeType });
    const stored = await dependencies.storage.get(storageKey);
    if (!stored) throw new Error("OriginalUnavailable");
    const bytes = await originalBytes(stored);
    if (digest(bytes) !== digest(original.bytes)) throw new Error("OriginalHashMismatch");
    await dependencies.repository.preserved(row.id, { storageKey, mimeType, sha256: digest(bytes), size: bytes.length });
    return { ...row, storageKey, originalSha256: digest(bytes) };
  } catch (error) {
    await dependencies.repository.failed(row.id, error instanceof Error ? error.name : "UnknownError", isTerminalMediaError(error));
    throw error;
  }
}

export async function preserveAndQueueDirectWhatsAppReply(input: QuarantineReceipt, text: string, reason: "GREETING" | "UNLINKED_ALLOWED" | "UNSUPPORTED_MEDIA", dependencies: {
  repository: PrismaWhatsAppQuarantineRepository;
  storage: StorageProvider;
  client: Pick<EvolutionClient, "getMedia">;
}) {
  const row = await preserveQuarantinedWhatsAppMessage(input, dependencies);
  await dependencies.repository.enqueueReply(row.id, text, reason);
  return row.id;
}

export async function recoverQuarantinedWhatsAppOriginals(prisma: PrismaClient, dependencies: {
  storage: StorageProvider;
  client: Pick<EvolutionClient, "getMedia">;
}, limit = 10) {
  const now = new Date();
  const deadline = now.getTime() + 15_000;
  const rows = await prisma.whatsAppQuarantinedMessage.findMany({ where: { status: "RECEIVED", nextRecoveryAt: { lte: now }, OR: [{ recoveryLeaseUntil: null }, { recoveryLeaseUntil: { lt: now } }] }, orderBy: [{ nextRecoveryAt: "asc" }, { receivedAt: "asc" }], take: limit });
  let recovered = 0;
  for (const row of rows) {
    if (Date.now() >= deadline) break;
    const claimed = await prisma.whatsAppQuarantinedMessage.updateMany({ where: { id: row.id, status: "RECEIVED", nextRecoveryAt: { lte: now }, OR: [{ recoveryLeaseUntil: null }, { recoveryLeaseUntil: { lt: now } }] }, data: { recoveryLeaseUntil: new Date(Date.now() + 60_000) } });
    if (!claimed.count) continue;
    const event = parseEvolutionWebhook(row.payload, row.instance);
    if (event.kind !== "message") {
      await prisma.whatsAppQuarantinedMessage.update({ where: { id: row.id }, data: { status: "UNRECOVERABLE", lastError: "InvalidStoredWebhook", recoveryLeaseUntil: null } });
      continue;
    }
    try {
      await preserveQuarantinedWhatsAppMessage({ instance: row.instance, message: event.message, payload: row.payload }, { repository: new PrismaWhatsAppQuarantineRepository(prisma), ...dependencies });
      recovered++;
    } catch {}
  }
  return recovered;
}
