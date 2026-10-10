import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "../../../generated/prisma/client.ts";
import type { StorageProvider } from "../../bot/storage/provider.ts";
import type { EvolutionClient } from "../evolution/client.ts";
import type { IncomingWhatsAppMessage } from "../evolution/webhook.ts";
import { originalBytes } from "./operational-runtime.ts";

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
    return;
  }
  try {
    if (row.storageKey && row.originalSha256) {
      const copy = await dependencies.storage.get(row.storageKey);
      if (copy && digest(await originalBytes(copy)) === row.originalSha256) return;
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
  } catch (error) {
    await dependencies.repository.failed(row.id, error instanceof Error ? error.name : "UnknownError");
    throw error;
  }
}
