import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.ts";
import { AttachmentService } from "../../lib/bot/attachments.ts";
import { SupplierExtractionService } from "../../lib/bot/extraction/service.ts";
import { PrismaAttachmentRepository } from "../../lib/bot/persistence/prisma-attachment-repository.ts";
import { PrismaSupplierCaptureRepository } from "../../lib/bot/persistence/prisma-repository.ts";
import type { StorageProvider } from "../../lib/bot/storage/provider.ts";
import { MistralBatchAnalyzer } from "../../lib/channels/whatsapp/batch-association.ts";
import { WhatsAppBatchService } from "../../lib/channels/whatsapp/batch-service.ts";
import type { EvalCase } from "../core/types.ts";
import { burstEvidence, goldProposal } from "./fixtures.ts";

export async function runBatchIntegration(connectionString: string): Promise<EvalCase[]> {
  const host = new URL(connectionString).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") throw new Error("EVAL_DATABASE_URL debe apuntar a una base PostgreSQL local descartable");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const runId = randomUUID();
  const phone = `54911${Math.floor(Math.random() * 10_000_000).toString().padStart(7, "0")}`;
  const files = new Map<string, Uint8Array>();
  const storage: StorageProvider = {
    async put(input) { files.set(input.key, input.body instanceof Uint8Array ? input.body : new Uint8Array(await new Response(input.body).arrayBuffer())); },
    async get(key) { const bytes = files.get(key); return bytes ? new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }) : null; },
    async delete(key) { files.delete(key); },
    async signedUrl(input) { return `https://example.invalid/${input.key}`; },
  };
  const analyzer = new MistralBatchAnalyzer({ async post(path, body) {
    if (path === "/ocr") {
      const document = (body as { document: { image_url: string } }).document.image_url;
      const encoded = document.slice(document.indexOf(",") + 1);
      return { pages: [{ markdown: Buffer.from(encoded, "base64").subarray(3).toString("utf8") }] };
    }
    const prompt = (body as { messages: Array<{ content: string }> }).messages.at(-1)?.content ?? "";
    const proposal = prompt.includes("unlabeled-photo")
      ? { groups: [{ name: "Alfa Tools", messageIds: ["named-comment", "unlabeled-photo"] }], suggestions: [], imageKinds: { "unlabeled-photo": "PRODUCT_IMAGE" } }
      : goldProposal;
    return { choices: [{ message: { content: JSON.stringify(proposal) } }] };
  } });
  const attachmentRepository = new PrismaAttachmentRepository(prisma);
  const captures = new PrismaSupplierCaptureRepository(prisma);
  const attachments = Object.assign(new AttachmentService(attachmentRepository, storage), { get: attachmentRepository.get.bind(attachmentRepository) });
  const extraction = new SupplierExtractionService([{ name: "eval", supports: () => true, async extract(input) {
    const name = input.source.type === "TEXT" ? input.source.text?.split("\n")[0] : null;
    return { rawSource: input.source, extractedFields: name ? { companyName: name } : {}, reviewFields: [], evidence: name ? [{ field: "companyName" as const, confidence: 1, evidence: name }] : [] };
  } }]);
  const sent: string[] = [];
  const service = new WhatsAppBatchService({ prisma, storage, analyzer, captures, attachments, extraction,
    client: { async sendText(input) { sent.push(input.text); } }, async completeConversation() {} });
  let tripId: string | null = null;
  let companyId: string | null = null;
  let userId: string | null = null;
  try {
    userId = `eval_${runId}`;
    tripId = randomUUID();
    const catalogId = randomUUID();
    companyId = randomUUID();
    await prisma.user.create({ data: { id: userId, name: "Eval Traveler", email: `eval-${runId}@example.invalid`, whatsappPhone: phone } });
    await prisma.trip.create({ data: { id: tripId, name: "Eval batch trip", status: "ACTIVE", createdById: userId } });
    await prisma.company.create({ data: { id: catalogId, name: "Eval Company", normalizedName: `eval company ${runId}`, dedupeKey: `eval-company-${runId}` } });
    await prisma.tripCompany.create({ data: { id: companyId, tripId, catalogCompanyId: catalogId } });
    await prisma.tripMember.create({ data: { userId, tripId, role: "TRAVELER" } });
    await prisma.tripCompanyMember.create({ data: { userId, companyId } });
    const context = { userId, tripId, companyId };
    let storedBeforeContext = false;
    for (const [index, item] of burstEvidence.entries()) {
      const bytes = Uint8Array.from([0xff, 0xd8, 0xff, ...Buffer.from(item.ocrText ?? "", "utf8")]);
      const input = { instance: "eval", messageId: item.id, phone, type: item.type, text: item.text ?? undefined,
        media: item.type === "IMAGE" ? { key: { id: item.id, remoteJid: `${phone}@s.whatsapp.net`, fromMe: false }, message: { imageMessage: {} } } : undefined,
        getMedia: async () => ({ bytes, mimeType: "image/jpeg" }) };
      if (index === 0) {
        await service.receiveUnresolved(input);
        storedBeforeContext = await prisma.whatsAppBatch.count({ where: { phone, tripId: null, companyId: null } }) === 1;
        await prisma.whatsAppConversation.create({ data: { userId, tripId, companyId, stage: "READY" } });
        await service.assignFromConversation(phone);
      } else await service.receive(input, context);
    }
    await service.receive({ instance: "eval", messageId: burstEvidence[0].id, phone, type: "IMAGE" }, context);
    await service.flush(context);
    await service.processDue();
    await service.processDue();
    const batch = await prisma.whatsAppBatch.findFirst({ where: { phone, instance: "eval" }, include: { messages: true } });
    const captureRows = await prisma.supplierCapture.findMany({ where: { tripId }, include: { attachments: true } });
    const attachmentsCorrect = captureRows.length === 5 && captureRows.every((capture) => capture.attachments.length === 2);
    const grouped = goldProposal.groups.every((group) => {
      const ids = new Set(batch?.messages.filter((message) => group.messageIds.includes(message.messageId)).map((message) => message.assignedCaptureId));
      return ids.size === 1 && !ids.has(null);
    });
    const passed = batch?.status === "DONE" && batch.messages.length === 15 && batch.messages.every((message) => message.status === "ASSIGNED")
      && storedBeforeContext && attachmentsCorrect && grouped && sent.length === 1 && files.size === 10;
    const firstCase: EvalCase = { caseId: "WB06-local-postgres-worker", suite: "whatsapp-batches", status: passed ? "PASS" : "FAIL", correctFields: [], missingExpectedFields: [], wrongFields: [], hallucinatedFields: [], reviewExpected: [], reviewActual: [], reviewCorrect: null, latencyMs: 0, model: "fake-mistral", metadata: { batches: batch ? 1 : 0, batchStatus: batch?.status, messages: batch?.messages.length, captures: captureRows.length, attachedImages: captureRows.reduce((sum, capture) => sum + capture.attachments.length, 0), replies: sent.length, stagedObjects: files.size - 10 } };

    const ambiguousBytes = Uint8Array.from([0xff, 0xd8, 0xff]);
    await service.receive({ instance: "eval", messageId: "unlabeled-photo", phone, type: "IMAGE", media: { key: { id: "unlabeled-photo", remoteJid: `${phone}@s.whatsapp.net`, fromMe: false }, message: { imageMessage: {} } }, getMedia: async () => ({ bytes: ambiguousBytes, mimeType: "image/jpeg" }) }, context);
    await service.receive({ instance: "eval", messageId: "named-comment", phone, type: "TEXT", text: "Alfa Tools: foto del producto sin etiqueta." }, context);
    await service.flush(context);
    await service.processDue();
    const needsClarification = await prisma.whatsAppBatch.findFirst({ where: { phone, status: "NEEDS_CLARIFICATION" }, include: { messages: true } });
    const pending = needsClarification?.messages.find((message) => message.messageId === "unlabeled-photo");
    const beforeReply = pending?.status === "SUGGESTED" && pending.assignedCaptureId === null;
    const clarification = await service.receive({ instance: "eval", messageId: "clarification", phone, type: "TEXT", text: "foto 1 = Alfa Tools" }, context);
    const resolved = await prisma.whatsAppBatch.findUnique({ where: { id: needsClarification?.id ?? "" }, include: { messages: true } });
    const assigned = resolved?.messages.find((message) => message.messageId === "unlabeled-photo");
    const secondPassed = beforeReply && resolved?.status === "DONE" && assigned?.status === "ASSIGNED" && Boolean(assigned.assignedCaptureId)
      && clarification.text.includes("Asocié foto 1") && await prisma.supplierAttachment.count({ where: { supplierCaptureId: assigned.assignedCaptureId! } }) === 1;
    const secondCase: EvalCase = { caseId: "WB07-clarification-before-attachment", suite: "whatsapp-batches", status: secondPassed ? "PASS" : "FAIL", correctFields: [], missingExpectedFields: [], wrongFields: [], hallucinatedFields: [], reviewExpected: [], reviewActual: [], reviewCorrect: null, latencyMs: 0, model: "fake-mistral", metadata: { beforeReply, status: resolved?.status, assignedCaptureId: assigned?.assignedCaptureId, reply: clarification.text } };
    return [firstCase, secondCase];
  } finally {
    if (tripId) await prisma.trip.deleteMany({ where: { id: tripId } });
    if (companyId) await prisma.company.deleteMany({ where: { id: { not: "" }, dedupeKey: `eval-company-${runId}` } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  }
}
