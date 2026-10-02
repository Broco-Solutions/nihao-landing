import { readFile } from "node:fs/promises";
import { FetchMistralHttpClient, MISTRAL_TEXT_MODEL, MistralExtractionProvider, type MistralHttpClient } from "../../lib/bot/extraction/mistral-extraction-provider.ts";
import { SupplierExtractionService } from "../../lib/bot/extraction/service.ts";
import { MistralBatchAnalyzer } from "../../lib/channels/whatsapp/batch-association.ts";
import { BurstReader } from "../../lib/channels/whatsapp/burst-reader.ts";
import { MistralBurstInterpreter } from "../../lib/channels/whatsapp/burst-interpreter.ts";
import type { BurstMessage, BurstPlan, BurstSnapshot } from "../../lib/channels/whatsapp/burst-types.ts";
import { errorCase, scoreExtraction } from "../core/scoring.ts";
import type { EvalCase, FieldDelta } from "../core/types.ts";
import { PRODUCT_CASES, PRODUCT_CATALOG, type ProductEvalFixture } from "./cases.ts";

export function scoreProductPlan(fixture: ProductEvalFixture, snapshot: BurstSnapshot, plan: BurstPlan): Pick<EvalCase, "correctFields" | "wrongFields" | "missingExpectedFields"> {
  const correctFields: FieldDelta[] = []; const wrongFields: FieldDelta[] = []; const missingExpectedFields: FieldDelta[] = [];
  const check = (field: string, expected: unknown, actual: unknown) => (JSON.stringify(expected) === JSON.stringify(actual) ? correctFields : actual == null && expected != null ? missingExpectedFields : wrongFields).push({ field, expected, actual });
  check("groupCount", fixture.groups.length, plan.groups.length);
  check("question", fixture.question, Boolean(plan.question));
  const used = new Set<string>();
  for (const [index, expected] of fixture.groups.entries()) {
    const group = plan.groups.find((g) => !used.has(g.id) && (g.productName?.toLowerCase() ?? null) === expected.name?.toLowerCase());
    if (!group) { missingExpectedFields.push({ field: `product:${index}`, expected: expected.name, actual: null }); continue; }
    used.add(group.id);
    check(`kind:${index}`, "PRODUCT", group.kind);
    check(`supplier:${index}`, expected.supplierId, group.supplierId ?? null);
    if (expected.supplierId) {
      const supplier = (fixture.catalog ?? PRODUCT_CATALOG).trips.flatMap((t) => t.suppliers ?? []).find((s) => s.id === expected.supplierId)!;
      check(`company:${index}`, supplier.companyId, group.companyId);
      check(`certain:${index}`, true, group.certain);
    }
    if (expected.sources) {
      const sources = snapshot.messages.flatMap((m, i) => m.reading?.segments.some((s) => group.refs.includes(s.id)) ? [i + 1] : []);
      check(`sources:${index}`, expected.sources, sources);
    }
  }
  return { correctFields, wrongFields, missingExpectedFields };
}

export async function runWhatsAppProducts(): Promise<EvalCase[]> {
  if (!process.env.MISTRAL_API_KEY) throw new Error("MISTRAL_API_KEY is unavailable locally; this suite requires the real model");
  const results: EvalCase[] = [];
  for (const fixture of PRODUCT_CASES) {
    const start = performance.now(); const usage: unknown[] = []; const proposals: unknown[] = [];
    const delegate = new FetchMistralHttpClient(process.env.MISTRAL_API_KEY);
    const client: MistralHttpClient = { async post(endpoint, body, signal) {
      const response = await delegate.post(endpoint, body, signal);
      const record = response as { usage?: unknown; usage_info?: unknown };
      if (record.usage ?? record.usage_info) usage.push(record.usage ?? record.usage_info);
      const system = (body as { messages?: Array<{ content?: unknown }> }).messages?.[0]?.content;
      if (typeof system === "string" && system.startsWith("Sos el planificador")) proposals.push(response);
      return response;
    } };
    try {
      const analyzer = new MistralBatchAnalyzer(client);
      const provider = new MistralExtractionProvider({ client, businessCards: { async resolve() { throw new Error("Reads are cached by the production burst reader"); } } });
      const extraction = new SupplierExtractionService([provider]);
      const interpreter = new MistralBurstInterpreter(client);
      const objects = new Map<string, Uint8Array>();
      const reader = new BurstReader({ analyzer, extraction: provider, mistral: client,
        storage: { async put(input) { objects.set(input.key, input.body as Uint8Array); }, async get(key) { return objects.has(key) ? new Response(Uint8Array.from(objects.get(key)!)).body : null; }, async delete() {}, async signedUrl() { return "local-eval"; } },
        client: { async getMedia({ message }) { const index = Number(message.key.id.replace("m", "")) - 1; return { bytes: new Uint8Array(await readFile(fixture.messages[index].image!)), mimeType: "image/png" }; } },
        transcription: { async transcribe() { throw new Error("This suite uses literal transcripts, not real audio/Voxtral"); } },
      });
      const snapshot: BurstSnapshot = { id: fixture.caseId, instance: "eval", phone: "5491112345678", userId: "eval-user", revision: fixture.messages.length, status: "PROCESSING", leaseId: "eval-lease", state: { tripId: null, groups: [], question: null, controlIds: [], pendingRefs: [] }, messages: [] };
      for (const [index, input] of fixture.messages.entries()) {
        const id = `m${index + 1}`;
        const message: BurstMessage = { id, sequence: index + 1, sentAt: null, envelope: { instance: "eval", messageId: id, phone: snapshot.phone, type: input.type, text: input.type === "TEXT" ? input.text! : null, media: input.type === "IMAGE" ? { key: { id, remoteJid: `${snapshot.phone}@s.whatsapp.net`, fromMe: false }, message: { imageMessage: {} } } : null, sentAt: null }, reading: null };
        if (input.type === "AUDIO") {
          const segmented = await analyzer.segmentAudio(input.text!);
          message.reading = { complete: true, transcript: input.text, segmentationConfident: segmented.confident, segments: await Promise.all(segmented.segments.map(async (text, i) => ({ id: `${id}:${i + 1}`, text, candidate: await provider.extractReading(text, { type: "AUDIO_TRANSCRIPT", text }) }))) };
        } else message.reading = await reader.read(message, async (reading) => { message.reading = structuredClone(reading); });
        snapshot.messages.push(message);
      }
      const initial = await interpreter.interpret(snapshot, fixture.catalog ?? PRODUCT_CATALOG);
      let plan = initial;
      if (fixture.answer) {
        snapshot.state = initial;
        snapshot.revision++;
        const id = `m${snapshot.messages.length + 1}`;
        snapshot.messages.push({ id, sequence: snapshot.revision, sentAt: null, envelope: { instance: "eval", messageId: id, phone: snapshot.phone, type: "TEXT", text: fixture.answer, media: null, sentAt: null }, reading: { complete: true, segments: [{ id: `${id}:1`, text: fixture.answer, candidate: await provider.extractReading(fixture.answer, { type: "TEXT", text: fixture.answer }) }] } });
        plan = await interpreter.interpret(snapshot, fixture.catalog ?? PRODUCT_CATALOG);
      }
      const score = scoreProductPlan(fixture, snapshot, plan);
      const reviewExpected: string[] = []; const reviewActual: string[] = []; const hallucinatedFields: FieldDelta[] = [];
      for (const [index, expected] of fixture.groups.entries()) {
        const group = plan.groups.find((g) => g.productName?.toLowerCase() === expected.name?.toLowerCase());
        if (!group) continue;
        const candidates = snapshot.messages.flatMap((m) => m.reading?.segments.filter((s) => group.refs.includes(s.id)).flatMap((s) => s.candidate ? [s.candidate] : []) ?? []);
        if (!candidates.length) continue;
        const merged = extraction.mergeCandidates(candidates);
        const fields = scoreExtraction("whatsapp-products", { caseId: fixture.caseId, expected: expected.expected ?? {}, mustRemainMissing: expected.missing ?? [] }, merged.extractedFields, merged.reviewFields, 0, MISTRAL_TEXT_MODEL);
        score.correctFields.push(...fields.correctFields.map((d) => ({ ...d, field: `product${index}:${d.field}` })));
        score.wrongFields.push(...fields.wrongFields.map((d) => ({ ...d, field: `product${index}:${d.field}` })));
        score.missingExpectedFields.push(...fields.missingExpectedFields.map((d) => ({ ...d, field: `product${index}:${d.field}` })));
        hallucinatedFields.push(...fields.hallucinatedFields); reviewActual.push(...merged.reviewFields);
      }
      results.push({ caseId: fixture.caseId, suite: "whatsapp-products", status: score.wrongFields.length || score.missingExpectedFields.length || hallucinatedFields.length ? "FAIL" : "PASS", ...score, hallucinatedFields, reviewExpected, reviewActual, reviewCorrect: null, latencyMs: Math.round(performance.now() - start), model: MISTRAL_TEXT_MODEL, metadata: { usage, proposals, initialPlan: initial, plan, readings: snapshot.messages.map((m) => ({ id: m.id, type: m.envelope.type, reading: m.reading })), realModel: true, realOCR: fixture.messages.some((m) => m.type === "IMAGE"), transcription: "provided literal transcripts; no real audio", persistence: "no database writes" } });
    } catch (error) { const result = errorCase("whatsapp-products", fixture.caseId, error, Math.round(performance.now() - start), MISTRAL_TEXT_MODEL); result.metadata = { ...result.metadata, usage, proposals }; results.push(result); }
    console.log(`${fixture.caseId}: ${results.at(-1)!.status}`);
  }
  return results;
}
