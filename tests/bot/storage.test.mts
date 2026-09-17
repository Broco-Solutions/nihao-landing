import test from "node:test";
import assert from "node:assert/strict";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, type DeleteObjectCommandOutput, type GetObjectCommandOutput, type PutObjectCommandOutput } from "@aws-sdk/client-s3";
import { InvalidStorageKeyError, R2S3StorageProvider, assertSafeStorageKey } from "../../lib/bot/storage/r2-s3-provider.ts";

class RecordingS3Client {
  readonly commands: Array<PutObjectCommand | GetObjectCommand | DeleteObjectCommand> = [];

  async send(command: PutObjectCommand): Promise<PutObjectCommandOutput>;
  async send(command: GetObjectCommand): Promise<GetObjectCommandOutput>;
  async send(command: DeleteObjectCommand): Promise<DeleteObjectCommandOutput>;
  async send(command: PutObjectCommand | GetObjectCommand | DeleteObjectCommand) {
    this.commands.push(command);
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
  assert.throws(() => assertSafeStorageKey("../escape"), InvalidStorageKeyError);
  await assert.rejects(provider.signedUrl({ key: "/absolute", expiresInSeconds: 60 }), InvalidStorageKeyError);
});
