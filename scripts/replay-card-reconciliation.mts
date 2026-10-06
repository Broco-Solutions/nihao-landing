/** Replay the reader boundary using saved OCR/candidates/independent visions. No provider or DB writes. */
import { readFile, writeFile } from "node:fs/promises";
import { BurstReader } from "../lib/channels/whatsapp/burst-reader.ts";
import type { BurstMessage, BurstReading } from "../lib/channels/whatsapp/burst-types.ts";
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: replay-card-reconciliation.mts checkpoints.json report.json");
const rows = JSON.parse(await readFile(input, "utf8")) as Array<{ id: string; sequence: number; reading: BurstReading }>;
const cases = [];
for (const row of rows.filter(r => r.reading?.ingestion?.error?.type === "AMBIGUOUS_CARD_READING")) {
  const original = row.reading, saved = structuredClone(original), visions = saved.ingestion!.independentReadings!;
  if (!saved.ingestion?.ocrCandidate || !visions?.length || saved.ocr === undefined || !saved.storageKey) throw new Error(`Incomplete tape for message ${row.sequence}`);
  saved.complete = false; saved.segments = []; saved.ingestion.classification = visions[0]; saved.ingestion.independentReadings = [visions[0]];
  saved.ingestion.status = "OCR_COMPLETED"; delete saved.ingestion.error;
  let calls = 0;
  const reader = new BurstReader({ multimodal: true,
    storage: { async get() { return new Response(new Uint8Array([0xff,0xd8,0xff])).body; }, async put() { throw Error("unexpected download"); }, async delete() { throw Error("unexpected delete"); }, async signedUrl() { return "offline"; } },
    client: { async getMedia() { throw Error("unexpected download"); } },
    analyzer: { async readImage() { throw Error("unexpected OCR"); }, async segmentAudio() { throw Error("unexpected audio"); } },
    transcription: { async transcribe() { throw Error("unexpected transcription"); } },
    extraction: { async extractReading() { throw Error("unexpected extraction: checkpoint must be reused"); } },
    mistral: { async post() { if (++calls > 1 || !visions[1]) throw Error("missing second vision tape"); return { choices: [{ message: { content: JSON.stringify(visions[1]) } }] }; } },
  });
  const message: BurstMessage = { id: row.id, sequence: row.sequence, sentAt: null, envelope: { instance: "offline", messageId: row.id, phone: "offline", type: "IMAGE", text: null, media: null, sentAt: null }, reading: saved };
  const result = await reader.read(message, async () => {});
  const trace = result.ingestion!.reconciliation!;
  cases.push({ message: row.sequence, before: "AMBIGUOUS_CARD_READING", after: result.ingestion!.error?.type ?? result.ingestion!.status, secondVisionCalls: calls, first: trace.first, second: trace.second, visualUncertainty: result.ingestion!.classification!.card!.uncertainFields, secondVisualUncertainty: calls ? visions[1]?.card?.uncertainFields : undefined });
}
const report = { evidenceTotal: rows.length, beforeAmbiguous: cases.length, afterAmbiguous: cases.filter(c=>c.after === "AMBIGUOUS_CARD_READING").length, resolved: cases.filter(c=>c.after !== "AMBIGUOUS_CARD_READING"), remaining: cases.filter(c=>c.after === "AMBIGUOUS_CARD_READING") };
await writeFile(output, JSON.stringify(report,null,2), { mode: 0o600 });
console.log(JSON.stringify({ before: report.beforeAmbiguous, after: report.afterAmbiguous, resolved: report.resolved.map(c=>c.message), remaining: report.remaining.map(c=>({ message:c.message, conflicts:(c.second??c.first).disagreements, uncertain:c.visualUncertainty })) },null,2));
