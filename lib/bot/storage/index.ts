import { createR2StorageProvider } from "./r2-s3-provider.ts";

let storage: ReturnType<typeof createR2StorageProvider> | undefined;

export function getStorageProvider() {
  storage ??= createR2StorageProvider();
  return storage;
}
