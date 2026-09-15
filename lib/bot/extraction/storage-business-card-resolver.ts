import type { AttachmentRepository } from "../attachments.ts";
import type { StorageProvider } from "../storage/provider.ts";

export type ResolvedBusinessCard = { bytes: Uint8Array; mimeType: string };

/** Server-side boundary: authorization belongs to the caller before resolving. */
export interface BusinessCardResolver {
  resolve(attachmentId: string): Promise<ResolvedBusinessCard>;
}

export class BusinessCardNotFoundError extends Error {}

export class StorageBusinessCardResolver implements BusinessCardResolver {
  constructor(private readonly attachments: Pick<AttachmentRepository, "get">, private readonly storage: StorageProvider) {}

  async resolve(attachmentId: string): Promise<ResolvedBusinessCard> {
    const attachment = await this.attachments.get(attachmentId);
    if (!attachment || attachment.type !== "BUSINESS_CARD") throw new BusinessCardNotFoundError("Business card no encontrada");
    const body = await this.storage.get(attachment.storageKey);
    if (!body) throw new BusinessCardNotFoundError("El archivo de la business card no está disponible");
    return { bytes: new Uint8Array(await new Response(body).arrayBuffer()), mimeType: attachment.mimeType };
  }
}
