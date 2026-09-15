import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type DeleteObjectCommandOutput,
  type GetObjectCommandOutput,
  type PutObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { SignedStorageUrlInput, StorageObjectInput, StorageProvider } from "./provider.ts";

export class R2StorageConfigurationError extends Error {}
export class InvalidStorageKeyError extends Error {}

export type R2StorageConfig = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

type R2S3Client = {
  send(command: PutObjectCommand): Promise<PutObjectCommandOutput>;
  send(command: GetObjectCommand): Promise<GetObjectCommandOutput>;
  send(command: DeleteObjectCommand): Promise<DeleteObjectCommandOutput>;
};

type GetObjectSigner = (key: string, expiresInSeconds: number) => Promise<string>;

function requiredEnvironment(name: "R2_BUCKET" | "R2_ACCESS_KEY_ID" | "R2_SECRET_ACCESS_KEY"): string {
  const value = process.env[name];
  if (!value) throw new R2StorageConfigurationError(`${name} no está configurada`);
  return value;
}

export function r2StorageConfigFromEnvironment(): R2StorageConfig {
  const endpoint = process.env.R2_ENDPOINT;
  if (!endpoint) throw new R2StorageConfigurationError("R2_ENDPOINT no está configurada");
  try {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== "https:") throw new Error("protocol");
  } catch {
    throw new R2StorageConfigurationError("R2_ENDPOINT debe ser una URL HTTPS válida");
  }
  return {
    endpoint,
    bucket: requiredEnvironment("R2_BUCKET"),
    accessKeyId: requiredEnvironment("R2_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnvironment("R2_SECRET_ACCESS_KEY"),
  };
}

export function assertSafeStorageKey(key: string): void {
  if (!key || key.length > 1024 || key.startsWith("/") || key.includes("..") || key.includes("\0")) {
    throw new InvalidStorageKeyError("storageKey no es válido");
  }
}

export class R2S3StorageProvider implements StorageProvider {
  constructor(private readonly client: R2S3Client, private readonly bucket: string, private readonly signGetObject: GetObjectSigner) {}

  async put(input: StorageObjectInput): Promise<void> {
    assertSafeStorageKey(input.key);
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
    }));
  }

  async get(key: string): Promise<ReadableStream<Uint8Array> | null> {
    assertSafeStorageKey(key);
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!result.Body) return null;
      return result.Body.transformToWebStream();
    } catch (error) {
      if (error instanceof Error && error.name === "NoSuchKey") return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    assertSafeStorageKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async signedUrl(input: SignedStorageUrlInput): Promise<string> {
    assertSafeStorageKey(input.key);
    if (!Number.isInteger(input.expiresInSeconds) || input.expiresInSeconds < 1 || input.expiresInSeconds > 604_800) {
      throw new InvalidStorageKeyError("La expiración de la URL firmada debe estar entre 1 segundo y 7 días");
    }
    return this.signGetObject(input.key, input.expiresInSeconds);
  }
}

export function createR2StorageProvider(config = r2StorageConfigFromEnvironment()): R2S3StorageProvider {
  const client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  return new R2S3StorageProvider(client, config.bucket, (key, expiresInSeconds) =>
    getSignedUrl(client, new GetObjectCommand({ Bucket: config.bucket, Key: key }), { expiresIn: expiresInSeconds }),
  );
}
