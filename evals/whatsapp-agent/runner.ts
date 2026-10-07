import { runPickerScenario, PICKER_SCENARIO_IDS } from "./picker-scenario.ts";
import { runExtendedScenarios, EXTENDED_SCENARIO_IDS } from "./extended-scenarios.ts";
import { createWhatsAppAIClient, OPENAI_AGENT_MODEL } from "../../lib/channels/whatsapp/agent-provider.ts";
import { runLegacyScenarios, LEGACY_SCENARIO_IDS } from "./legacy-scenarios.ts";
import { recoverInfrastructure, pacedRequest } from "./recovery.ts";
import { runAgentScenarios, AGENT_SCENARIO_IDS } from "./scenarios.ts";
import { readFile } from "node:fs/promises";
import { MistralExtractionProvider, type MistralHttpClient } from "../../lib/bot/extraction/mistral-extraction-provider.ts";
import { MistralBatchAnalyzer } from "../../lib/channels/whatsapp/batch-association.ts";
import { BurstReader } from "../../lib/channels/whatsapp/burst-reader.ts";
import { WhatsAppAgentOrchestrator } from "../../lib/channels/whatsapp/agent-orchestrator.ts";
import { agentState } from "../../lib/channels/whatsapp/agent-contract.ts";
import type { BurstSnapshot } from "../../lib/channels/whatsapp/burst-types.ts";
import { productRecord } from "../../lib/bot/supplier-edit.ts";
import { scoreExtraction, errorCase } from "../core/scoring.ts";
import type { EvalCase, FieldDelta } from "../core/types.ts";
import { PRODUCT_CASES, PRODUCT_CATALOG } from "../whatsapp-products/cases.ts";
import { createAgentEnvironment, localAgentDatabase } from "./environment.ts";

export async function runWhatsAppAgent(filter?: string[]): Promise<EvalCase[]> {
  if (!process.env.MISTRAL_API_KEY) throw new Error("MISTRAL_API_KEY is required for real agent evals");
  if (filter?.some((id) => ![...PRODUCT_CASES.map((f) => f.caseId), ...AGENT_SCENARIO_IDS, ...LEGACY_SCENARIO_IDS, ...EXTENDED_SCENARIO_IDS, ...PICKER_SCENARIO_IDS].includes(id))) throw new Error("Unknown whatsapp-agent case selection");
  const prisma = localAgentDatabase(); const results: EvalCase[] = [];
  try {
    for (const fixture of PRODUCT_CASES.filter((f) => !filter || filter.includes(f.caseId))) {
      const env = await createAgentEnvironment(prisma, fixture.catalog ?? PRODUCT_CATALOG);
      const retries: Array<{ stage: string; error: string }> = [];
      const resume = <T>(stage: string, run: () => Promise<T>) => recoverInfrastructure(run, retries, stage);
      const start = performance.now(); const usage: unknown[] = []; const responses: unknown[] = [];
      const delegate = createWhatsAppAIClient();
      const client: MistralHttpClient = { async post(endpoint, body, signal) { const result = await pacedRequest(() => delegate.post(endpoint, body, signal)); const value = result as { usage?: unknown; usage_info?: unknown }; if (value.usage ?? value.usage_info) usage.push(value.usage ?? value.usage_info); if ((body as { tools?: unknown }).tools) responses.push(result); return result; } };
      try {
        const provider = new MistralExtractionProvider({ client, businessCards: { async resolve() { throw new Error("Not needed by burst reader"); } } });
        const analyzer = new MistralBatchAnalyzer(client);
        const reader = new BurstReader({ storage: env.storage, analyzer, extraction: provider, mistral: client, transcription: { async transcribe() { throw new Error("Literal transcripts only; no Voxtral"); } }, client: { async getMedia({ message }) { const index = Number(message.key.id) - 1; return { bytes: new Uint8Array(await readFile(fixture.messages[index].image!)), mimeType: "image/png" }; } } });
        const snapshot: BurstSnapshot = { id: `${env.prefix}-burst`, userId: env.userId, instance: "agent-eval", phone: "5491112345678", version: 3, revision: fixture.messages.length, leaseId: "eval-lease", status: "PROCESSING", state: { tripId: null, groups: [], question: null, pendingRefs: [], controlIds: [] }, messages: [] };
        for (const [i, input] of fixture.messages.entries()) {
          const id = `${env.prefix}-m${i + 1}`;
          const message: BurstSnapshot["messages"][number] = { id, sequence: i + 1, sentAt: null, envelope: { instance: "agent-eval", messageId: id, phone: snapshot.phone, type: input.type, text: input.type === "TEXT" ? input.text! : null, sentAt: null, media: input.type === "IMAGE" ? { key: { id: String(i + 1), remoteJid: "eval@s.whatsapp.net", fromMe: false }, message: { imageMessage: {} } } : null }, reading: null };
          if (input.type === "AUDIO") {
            const segmented = await resume("audio-segmentation", () => analyzer.segmentAudio(input.text!));
            message.reading = { complete: true, transcript: input.text!, segments: await Promise.all(segmented.segments.map(async (text, j) => ({ id: `${id}:${j + 1}`, text, candidate: await resume("audio-extraction", () => provider.extractReading(text, { type: "AUDIO_TRANSCRIPT", text })) }))), segmentationConfident: segmented.confident };
          } else message.reading = await resume("reading", () => reader.read(message, async (reading) => { message.reading = structuredClone(reading); }));
          snapshot.messages.push(message);
        }
        await env.persist(snapshot);
        const orchestrator = new WhatsAppAgentOrchestrator({ client, extraction: provider, domain: env.domain });
        const initial = await resume("orchestrator", () => orchestrator.run(snapshot, env.catalog, (state) => env.save(snapshot, state)));
        const initialSummary = structuredClone({ text: initial.text, pending: initial.state.agent.pending, question: initial.state.question });
        snapshot.state = initial.state; let final = initial;
        if (fixture.answer) {
          snapshot.revision++;
          const id = `${env.prefix}-answer`;
          snapshot.messages.push({ id, sequence: snapshot.revision, sentAt: null, envelope: { instance: "agent-eval", messageId: id, phone: snapshot.phone, type: "TEXT", text: fixture.answer, media: null, sentAt: null }, reading: { complete: true, segments: [{ id: `${id}:1`, text: fixture.answer }] } });
          await prisma.whatsAppBurst.update({ where: { id: snapshot.id }, data: { revision: snapshot.revision } });
          await prisma.whatsAppBurstMessage.create({ data: { id, burstId: snapshot.id, instance: "agent-eval", messageId: id, sequence: snapshot.revision, envelope: JSON.parse(JSON.stringify(snapshot.messages.at(-1)!.envelope)), reading: JSON.parse(JSON.stringify(snapshot.messages.at(-1)!.reading)) } });
          final = await resume("orchestrator", () => orchestrator.run(snapshot, env.catalog, (state) => env.save(snapshot, state)));
        }
        const state = agentState(final.state);
        const products = await prisma.supplierProduct.findMany({ where: { capture: { tripId: { in: env.catalog.trips.map((t) => t.id) } } }, orderBy: { createdAt: "asc" } });
        const drafts = await prisma.supplierCapture.count({ where: { createdById: env.userId, status: "DRAFT" } });
        const correctFields: FieldDelta[] = []; const wrongFields: FieldDelta[] = []; const missingExpectedFields: FieldDelta[] = []; const hallucinatedFields: FieldDelta[] = [];
        const check = (field: string, expected: unknown, actual: unknown) => (JSON.stringify(expected) === JSON.stringify(actual) ? correctFields : actual == null && expected != null ? missingExpectedFields : wrongFields).push({ field, expected, actual });
        check("productCount", fixture.groups.filter((g) => g.supplierId).length, products.length);
        check("newSupplierDrafts", 0, drafts);
        check("question", fixture.question, Boolean(final.state.question));
        if (fixture.answer) check("initialAmbiguity", true, Boolean(initialSummary.question));
        if (fixture.caseId === "WP05-homonyms-numeric-answer") check("initialSupplierPicker", true, initialSummary.pending?.supplierPicker === true);
        for (const [index, expected] of fixture.groups.entries()) {
          if (!expected.supplierId) {
            check(`pendingProduct:${index}`, expected.name, state.agent.pending?.products?.find((p) => p.name.toLowerCase() === expected.name?.toLowerCase())?.name ?? null);
            continue;
          }
          const product = products.find((p) => p.name.toLowerCase() === expected.name?.toLowerCase());
          check(`product:${index}`, expected.name, product?.name ?? null);
          if (!product) continue;
          check(`supplier:${index}`, env.id(expected.supplierId), product.supplierId);
          check(`status:${index}`, "CONFIRMED", product.status);
          if (expected.sources) {
            const sourceReceipt = state.agent.receipts.find((r) => r.id === product.id);
            const messages = new Set(state.agent.evidence.filter((e) => sourceReceipt?.evidenceIds?.includes(e.id)).map((e) => e.messageId));
            check(`sources:${index}`, expected.sources, snapshot.messages.flatMap((m, i) => messages.has(m.id) ? [i + 1] : []));
          }
          const record = productRecord(product);
          const fields = scoreExtraction("whatsapp-agent", { caseId: fixture.caseId, expected: expected.expected ?? {}, mustRemainMissing: expected.missing ?? [] }, record as never, [], 0, OPENAI_AGENT_MODEL);
          correctFields.push(...fields.correctFields); wrongFields.push(...fields.wrongFields); missingExpectedFields.push(...fields.missingExpectedFields); hallucinatedFields.push(...fields.hallucinatedFields);
        }
        const status = wrongFields.length || missingExpectedFields.length || hallucinatedFields.length ? "FAIL" : "PASS";
        results.push({ caseId: fixture.caseId, suite: "whatsapp-agent", status, correctFields, wrongFields, missingExpectedFields, hallucinatedFields, reviewActual: [], reviewExpected: [], reviewCorrect: null, latencyMs: Math.round(performance.now() - start), model: process.env.WHATSAPP_AGENT_MODEL ?? OPENAI_AGENT_MODEL, metadata: { initial: initialSummary, text: final.text, state, products: products.map(productRecord), usage, responses, retries, realModel: true, realOCR: fixture.messages.some((m) => m.type === "IMAGE"), transcription: "provided literal transcripts; no real audio", persistence: "real isolated local PostgreSQL; cleaned after each case" } });
      } catch (error) { const result = errorCase("whatsapp-agent", fixture.caseId, error, Math.round(performance.now() - start), OPENAI_AGENT_MODEL); result.metadata = { ...result.metadata, usage, responses, retries }; results.push(result); }
      finally { await env.cleanup(); }
      console.log(`agent ${fixture.caseId}: ${results.at(-1)!.status}`);
      const last = results.at(-1)!;
      if (last.status !== "PASS") console.log(JSON.stringify({ caseId: last.caseId, wrongFields: last.wrongFields, missingExpectedFields: last.missingExpectedFields, error: last.metadata?.error }));
    }
    results.push(...await runAgentScenarios(prisma, filter));
    results.push(...await runLegacyScenarios(prisma, filter));
    results.push(...await runExtendedScenarios(prisma, filter));
    results.push(...await runPickerScenario(prisma, filter));
  } finally { await prisma.$disconnect(); }
  return results;
}
