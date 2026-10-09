import { getBusinessRecord } from "../../nihao/operations/read-records.ts";
import { createHash } from "node:crypto";
import type { PrismaClient } from "../../../generated/prisma/client.ts";
import type { AttachmentService, AttachmentRepository } from "../../bot/attachments.ts";
import type { SupplierExtractionService } from "../../bot/extraction/service.ts";
import type { StorageProvider } from "../../bot/storage/provider.ts";
import { createProduct } from "../../nihao/operations/create-product.ts";
import { assignProductAttachment } from "../../nihao/operations/product-files.ts";
import type { ExtractionCandidate } from "../../bot/types.ts";
import type { BurstGroup, BurstSnapshot } from "./burst-types.ts";

/** Adds a product draft to an authorized existing supplier without changing supplier fields. */
export function createProductMaterializer(dependencies: {
  prisma: PrismaClient; storage: StorageProvider; attachments: AttachmentService;
  repository: Required<Pick<AttachmentRepository, "saveTranscription">>;
  extraction: SupplierExtractionService;
}) {
  const { prisma, storage, attachments, repository, extraction } = dependencies;
  return async (snapshot: BurstSnapshot, group: BurstGroup): Promise<{ captureId: string; productId: string; resourceStatus: "DRAFT" | "CONFIRMED" }> => {
    const tripId = snapshot.state.tripId;
    if (!tripId || !group.companyId || !group.supplierId) throw new Error("Falta el destino del producto");
    const record = await getBusinessRecord(prisma, { userId: snapshot.userId }, "SUPPLIER", group.supplierId);
    if (record.kind !== "SUPPLIER" || record.supplier.tripId !== tripId || record.supplier.companyId !== group.companyId || record.supplier.status !== "CONFIRMED") throw new Error("Proveedor no autorizado");
    const supplier = record.supplier;
    const productId = `wap_${createHash("sha256").update(`${snapshot.id}:${group.id}`).digest("hex").slice(0, 40)}`;
    const selected = snapshot.messages.flatMap((m) => (m.reading?.segments ?? []).filter((s) => group.refs.includes(s.id)));
    const candidates: ExtractionCandidate[] = selected.map((s) => s.candidate ?? { extractedFields: {}, evidence: [], reviewFields: [], rawSource: { type: "TEXT", text: s.text } });
    const merged = extraction.mergeCandidates(candidates);
    const sourceText = selected.map((s) => s.text).filter(Boolean).join("\n\n");
    const product = await prisma.$transaction(tx => createProduct(tx, { userId: snapshot.userId, tripId, companyId: group.companyId! }, {
      id: productId, captureId: supplier.captureId, supplierId: supplier.id,
      fields: { name: group.productName ?? "Producto sin nombre", fob: merged.extractedFields.fob, moq: merged.extractedFields.moq, leadTime: merged.extractedFields.leadTime },
      trace: { sourceText, sourceEvidence: { refs: group.refs, evidence: merged.evidence }, reviewFields: merged.reviewFields.filter((f) => ["fob", "moq", "leadTime"].includes(f)), sourceConflicts: merged.sourceConflicts ?? [] },
    }, { access: "automation", confirmation: "immediate" }));
    for (const message of snapshot.messages) {
      const reading = message.reading;
      if (!reading?.storageKey || !reading.segments.some((s) => group.refs.includes(s.id))) continue;
      const object = await storage.get(reading.storageKey);
      if (!object) throw new Error("Falta el original del producto");
      const bytes = new Uint8Array(await new Response(object).arrayBuffer());
      const attachment = await attachments.upload({ userId: snapshot.userId, tripId, captureId: supplier.captureId, evidenceForProduct: true, clientEvidenceId: `waep_${createHash("sha256").update(`${productId}:${message.id}`).digest("hex").slice(0, 40)}`, type: message.envelope.type === "AUDIO" ? "AUDIO" : "PRODUCT_IMAGE", mimeType: reading.mimeType!, size: bytes.length, body: bytes });
      if (reading.transcript && reading.model) await repository.saveTranscription(attachment.id, { text: reading.transcript, model: reading.model });
      await prisma.$transaction(tx => assignProductAttachment(tx, { userId: snapshot.userId, tripId, companyId: group.companyId! }, { captureId: supplier.captureId, attachmentId: attachment.id, productId }, "automation"));
    }
    return { captureId: supplier.captureId, productId, resourceStatus: product.status };
  };
}
