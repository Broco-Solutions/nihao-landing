import { readFile } from "node:fs/promises";
import path from "node:path";
import { FetchMistralHttpClient, MISTRAL_TEXT_MODEL } from "../../lib/bot/extraction/mistral-extraction-provider.ts";
import { MistralBatchAnalyzer, type BatchAnalysis, type BatchEvidence } from "../../lib/channels/whatsapp/batch-association.ts";
import type { EvalCase, FieldDelta } from "../core/types.ts";
import { burstEvidence, goldGroups, goldImageKinds, goldProposal } from "./fixtures.ts";
import { runBatchIntegration } from "./integration.ts";

type Expected = { groups: Array<{ name: string; messageIds: string[] }>; suggestions?: Array<{ messageId: string; providerName: string | null }>; imageKinds?: Record<string, string> };
function sameProvider(left: string | null | undefined, right: string | null | undefined): boolean {
  const normalize = (value: string | null | undefined) => (value ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es").replace(/\s+/g, " ").trim();
  return normalize(left) === normalize(right);
}

function score(caseId: string, evidence: BatchEvidence[], actual: BatchAnalysis, expected: Expected, model: string | null, latencyMs: number): EvalCase {
  const wanted = new Map(expected.groups.flatMap((group) => group.messageIds.map((id) => [id, group.name] as const)));
  const got = new Map(actual.groups.flatMap((group) => group.messageIds.map((id) => [id, group.name] as const)));
  const suggestions = new Map(actual.suggestions.map((item) => [item.messageId, item.providerName] as const));
  const correctFields: FieldDelta[] = [];
  const missingExpectedFields: FieldDelta[] = [];
  const wrongFields: FieldDelta[] = [];
  for (const item of evidence) {
    const expectedProvider = wanted.get(item.id);
    const expectedSuggestion = expected.suggestions?.find((candidate) => candidate.messageId === item.id);
    const actualProvider = got.get(item.id);
    const actualSuggestion = suggestions.get(item.id);
    const field = `association:${item.id}`;
    if (expectedProvider) {
      if (sameProvider(actualProvider, expectedProvider)) correctFields.push({ field, expected: expectedProvider, actual: actualProvider });
      else if (actualProvider) wrongFields.push({ field, expected: expectedProvider, actual: actualProvider });
      else missingExpectedFields.push({ field, expected: expectedProvider, actual: actualSuggestion ?? null });
    } else if (expectedSuggestion) {
      if (!actualProvider && suggestions.has(item.id) && (expectedSuggestion.providerName === null || sameProvider(actualSuggestion, expectedSuggestion.providerName))) correctFields.push({ field, expected: "clarification", actual: "clarification" });
      else wrongFields.push({ field, expected: "clarification", actual: actualProvider ?? actualSuggestion ?? null });
    }
    if (item.type === "IMAGE" && expected.imageKinds?.[item.id]) {
      const kindField = `imageKind:${item.id}`;
      const kind = actual.imageKinds[item.id];
      if (kind === expected.imageKinds[item.id]) correctFields.push({ field: kindField, expected: kind, actual: kind });
      else wrongFields.push({ field: kindField, expected: expected.imageKinds[item.id], actual: kind });
    }
  }
  return { caseId, suite: "whatsapp-batches", status: wrongFields.length || missingExpectedFields.length ? "FAIL" : "PASS", correctFields, missingExpectedFields, wrongFields,
    hallucinatedFields: [], reviewExpected: [], reviewActual: [], reviewCorrect: null, latencyMs, model,
    metadata: { messageCount: evidence.length, imageCount: evidence.filter((item) => item.type === "IMAGE").length, providerCount: expected.groups.length,
      crossProviderAssociations: wrongFields.filter((item) => item.field.startsWith("association:") && typeof item.actual === "string").length,
      pendingClarifications: actual.suggestions.length } };
}

async function fakeAnalyze(evidence: BatchEvidence[], proposal: unknown): Promise<BatchAnalysis> {
  const analyzer = new MistralBatchAnalyzer({ async post() { return { choices: [{ message: { content: JSON.stringify(proposal) } }] }; } });
  return analyzer.analyze(evidence);
}

export async function runWhatsAppBatches(root: string): Promise<EvalCase[]> {
  const results: EvalCase[] = [];
  results.push(score("WB01-10-images-5-suppliers", burstEvidence, await fakeAnalyze(burstEvidence, goldProposal), { groups: goldGroups, imageKinds: goldImageKinds }, "fake-mistral", 0));
  const reversed = [...burstEvidence].reverse();
  results.push(score("WB02-out-of-order-delivery", reversed, await fakeAnalyze(reversed, goldProposal), { groups: goldGroups, imageKinds: goldImageKinds }, "fake-mistral", 0));
  const ambiguous: BatchEvidence[] = [
    { id: "unlabeled-photo", type: "IMAGE", text: null, ocrText: "" },
    { id: "named-comment", type: "TEXT", text: "Alfa Tools: esta es la herramienta que vimos.", ocrText: null },
  ];
  const provisional = await fakeAnalyze(ambiguous, { groups: [{ name: "Alfa Tools", messageIds: ["unlabeled-photo", "named-comment"] }], suggestions: [], imageKinds: { "unlabeled-photo": "PRODUCT_IMAGE" } });
  results.push(score("WB03-ambiguous-photo-needs-confirmation", ambiguous, provisional, { groups: [{ name: "Alfa Tools", messageIds: ["named-comment"] }], suggestions: [{ messageId: "unlabeled-photo", providerName: "Alfa Tools" }], imageKinds: { "unlabeled-photo": "PRODUCT_IMAGE" } }, "fake-mistral", 0));
  const repeated = await fakeAnalyze(ambiguous, { groups: [{ name: "Alfa Tools", messageIds: ["named-comment"] }, { name: "Boreal Textiles", messageIds: ["named-comment"] }], suggestions: [{ messageId: "unlabeled-photo", providerName: null }], imageKinds: { "unlabeled-photo": "PRODUCT_IMAGE" } });
  results.push(score("WB04-duplicate-proposal-is-not-duplicated", ambiguous, repeated, { groups: [{ name: "Alfa Tools", messageIds: ["named-comment"] }], suggestions: [{ messageId: "unlabeled-photo", providerName: null }], imageKinds: { "unlabeled-photo": "PRODUCT_IMAGE" } }, "fake-mistral", 0));

  if (process.env.EVAL_DATABASE_URL) results.push(...await runBatchIntegration(process.env.EVAL_DATABASE_URL));

  if (!process.env.MISTRAL_API_KEY) return results;
  const live = new MistralBatchAnalyzer(new FetchMistralHttpClient(process.env.MISTRAL_API_KEY));
  const start = performance.now();
  try {
    const withOcr = await Promise.all(burstEvidence.map(async (item) => {
      if (item.type !== "IMAGE") return item;
      const bytes = new Uint8Array(await readFile(path.join(root, `${item.id}.png`)));
      return { ...item, ocrText: await live.readImage(bytes, "image/png") };
    }));
    const analysis = await live.analyze(withOcr);
    results.push(score("WB05-live-ocr-and-association", withOcr, analysis, { groups: goldGroups, imageKinds: goldImageKinds }, MISTRAL_TEXT_MODEL, Math.round(performance.now() - start)));
  } catch (error) {
    results.push({ caseId: "WB05-live-ocr-and-association", suite: "whatsapp-batches", status: "ERROR", correctFields: [], missingExpectedFields: [], wrongFields: [], hallucinatedFields: [], reviewExpected: [], reviewActual: [], reviewCorrect: null, latencyMs: Math.round(performance.now() - start), model: MISTRAL_TEXT_MODEL, metadata: { error: error instanceof Error ? error.message : "Unknown error" } });
  }
  return results;
}
