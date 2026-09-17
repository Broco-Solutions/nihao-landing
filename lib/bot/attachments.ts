import { AuthorizationError } from "./authorization.ts";
import { CaptureNotFoundError } from "./persistence/repository.ts";
import type { StorageProvider } from "./storage/provider.ts";
import type { AttachmentType, SupplierAttachmentRecord, SupplierAttachmentView, TripMemberRole } from "./types.ts";
import { ValidationError } from "./validation.ts";

export const MAX_IMAGE_ATTACHMENT_SIZE = 8 * 1024 * 1024;
export const MAX_AUDIO_ATTACHMENT_SIZE = 25 * 1024 * 1024;
export const MAX_ATTACHMENT_SIZE = MAX_AUDIO_ATTACHMENT_SIZE;
export const ATTACHMENT_URL_TTL_SECONDS = 300;
export const ENABLED_ATTACHMENT_TYPES = ["BUSINESS_CARD", "PRODUCT_IMAGE", "AUDIO"] as const;

const EXTENSIONS_BY_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
const AUDIO_EXTENSIONS_BY_MIME = {
  "audio/webm": "webm", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg",
} as const;
type AllowedAttachmentMime = keyof typeof EXTENSIONS_BY_MIME | keyof typeof AUDIO_EXTENSIONS_BY_MIME;

export type AttachmentContext = { userId: string; tripId: string };
export type CaptureAttachmentOwner = { id: string; tripId: string; createdById: string };

export interface AttachmentRepository {
  hasTripAccess(context: AttachmentContext): Promise<boolean>;
  getTripMemberRole?(context: AttachmentContext): Promise<TripMemberRole | null>;
  getCapture(captureId: string): Promise<CaptureAttachmentOwner | null>;
  create(input: {
    supplierCaptureId: string;
    type: AttachmentType;
    storageKey: string;
    mimeType: string;
    size: number;
  }): Promise<SupplierAttachmentRecord>;
  list(captureId: string): Promise<SupplierAttachmentRecord[]>;
  get(attachmentId: string): Promise<SupplierAttachmentRecord | null>;
  deleteMetadata(attachmentId: string): Promise<void>;
  saveTranscription?(attachmentId: string, input: { text: string; model: string }): Promise<SupplierAttachmentRecord>;
}

export function parseAttachmentType(value: unknown): (typeof ENABLED_ATTACHMENT_TYPES)[number] {
  if (value === "BUSINESS_CARD" || value === "PRODUCT_IMAGE" || value === "AUDIO") return value;
  throw new ValidationError("El tipo de adjunto no está habilitado");
}

export function validateAttachmentFile(mimeType: string, size: number, type: (typeof ENABLED_ATTACHMENT_TYPES)[number] = "PRODUCT_IMAGE"): AllowedAttachmentMime {
  const allowed = type === "AUDIO" ? AUDIO_EXTENSIONS_BY_MIME : EXTENSIONS_BY_MIME;
  if (!(mimeType in allowed)) throw new ValidationError(type === "AUDIO" ? "Formato no permitido. Usá WebM, M4A, MP3, WAV u OGG" : "Formato no permitido. Usá JPG, PNG o WebP");
  const maximum = type === "AUDIO" ? MAX_AUDIO_ATTACHMENT_SIZE : MAX_IMAGE_ATTACHMENT_SIZE;
  if (!Number.isInteger(size) || size < 1 || size > maximum) {
    throw new ValidationError(type === "AUDIO" ? "El audio debe pesar hasta 25 MB" : "El archivo debe pesar hasta 8 MB");
  }
  return mimeType as AllowedAttachmentMime;
}

export function validateAttachmentContent(mimeType: AllowedAttachmentMime, body: Uint8Array): void {
  const jpeg = body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
  const png = body.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => body[index] === value);
  const webp = body.length >= 12
    && new TextDecoder().decode(body.slice(0, 4)) === "RIFF"
    && new TextDecoder().decode(body.slice(8, 12)) === "WEBP";
  const webm = body.length >= 4 && body[0] === 0x1a && body[1] === 0x45 && body[2] === 0xdf && body[3] === 0xa3;
  const mp4 = body.length >= 12 && new TextDecoder().decode(body.slice(4, 8)) === "ftyp";
  const mpeg = body.length >= 2 && ((body[0] === 0xff && (body[1] & 0xe0) === 0xe0) || new TextDecoder().decode(body.slice(0, 3)) === "ID3");
  const wav = body.length >= 12 && new TextDecoder().decode(body.slice(0, 4)) === "RIFF" && new TextDecoder().decode(body.slice(8, 12)) === "WAVE";
  const ogg = body.length >= 4 && new TextDecoder().decode(body.slice(0, 4)) === "OggS";
  if ((mimeType === "image/jpeg" && !jpeg) || (mimeType === "image/png" && !png) || (mimeType === "image/webp" && !webp)
    || (mimeType === "audio/webm" && !webm) || (mimeType === "audio/mp4" && !mp4) || (mimeType === "audio/mpeg" && !mpeg) || (mimeType === "audio/wav" && !wav) || (mimeType === "audio/ogg" && !ogg)) {
    throw new ValidationError("El contenido del archivo no coincide con un formato de imagen permitido");
  }
}

export function createAttachmentStorageKey(input: {
  tripId: string;
  captureId: string;
  mimeType: AllowedAttachmentMime;
  id?: string;
}): string {
  const safeId = (value: string) => /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,79}$/.test(value);
  if (!safeId(input.tripId) || !safeId(input.captureId)) throw new ValidationError("Contexto de adjunto inválido");
  const objectId = input.id ?? crypto.randomUUID();
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(objectId)) throw new ValidationError("Identificador de adjunto inválido");
  return `trips/${input.tripId}/captures/${input.captureId}/${objectId}.${(EXTENSIONS_BY_MIME as Record<string, string>)[input.mimeType] ?? AUDIO_EXTENSIONS_BY_MIME[input.mimeType as keyof typeof AUDIO_EXTENSIONS_BY_MIME]}`;
}

export class AttachmentService {
  constructor(
    private readonly repository: AttachmentRepository,
    private readonly storage: StorageProvider,
  ) {}

  private async requireCapture(context: AttachmentContext, captureId: string, requireOwner: boolean) {
    if (!(await this.repository.hasTripAccess(context))) throw new AuthorizationError("No tenés acceso a este viaje");
    const capture = await this.repository.getCapture(captureId);
    if (!capture || capture.tripId !== context.tripId) throw new CaptureNotFoundError("Captura no encontrada en este viaje");
    if (capture.createdById !== context.userId && (requireOwner || await this.repository.getTripMemberRole?.(context) !== "ADMIN")) {
      throw new AuthorizationError(requireOwner ? "No podés modificar una captura creada por otra persona" : "No podés ver una captura creada por otra persona");
    }
    return capture;
  }

  async upload(input: AttachmentContext & {
    captureId: string;
    type: unknown;
    mimeType: string;
    size: number;
    body: Uint8Array;
  }): Promise<SupplierAttachmentView> {
    const type = parseAttachmentType(input.type);
    const mimeType = validateAttachmentFile(input.mimeType, input.size, type);
    validateAttachmentContent(mimeType, input.body);
    await this.requireCapture(input, input.captureId, true);
    const storageKey = createAttachmentStorageKey({ tripId: input.tripId, captureId: input.captureId, mimeType });
    await this.storage.put({ key: storageKey, body: input.body, contentType: mimeType });
    try {
      const attachment = await this.repository.create({
        supplierCaptureId: input.captureId,
        type,
        storageKey,
        mimeType,
        size: input.size,
      });
      return { ...attachment, url: await this.storage.signedUrl({ key: storageKey, expiresInSeconds: ATTACHMENT_URL_TTL_SECONDS }) };
    } catch (error) {
      await this.storage.delete(storageKey).catch(() => undefined);
      throw error;
    }
  }

  async list(context: AttachmentContext, captureId: string): Promise<SupplierAttachmentView[]> {
    await this.requireCapture(context, captureId, false);
    return Promise.all((await this.repository.list(captureId)).map(async (attachment) => ({
      ...attachment,
      url: await this.storage.signedUrl({ key: attachment.storageKey, expiresInSeconds: ATTACHMENT_URL_TTL_SECONDS }),
    })));
  }

  async delete(context: AttachmentContext, captureId: string, attachmentId: string): Promise<void> {
    await this.requireCapture(context, captureId, true);
    const attachment = await this.repository.get(attachmentId);
    if (!attachment || attachment.captureId !== captureId || attachment.tripId !== context.tripId) {
      throw new CaptureNotFoundError("Adjunto no encontrado en esta captura");
    }
    await this.storage.delete(attachment.storageKey);
    await this.repository.deleteMetadata(attachmentId);
  }
}
