export type StorageObjectInput = {
  key: string;
  body: ReadableStream<Uint8Array> | Uint8Array;
  contentType: string;
};

export type SignedStorageUrlInput = {
  key: string;
  expiresInSeconds: number;
};

/**
 * Boundary for object storage. The initial implementation deliberately does
 * not upload files: R2 credentials and a bucket have not been provisioned.
 */
export interface StorageProvider {
  put(input: StorageObjectInput): Promise<void>;
  get(key: string): Promise<ReadableStream<Uint8Array> | null>;
  delete(key: string): Promise<void>;
  signedUrl(input: SignedStorageUrlInput): Promise<string>;
}

export class StorageNotConfiguredError extends Error {}

export class UnconfiguredStorageProvider implements StorageProvider {
  private unavailable(): never {
    throw new StorageNotConfiguredError("El almacenamiento de adjuntos todavía no está configurado");
  }

  async put(): Promise<void> { this.unavailable(); }
  async get(): Promise<ReadableStream<Uint8Array> | null> { return this.unavailable(); }
  async delete(): Promise<void> { this.unavailable(); }
  async signedUrl(): Promise<string> { return this.unavailable(); }
}
