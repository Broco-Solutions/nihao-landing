import { createWhatsAppAIClient, OPENAI_AGENT_MODEL } from "../../lib/channels/whatsapp/agent-provider.ts";
import { MistralExtractionProvider, type MistralHttpClient } from "../../lib/bot/extraction/mistral-extraction-provider.ts";
import { MistralBatchAnalyzer } from "../../lib/channels/whatsapp/batch-association.ts";
import { BurstReader } from "../../lib/channels/whatsapp/burst-reader.ts";
import { WhatsAppAgentOrchestrator } from "../../lib/channels/whatsapp/agent-orchestrator.ts";
import { WhatsAppAgentService } from "../../lib/channels/whatsapp/agent-service.ts";
import { PrismaBurstStore } from "../../lib/channels/whatsapp/prisma-burst-store.ts";
import { handleBurstWebhook } from "../../lib/channels/whatsapp/burst-webhook.ts";
import type { PrismaClient } from "../../generated/prisma/client.ts";
import type { EvalCase, FieldDelta } from "../core/types.ts";
import { errorCase } from "../core/scoring.ts";
import { PRODUCT_CATALOG } from "../whatsapp-products/cases.ts";
import { createAgentEnvironment } from "./environment.ts";
import { pacedRequest, recoverInfrastructure } from "./recovery.ts";

export const LEGACY_SCENARIO_IDS = ["WA31-legacy-product-company-name", "WA32-legacy-product-company-number", "WA33-legacy-repeated-product-latest-terms", "WA34-product-supplier-determines-company"];
export async function runLegacyScenarios(prisma: PrismaClient, filter?: string[]): Promise<EvalCase[]> {
  const results: EvalCase[] = [];
  for (const caseId of LEGACY_SCENARIO_IDS.filter((id) => !filter || filter.includes(id))) {
    const repeated = caseId.startsWith("WA33"); const fresh = caseId.startsWith("WA34");
    const inputCatalog = structuredClone(PRODUCT_CATALOG);
    if (repeated || fresh) inputCatalog.trips[0].suppliers!.find((s) => s.id === "supplier-alfa")!.name = "Broco";
    const env = await createAgentEnvironment(prisma, inputCatalog);
    const retries: Array<{ stage: string; error: string }> = []; let providerFailure: unknown = null;
    const started = performance.now(); const conversation: Array<{ role: string; text: string }> = []; const usage: unknown[] = [];
    const product = "Tengo un vaso de vidrio con precio fob de 30 usd y leedtime de 60 dias";
    const delegate = createWhatsAppAIClient();
    const client: MistralHttpClient = { async post(endpoint, body, signal) { let result: unknown;
      try { result = await pacedRequest(() => delegate.post(endpoint, body, signal)); } catch (error) { providerFailure = error; throw error; } const info = result as { usage?: unknown }; if (info.usage) usage.push(info.usage); return result; } };
    try {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: env.userId } });
      const instance = `legacy-eval-${env.prefix}`; const phone = user.whatsappPhone!;
      const batch = fresh ? null : await prisma.whatsAppBatch.create({ data: { instance, phone, userId: env.userId, dueAt: new Date(0), messages: { create: [{ instance, messageId: `${env.prefix}-original`, type: "TEXT", text: repeated ? product.replace("60 dias", "30 dias") : product, createdAt: new Date(Date.now() - 2000) }, ...(repeated ? [{ instance, messageId: `${env.prefix}-retry`, type: "TEXT", text: product, createdAt: new Date(Date.now() - 1000) }] : [])] } } });
      if (!fresh) await prisma.whatsAppConversation.create({ data: { userId: env.userId, tripId: env.id("trip-china"), stage: "COMPANY" } });
      if (!fresh) conversation.push({ role: "user", text: product }, { role: "assistant", text: "¿Para qué empresa es el próximo proveedor? Respondé con el número:\n1. Broco Solutions\n2. Kendal Salud" });
      const store = new PrismaBurstStore(prisma, { newVersion: 3, claimVersions: [3] });
      const provider = new MistralExtractionProvider({ client, businessCards: { async resolve() { throw new Error("Text scenario"); } } });
      const service = new WhatsAppAgentService({ store, domain: env.domain, orchestrator: new WhatsAppAgentOrchestrator({ client, extraction: provider, domain: env.domain }),
        reader: new BurstReader({ storage: env.storage, analyzer: new MistralBatchAnalyzer(client), extraction: provider, mistral: client, client: { async getMedia() { throw new Error("Text scenario"); } }, transcription: { async transcribe() { throw new Error("Text scenario"); } } }),
        async save(id, revision, leaseId, state) { return (await prisma.whatsAppBurst.updateMany({ where: { id, revision, leaseId, status: "PROCESSING" }, data: { state: JSON.parse(JSON.stringify(state)) } })).count === 1; },
        async send(_phone, text) { conversation.push({ role: "assistant", text }); },
      });
      const append = async (text: string, suffix: string) => {
        conversation.push({ role: "user", text }); const deferred: Array<() => Promise<void>> = [];
        const response = await handleBurstWebhook({ event: "MESSAGES_UPSERT", instance, data: { key: { id: `${env.prefix}-${suffix}`, remoteJid: `${phone}@s.whatsapp.net`, fromMe: false }, message: { conversation: text } } }, instance, () => service, (work) => deferred.push(work), async () => {});
        if (response?.status !== 200 || deferred.length !== 1) throw new Error("Webhook delegated to legacy handler");
        let first = true;
        return recoverInfrastructure(async () => {
          providerFailure = null;
          await prisma.whatsAppBurst.updateMany({ where: { userId: env.userId }, data: { dueAt: new Date(0) } });
          if (first) { first = false; await deferred[0](); } else await service.processDue(1);
          const row = await prisma.whatsAppBurst.findFirstOrThrow({ where: { userId: env.userId } });
          if (["OPEN", "PROCESSING"].includes(row.status)) {
            if (providerFailure) throw providerFailure;
            throw new Error(`Worker did not finish: ${row.status}`);
          }
          return row;
        }, retries, `worker:${suffix}`);
      };
      const initial = await append(fresh ? product : caseId.startsWith("WA32") ? "1" : "para broco", fresh ? "product" : "company");
      const firstReply = conversation.at(-1)!;
      const initialProducts = await prisma.supplierProduct.count({ where: { capture: { tripId: env.id("trip-china") } } });
      const final = await append(repeated || fresh ? "a broco" : "Es del proveedor Alfa Tools", "supplier");
      const products = await prisma.supplierProduct.findMany({ where: { capture: { tripId: env.id("trip-china") } } });
      const p = products[0];
      const actual = { transferred: batch ? (await prisma.whatsAppBatch.findUniqueOrThrow({ where: { id: batch.id } })).status : null, originals: batch ? await prisma.whatsAppBatchMessage.count({ where: { batchId: batch.id } }) : 0, firstWaiting: initial.status === "WAITING", asksCompany: /(?:para qué|a qué|cuál|qué) empresa/iu.test(firstReply.text), asksSupplier: firstReply.role === "assistant" && /proveedor/iu.test(firstReply.text), sendsHelp: /Hola, soy Nihao/iu.test(firstReply.text), initialProducts, products: products.length, drafts: await prisma.supplierCapture.count({ where: { createdById: env.userId, status: "DRAFT" } }), name: p?.name.toLowerCase(), supplier: p?.supplierId, company: p ? (await prisma.supplierCapture.findUniqueOrThrow({ where: { id: p.captureId } })).companyId : null, fob: p?.fobAmount == null ? null : Number(p.fobAmount), currency: p?.fobCurrency, days: p?.leadTimeDays, moq: p?.moqQuantity ?? null, status: p?.status, finalDone: final.status === "DONE" };
      const expected = { transferred: fresh ? null : "TRANSFERRED", originals: fresh ? 0 : repeated ? 2 : 1, firstWaiting: true, asksCompany: false, asksSupplier: true, sendsHelp: false, initialProducts: 0, products: 1, drafts: 0, name: "vaso de vidrio", supplier: env.id("supplier-alfa"), company: env.id("broco"), fob: 30, currency: "USD", days: 60, moq: null, status: "DRAFT", finalDone: true };
      const correctFields: FieldDelta[] = []; const wrongFields: FieldDelta[] = [];
      for (const [field, value] of Object.entries(expected)) (JSON.stringify(value) === JSON.stringify(actual[field as keyof typeof actual]) ? correctFields : wrongFields).push({ field, expected: value, actual: actual[field as keyof typeof actual] });
      results.push({ caseId, suite: "whatsapp-agent", status: wrongFields.length ? "FAIL" : "PASS", correctFields, wrongFields, missingExpectedFields: [], hallucinatedFields: [], reviewExpected: [], reviewActual: [], reviewCorrect: null, latencyMs: Math.round(performance.now() - started), model: process.env.WHATSAPP_AGENT_MODEL ?? OPENAI_AGENT_MODEL, metadata: { conversation, actual, usage, retries, state: final.state, realModel: true, persistence: "isolated local PostgreSQL", route: "Evolution webhook → legacy handoff → durable store → reader → agent worker → outbox; no real WhatsApp sends" } });
    } catch (error) { const result = errorCase("whatsapp-agent", caseId, error, Math.round(performance.now() - started), OPENAI_AGENT_MODEL); result.metadata = { ...result.metadata, conversation, usage, retries, state: (await prisma.whatsAppBurst.findFirst({ where: { userId: env.userId } }))?.state }; results.push(result); }
    finally { await prisma.whatsAppBatch.deleteMany({ where: { userId: env.userId } }); await env.cleanup(); }
    console.log(`agent ${caseId}: ${results.at(-1)!.status}`);
    if (results.at(-1)!.status !== "PASS") console.log(JSON.stringify({ wrongFields: results.at(-1)!.wrongFields, error: results.at(-1)!.metadata.error }));
  }
  return results;
}
