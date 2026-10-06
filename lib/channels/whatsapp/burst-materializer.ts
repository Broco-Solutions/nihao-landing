import { createHash } from "node:crypto";
import type { AttachmentService, AttachmentRepository } from "../../bot/attachments.ts";
import type { SupplierExtractionService } from "../../bot/extraction/service.ts";
import type { SupplierCaptureRepository } from "../../bot/persistence/repository.ts";
import type { StorageProvider } from "../../bot/storage/provider.ts";
import type { ExtractionCandidate } from "../../bot/types.ts";
import type { BurstGroup, BurstSnapshot, BurstStore } from "./burst-types.ts";

export function createBurstMaterializer(dependencies: {
  store: Pick<BurstStore, "catalog">; storage: StorageProvider; attachments: AttachmentService;
  repository: Required<Pick<AttachmentRepository, "saveTranscription">>;
  captures: Pick<SupplierCaptureRepository, "createDraft" | "replaceExtraction">; extraction: SupplierExtractionService;
}): (snapshot: BurstSnapshot, group: BurstGroup) => Promise<string> {
  const { store, storage, attachments, repository, captures, extraction } = dependencies;
  return async (snapshot, group) => {
      const context = { userId: snapshot.userId, tripId: snapshot.state.tripId!, companyId: group.companyId! };
      const authorized = await store.catalog(snapshot.userId);
      if (!authorized.trips.some((t) => t.id === context.tripId && t.companies.some((c) => c.id === context.companyId))) throw new Error("Contexto no autorizado");
      const captureId = `wab2_${createHash("sha256").update(`${snapshot.id}:${group.id}`).digest("hex").slice(0, 40)}`;
      const candidates: ExtractionCandidate[] = [];
      const attachmentIds: string[] = [];
      // Bootstrap an idempotent DRAFT so attachments can be authorized independently.
      await captures.createDraft({ ...context, clientCaptureId: captureId, extraction: extraction.mergeCandidates([{ extractedFields: {}, reviewFields: [], evidence: [], rawSource: { type: "TEXT", text: "" } }]) });
      for (const message of snapshot.messages) {
        const reading = message.reading;
        const segments = reading?.segments.filter((s) => group.refs.includes(s.id)) ?? [];
        if (!segments.length || !reading) continue;
        let attachmentId: string | undefined;
        if (reading.storageKey) {
          const object = await storage.get(reading.storageKey);
          if (!object) throw new Error("No se encontró la evidencia original");
          const bytes = new Uint8Array(await new Response(object).arrayBuffer());
          const attachment = await attachments.upload({ ...context, captureId, allowDocumentEvidence: true, clientEvidenceId: `wae2_${createHash("sha256").update(`${captureId}:${message.id}`).digest("hex").slice(0, 40)}`, type: message.envelope.type === "AUDIO" ? "AUDIO" : reading.imageKind ?? "PRODUCT_IMAGE", mimeType: reading.mimeType!, size: bytes.length, body: bytes });
          attachmentId = attachment.id;
          attachmentIds.push(attachment.id);
          if (reading.transcript && reading.model) await repository.saveTranscription(attachment.id, { text: reading.transcript, model: reading.model });
        }
        for (const segment of segments) {
          const candidate = segment.candidate ?? { extractedFields: {}, reviewFields: [], evidence: [], rawSource: { type: "TEXT" as const, text: segment.text } };
          candidates.push({ ...candidate, rawSource: { ...candidate.rawSource, text: segment.text, ...(attachmentId ? { attachmentId } : {}) } });
        }
      }
      const merged = extraction.mergeCandidates(candidates);
      // Preserve ordered literal source fragments and their attachments in the web review.
      merged.rawSource = { type: "TEXT", text: candidates.map((c) => c.rawSource.text ?? "").filter(Boolean).join("\n\n") };
      await captures.replaceExtraction(context, captureId, merged, { analyzedAttachmentIds: attachmentIds });
      return captureId;
  };
}
