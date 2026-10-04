import { createWhatsAppAIClient, OPENAI_AGENT_MODEL } from "../../lib/channels/whatsapp/agent-provider.ts";
import { MistralExtractionProvider } from "../../lib/bot/extraction/mistral-extraction-provider.ts";
import { WhatsAppAgentOrchestrator } from "../../lib/channels/whatsapp/agent-orchestrator.ts";
import type { BurstSnapshot } from "../../lib/channels/whatsapp/burst-types.ts";
import type { PrismaClient } from "../../generated/prisma/client.ts";
import type { EvalCase, FieldDelta } from "../core/types.ts";
import { errorCase } from "../core/scoring.ts";
import { PRODUCT_CATALOG } from "../whatsapp-products/cases.ts";
import { createAgentEnvironment } from "./environment.ts";
import { pacedRequest, recoverInfrastructure } from "./recovery.ts";

type Turn = { text: string; products: number; question: boolean; name?: string; fob?: number | null; days?: number; moq?: number; supplier?: string; replyIncludes?: string[] };
const scenarios: Array<{ id: string; turns: Turn[] }> = [
  { id: "WA35-extended-product-context-corrections", turns: [
    { text: "Tengo un vaso de vidrio con precio FOB de 30 USD y leedtime de 60 dias", products: 0, question: true, replyIncludes: ["proveedor"] },
    { text: "Es del proveedor Alfa Tools", products: 1, question: false, name: "vaso de vidrio", fob: 30, days: 60, supplier: "supplier-alfa" },
    { text: "Corregí el FOB del último producto a USD 28. Conservá el plazo.", products: 1, question: false, name: "vaso de vidrio", fob: 28, days: 60 },
    { text: "Agregale el producto Jarra de vidrio. FOB USD 12 por unidad, MOQ 200 unidades, plazo 45 días.", products: 2, question: false, name: "Jarra de vidrio", fob: 12, days: 45, moq: 200, supplier: "supplier-alfa" },
    { text: "¿Cuál es el FOB y el plazo del producto vaso de vidrio del proveedor Alfa Tools?", products: 2, question: false, name: "vaso de vidrio", fob: 28, days: 60, replyIncludes: ["28", "60"] },
    { text: "Corregí el plazo del producto Jarra de vidrio del proveedor Alfa Tools a 50 días. No cambies el FOB ni MOQ.", products: 2, question: false, name: "Jarra de vidrio", fob: 12, days: 50, moq: 200 },
  ] },
  { id: "WA36-extended-ambiguity-explicit-destination", turns: [
    { text: "Agregá producto Taladro al proveedor Alfa Tools. FOB USD 9 por unidad, MOQ 500 unidades.", products: 1, question: false, name: "Taladro", fob: 9, supplier: "supplier-alfa" },
    { text: "Agregá producto Guante al proveedor Beta Medical. FOB USD 2 por unidad, MOQ 1000 unidades.", products: 2, question: false, name: "Guante", fob: 2, supplier: "supplier-beta" },
    { text: "Agregale el producto Martillo. FOB USD 3 por unidad, MOQ 200 unidades.", products: 2, question: true, replyIncludes: ["proveedor"] },
    { text: "Es para Alfa Tools", products: 3, question: false, name: "Martillo", fob: 3, moq: 200, supplier: "supplier-alfa" },
    { text: "Corregí el FOB del producto Guante del proveedor Beta Medical a USD 2.50. Conservá el MOQ.", products: 3, question: false, name: "Guante", fob: 2.5, moq: 1000, supplier: "supplier-beta" },
    { text: "¿Cuál es el FOB y MOQ del producto Martillo del proveedor Alfa Tools?", products: 3, question: false, name: "Martillo", fob: 3, moq: 200, replyIncludes: ["3", "200"] },
  ] },
  { id: "WA37-extended-supplier-approval-and-products", turns: [
    { text: "Corregí la ciudad del proveedor Alfa Tools: ahora es Guangzhou.", products: 0, question: true },
    { text: "cancelar", products: 0, question: false },
    { text: "Corregí la ciudad del proveedor Alfa Tools: ahora es Guangzhou.", products: 0, question: true },
    { text: "sí", products: 0, question: false },
    { text: "Agregá producto Taladro al proveedor Alfa Tools. FOB USD 9 por unidad, plazo 30 días.", products: 1, question: false, name: "Taladro", fob: 9, days: 30 },
    { text: "Corregí el FOB del último producto a USD 7. Conservá el plazo.", products: 1, question: false, name: "Taladro", fob: 7, days: 30 },
    { text: "Agregale el producto Martillo. FOB USD 3 por unidad, MOQ 200 unidades.", products: 2, question: false, name: "Martillo", fob: 3, moq: 200, supplier: "supplier-alfa" },
  ] },
];
export const EXTENDED_SCENARIO_IDS = scenarios.map((s) => s.id);
export async function runExtendedScenarios(prisma: PrismaClient, filter?: string[]): Promise<EvalCase[]> {
  const results: EvalCase[] = [];
  for (const scenario of scenarios.filter((s) => !filter || filter.includes(s.id))) {
    const env = await createAgentEnvironment(prisma, PRODUCT_CATALOG); const start = performance.now();
    const conversation: Array<{ role: string; text: string }> = []; const checkpoints: unknown[] = []; const retries: Array<{ stage: string; error: string }> = []; const usage: unknown[] = [];
    const correctFields: FieldDelta[] = []; const wrongFields: FieldDelta[] = [];
    const check = (field: string, expected: unknown, actual: unknown) => (JSON.stringify(expected) === JSON.stringify(actual) ? correctFields : wrongFields).push({ field, expected, actual });
    const delegate = createWhatsAppAIClient();
    const client = { async post(path: string, body: unknown, signal: AbortSignal) { const result = await pacedRequest(() => delegate.post(path, body, signal)); usage.push((result as { usage?: unknown }).usage); return result; } };
    const extraction = new MistralExtractionProvider({ client, businessCards: { async resolve() { throw new Error("Text scenario"); } } });
    const orchestrator = new WhatsAppAgentOrchestrator({ client, extraction, domain: env.domain });
    let snapshot: BurstSnapshot | null = null;
    try {
      for (const [i, turn] of scenario.turns.entries()) {
        conversation.push({ role: "user", text: turn.text });
        const fresh = !snapshot || !(snapshot.state as { question?: string }).question;
        if (fresh) snapshot = { id: `${env.prefix}-burst-${i}`, userId: env.userId, instance: `agent-eval-${env.prefix}`, phone: "5491112345678", version: 3, revision: 1, leaseId: "eval", status: "PROCESSING", state: { tripId: null, groups: [], question: null, controlIds: [], pendingRefs: [] }, messages: [] };
        else snapshot!.revision++;
        const current = snapshot!; const id = `${env.prefix}-message-${i}`;
        const candidate = await recoverInfrastructure(() => extraction.extractReading(turn.text, { type: "TEXT", text: turn.text }), retries, `reading:${i}`);
        const message: BurstSnapshot["messages"][number] = { id, sequence: current.revision, sentAt: null, envelope: { instance: current.instance, phone: current.phone, messageId: id, type: "TEXT", text: turn.text, media: null, sentAt: null }, reading: { complete: true, segments: [{ id: `${id}:1`, text: turn.text, candidate }] } };
        current.messages.push(message);
        if (fresh) await env.persist(current);
        else {
          await prisma.whatsAppBurst.update({ where: { id: current.id }, data: { revision: current.revision, status: "PROCESSING" } });
          await prisma.whatsAppBurstMessage.create({ data: { id, burstId: current.id, instance: current.instance, messageId: id, sequence: current.revision, envelope: JSON.parse(JSON.stringify(message.envelope)), reading: JSON.parse(JSON.stringify(message.reading)) } });
        }
        const result = await recoverInfrastructure(() => orchestrator.run(current, env.catalog, (state) => env.save(current, state)), retries, `turn:${i}`);
        current.state = result.state; conversation.push({ role: "assistant", text: result.text });
        await prisma.whatsAppBurstReply.create({ data: { burstId: current.id, revision: current.revision, status: "SENT", text: result.text } });
        if (result.state.agent.pending?.proposalId) await env.domain.displayed(current, result.state.agent.pending.proposalId);
        await prisma.whatsAppBurst.update({ where: { id: current.id }, data: { status: result.state.question ? "WAITING" : "DONE" } });
        const products = await prisma.supplierProduct.findMany({ where: { capture: { tripId: env.id("trip-china") } } });
        const p = products.find((p) => p.name.toLowerCase() === turn.name?.toLowerCase());
        check(`turn${i+1}:products`, turn.products, products.length); check(`turn${i+1}:question`, turn.question, Boolean(result.state.question));
        check(`turn${i+1}:noCompanyQuestion`, false, /(?:para qué|a qué|cuál|qué) empresa/iu.test(result.text));
        for (const field of ["fob", "days", "moq", "supplier"] as const) if (field in turn) check(`turn${i+1}:${field}`, field === "supplier" ? env.id(turn.supplier!) : turn[field], field === "fob" ? p?.fobAmount == null ? null : Number(p.fobAmount) : field === "days" ? p?.leadTimeDays : field === "moq" ? p?.moqQuantity : p?.supplierId);
        for (const term of turn.replyIncludes ?? []) check(`turn${i+1}:reply:${term}`, true, result.text.toLowerCase().includes(term));
        checkpoints.push({ turn: i+1, products, pending: result.state.agent.pending, calls: result.state.agent.calls, text: result.text });
      }
      check("noNewSuppliers", 0, await prisma.supplierCapture.count({ where: { createdById: env.userId, status: "DRAFT" } }));
      if (scenario.id.startsWith("WA37")) {
        check("approvedSupplierCity", "Guangzhou", (await prisma.supplier.findUniqueOrThrow({ where: { id: env.id("supplier-alfa") } })).city);
        check("cancelledProposal", 1, await prisma.whatsAppAgentOperation.count({ where: { burst: { userId: env.userId }, status: "CANCELLED" } }));
      }
      results.push({ caseId: scenario.id, suite: "whatsapp-agent", status: wrongFields.length ? "FAIL" : "PASS", correctFields, wrongFields, missingExpectedFields: [], hallucinatedFields: [], reviewExpected: [], reviewActual: [], reviewCorrect: null, latencyMs: Math.round(performance.now()-start), model: OPENAI_AGENT_MODEL, metadata: { conversation, checkpoints, retries, usage, realModel: true, persistence: "isolated PostgreSQL; no customer messages; memory across completed bursts" } });
    } catch (error) { const result = errorCase("whatsapp-agent", scenario.id, error, Math.round(performance.now()-start), OPENAI_AGENT_MODEL); result.metadata = { ...result.metadata, conversation, checkpoints, retries, usage }; results.push(result); }
    finally { await env.cleanup(); }
    console.log(`agent ${scenario.id}: ${results.at(-1)!.status}`);
    if (results.at(-1)!.status !== "PASS") console.log(JSON.stringify({ wrongFields: results.at(-1)!.wrongFields, error: results.at(-1)!.metadata.error }));
  }
  return results;
}
