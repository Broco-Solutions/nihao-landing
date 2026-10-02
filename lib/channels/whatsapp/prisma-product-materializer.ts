import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "../../../generated/prisma/client.ts";
import type { AttachmentService, AttachmentRepository } from "../../bot/attachments.ts";
import type { SupplierExtractionService } from "../../bot/extraction/service.ts";
import type { StorageProvider } from "../../bot/storage/provider.ts";
import { parseProduct } from "../../bot/supplier-edit.ts";
import type { ExtractionCandidate } from "../../bot/types.ts";
import type { BurstGroup, BurstSnapshot } from "./burst-types.ts";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/** Adds a product draft to an authorized existing supplier without changing supplier fields. */
export function createProductMaterializer(dependencies: {
  prisma: PrismaClient; storage: StorageProvider; attachments: AttachmentService;
  repository: Required<Pick<AttachmentRepository, "saveTranscription">>;
  extraction: SupplierExtractionService;
}) {
  const { prisma, storage, attachments, repository, extraction } = dependencies;
  return async (snapshot: BurstSnapshot, group: BurstGroup): Promise<{ captureId: string; productId: string }> => {
    const tripId = snapshot.state.tripId;
    if (!tripId || !group.companyId || !group.supplierId) throw new Error("Falta el destino del producto");
    const supplier = await prisma.supplier.findFirst({ where: { id: group.supplierId, tripId, companyId: group.companyId, status: "CONFIRMED", trip: { status: { in: ["ACTIVE", "PLANNED"] }, members: { some: { userId: snapshot.userId, role: "TRAVELER" } } }, company: { active: true, members: { some: { userId: snapshot.userId } } } }, select: { id: true, captureId: true } });
    if (!supplier) throw new Error("Proveedor no autorizado");
    const productId = `wap_${createHash("sha256").update(`${snapshot.id}:${group.id}`).digest("hex").slice(0, 40)}`;
    const selected = snapshot.messages.flatMap((m) => (m.reading?.segments ?? []).filter((s) => group.refs.includes(s.id)));
    const candidates: ExtractionCandidate[] = selected.map((s) => s.candidate ?? { extractedFields: {}, evidence: [], reviewFields: [], rawSource: { type: "TEXT", text: s.text } });
    const merged = extraction.mergeCandidates(candidates);
    const sourceText = selected.map((s) => s.text).filter(Boolean).join("\n\n");
    const data = parseProduct({ name: group.productName ?? "Producto sin nombre", fob: merged.extractedFields.fob, moq: merged.extractedFields.moq, leadTime: merged.extractedFields.leadTime });
    const product = await prisma.supplierProduct.upsert({ where: { id: productId }, create: { id: productId, captureId: supplier.captureId, supplierId: supplier.id, status: "DRAFT", ...data, sourceText, sourceEvidence: json({ refs: group.refs, evidence: merged.evidence }), reviewFields: json(merged.reviewFields.filter((f) => ["fob", "moq", "leadTime"].includes(f))), sourceConflicts: json(merged.sourceConflicts ?? []) }, update: {} });
    if (product.captureId !== supplier.captureId || product.supplierId !== supplier.id) throw new Error("El destino del producto cambió");
    for (const message of snapshot.messages) {
      const reading = message.reading;
      if (!reading?.storageKey || !reading.segments.some((s) => group.refs.includes(s.id))) continue;
      const object = await storage.get(reading.storageKey);
      if (!object) throw new Error("Falta el original del producto");
      const bytes = new Uint8Array(await new Response(object).arrayBuffer());
      const attachment = await attachments.upload({ userId: snapshot.userId, tripId, captureId: supplier.captureId, evidenceForProduct: true, clientEvidenceId: `waep_${createHash("sha256").update(`${productId}:${message.id}`).digest("hex").slice(0, 40)}`, type: message.envelope.type === "AUDIO" ? "AUDIO" : "PRODUCT_IMAGE", mimeType: reading.mimeType!, size: bytes.length, body: bytes });
      if (reading.transcript && reading.model) await repository.saveTranscription(attachment.id, { text: reading.transcript, model: reading.model });
      await prisma.supplierAttachment.update({ where: { id: attachment.id }, data: { productId } });
    }
    return { captureId: supplier.captureId, productId };
  };
}
