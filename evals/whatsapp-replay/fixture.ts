import { readFile, realpath } from "node:fs/promises";
import { resolve, dirname, relative } from "node:path";
import type { BurstCatalog, BurstEnvelope } from "../../lib/channels/whatsapp/burst-types.ts";
import type { VisualReading } from "../../lib/channels/whatsapp/ingestion-types.ts";
import type { ExtractionCandidate } from "../../lib/bot/types.ts";
export type ReplayMessage = { id: string; whatsappMessageId?: string; type: BurstEnvelope["type"]; timestamp: string; text?: string; asset?: string; mimeType?: string; quotedMessageId?: string; selectionId?: string; context?: Record<string, unknown>; priorOCR?: string; priorTranscript?: string; mock?: { vision?: VisualReading[]; ocr?: string; transcript?: string; extraction?: ExtractionCandidate; error?: "vision" | "ocr" } };
export type Expectation = { category: "extraction" | "association" | "write"; path: string; equals: unknown };
export type ReplayFixture = { version: 1; id: string; description: string; messages: ReplayMessage[]; catalog: BurstCatalog; agentMock?: Array<{ tool: string; args: Record<string, unknown> }>; expected?: Expectation[] };
export async function loadFixture(path: string): Promise<ReplayFixture> {
  const fixture = JSON.parse(await readFile(path, "utf8")) as ReplayFixture;
  if (fixture.version !== 1 || !fixture.id || !Array.isArray(fixture.messages) || !fixture.messages.length || !fixture.catalog?.trips?.length) throw new Error("Fixture v1 inválido o sin contexto autorizado");
  const ids = new Set<string>();
  for (const m of fixture.messages) {
    if (!m.id || ids.has(m.id) || !["TEXT", "IMAGE", "AUDIO", "DOCUMENT"].includes(m.type) || !Number.isFinite(Date.parse(m.timestamp))) throw new Error("Mensaje inválido, ID duplicado o timestamp inválido");
    ids.add(m.id);
    if (m.type !== "TEXT" && (!m.asset || !m.mimeType)) throw new Error("Media requiere asset y mimeType");
    if (m.asset) await fixtureAsset(path, m.asset);
  }
  for (const e of fixture.expected ?? []) if (!["extraction", "association", "write"].includes(e.category) || !e.path) throw new Error("Expectativa inválida");
  return fixture;
}
export async function fixtureAsset(fixturePath: string, asset: string) {
  const base = await realpath(dirname(resolve(fixturePath))); const target = await realpath(resolve(base, asset));
  if (relative(base, target).startsWith("..") || relative(base, target) === "") throw new Error("Asset debe permanecer dentro del directorio del fixture, sin symlink externo");
  return target;
}
