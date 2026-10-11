import test from "node:test";
import assert from "node:assert/strict";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, type DeleteObjectCommandOutput, type GetObjectCommandOutput, type PutObjectCommandOutput } from "@aws-sdk/client-s3";
import { InvalidStorageKeyError, R2S3StorageProvider, assertSafeStorageKey } from "../../lib/bot/storage/r2-s3-provider.ts";

class RecordingS3Client {
  readonly commands: Array<PutObjectCommand | GetObjectCommand | DeleteObjectCommand> = [];
  readonly signals: AbortSignal[] = [];

  async send(command: PutObjectCommand, options?: { abortSignal?: AbortSignal }): Promise<PutObjectCommandOutput>;
  async send(command: GetObjectCommand, options?: { abortSignal?: AbortSignal }): Promise<GetObjectCommandOutput>;
  async send(command: DeleteObjectCommand, options?: { abortSignal?: AbortSignal }): Promise<DeleteObjectCommandOutput>;
  async send(command: PutObjectCommand | GetObjectCommand | DeleteObjectCommand, options?: { abortSignal?: AbortSignal }) {
    this.commands.push(command);
    if (options?.abortSignal) this.signals.push(options.abortSignal);
    if (command instanceof GetObjectCommand) {
      const error = new Error("missing");
      error.name = "NoSuchKey";
      throw error;
    }
    return {};
  }
}

test("el adapter R2 usa comandos S3, firma URLs y no acepta claves inseguras", async () => {
  const client = new RecordingS3Client();
  const provider = new R2S3StorageProvider(client, "nihao-bot-assets", async (key, expiresInSeconds) => `https://signed.invalid/${key}?ttl=${expiresInSeconds}`);

  await provider.put({ key: "captures/capture-a/card.jpg", body: new Uint8Array([1, 2]), contentType: "image/jpeg" });
  assert.equal(await provider.get("captures/missing.jpg"), null);
  await provider.delete("captures/capture-a/card.jpg");
  assert.equal(await provider.signedUrl({ key: "captures/capture-a/card.jpg", expiresInSeconds: 60 }), "https://signed.invalid/captures/capture-a/card.jpg?ttl=60");
  assert.equal(client.commands.filter((command) => command instanceof PutObjectCommand).length, 1);
  assert.equal(client.commands.filter((command) => command instanceof DeleteObjectCommand).length, 1);
  assert.equal(client.signals.length, 3, "all storage operations have deadlines, including webhook/recovery outside worker context");
  assert.ok(client.signals.every(signal => !signal.aborted));
  assert.throws(() => assertSafeStorageKey("../escape"), InvalidStorageKeyError);
  await assert.rejects(provider.signedUrl({ key: "/absolute", expiresInSeconds: 60 }), InvalidStorageKeyError);
});
