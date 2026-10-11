import "dotenv/config";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { getStorageProvider } from "../lib/bot/storage/index.ts";
import { applyHistoricalCorrection, assertStagingCorrectionsEnvironment, diagnoseHistoricalCorrection, parseCorrectionManifest, revertHistoricalCorrection } from "../lib/admin/historical-corrections.ts";

assertStagingCorrectionsEnvironment();
const [action, fileOrId, actorId] = process.argv.slice(2);
if (!["diagnose", "apply", "revert"].includes(action) || !fileOrId || (action === "revert" && !actorId)) throw new Error("Uso: tsx scripts/historical-corrections.mts diagnose|apply MANIFEST.json; revert CORRECTION_ID ACTOR_ID");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
try {
  if (action === "revert") console.info(JSON.stringify(await revertHistoricalCorrection(db, fileOrId, actorId), null, 2));
  else {
    const manifest = parseCorrectionManifest(JSON.parse(await readFile(fileOrId, "utf8")));
    const result = action === "diagnose" ? await diagnoseHistoricalCorrection(db, manifest) : await applyHistoricalCorrection(db, manifest, async proof => {
      if (!process.env.NIHAO_STAGING_R2_BUCKET || process.env.R2_BUCKET !== process.env.NIHAO_STAGING_R2_BUCKET || process.env.R2_BUCKET === process.env.NIHAO_PRODUCTION_R2_BUCKET) throw new Error("La verificación requiere el bucket aislado de staging explícito");
      const stream = await getStorageProvider().get(proof.storageKey);
      if (!stream) throw new Error("Original faltante; no se aplicó la corrección");
      const reader = stream.getReader(), hash = createHash("sha256"); let size = 0;
      const deadline = Date.now() + 20_000;
      try {
        while (true) {
          const remaining = deadline - Date.now(); if (remaining <= 0) throw new Error("Tiempo agotado al verificar original");
          let timer: ReturnType<typeof setTimeout> | undefined;
          const chunk = await Promise.race([reader.read(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Tiempo agotado al verificar original")), remaining); })]).finally(() => clearTimeout(timer));
          if (chunk.done) break; size += chunk.value.byteLength;
          if (size > proof.size || size > 25 * 1024 * 1024) throw new Error("Original excede el tamaño revisado");
          hash.update(chunk.value);
        }
        if (size !== proof.size || hash.digest("hex").toLowerCase() !== proof.sha256.toLowerCase()) throw new Error("Hash/tamaño del original difieren de la prueba revisada");
      } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    });
    // Diagnosis includes private snapshots; redirect output only to an access-
    // controlled staging location, never commit it into the repository.
    console.info(JSON.stringify(result, null, 2));
  }
} finally { await db.$disconnect(); }
