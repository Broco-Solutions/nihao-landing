import type { ExtractionInput, ExtractionProvider } from "./contract.ts";
import { parseSupplierExtractionStructuredOutput, SUPPLIER_EXTRACTION_JSON_SCHEMA, type SupplierExtractionStructuredOutput } from "./schema.ts";
import type { BusinessCardResolver } from "./storage-business-card-resolver.ts";
import type { ExtractionCandidate, FieldEvidence, RawSource, Tier1Data, Tier1Field } from "../types.ts";

const MISTRAL_API_URL = "https://api.mistral.ai/v1";
export const MISTRAL_OCR_MODEL = "mistral-ocr-4-1";
export const MISTRAL_TEXT_MODEL = "mistral-small-2603";
const BUSINESS_CARD_FIELDS = new Set<Tier1Field>(["companyName", "city", "province", "contact"]);

export type MistralHttpClient = {
  post(path: string, body: unknown, signal: AbortSignal): Promise<unknown>;
};

export class MistralExtractionError extends Error {}
export class MistralExtractionTimeoutError extends MistralExtractionError {}
export class MistralExtractionResponseError extends MistralExtractionError {}

export class FetchMistralHttpClient implements MistralHttpClient {
  constructor(private readonly apiKey: string, private readonly baseUrl = MISTRAL_API_URL) {}

  async post(path: string, body: unknown, signal: AbortSignal): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body), signal,
    });
    if (!response.ok) throw new MistralExtractionResponseError(`Mistral respondió HTTP ${response.status}`);
    try { return await response.json(); } catch { throw new MistralExtractionResponseError("Mistral no devolvió JSON"); }
  }
}

export type MistralExtractionProviderOptions = {
  client: MistralHttpClient;
  businessCards: BusinessCardResolver;
  timeoutMs?: number;
};

function sourceKey(source: RawSource): string {
  return source.type === "TEXT" ? `TEXT:${source.text ?? ""}` : `IMAGE_BUSINESS_CARD:${source.attachmentId ?? ""}`;
}

function stringContent(response: unknown, path: "chat" | "ocr"): string {
  const data = response as { choices?: Array<{ message?: { content?: unknown } }>; document_annotation?: unknown };
  const content = path === "chat" ? data?.choices?.[0]?.message?.content : data?.document_annotation;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => typeof part === "object" && part && "text" in part ? String((part as { text?: unknown }).text ?? "") : "").join("");
  throw new MistralExtractionResponseError("Mistral no devolvió contenido estructurado");
}

function parseModelOutput(response: unknown, path: "chat" | "ocr"): SupplierExtractionStructuredOutput {
  const content = stringContent(response, path);
  try { return parseSupplierExtractionStructuredOutput(JSON.parse(content)); }
  catch (error) {
    if (error instanceof MistralExtractionResponseError) throw error;
    throw new MistralExtractionResponseError(`Salida de Mistral inválida: ${error instanceof Error ? error.message : "JSON inválido"}`);
  }
}

function contactToTier1(contact: SupplierExtractionStructuredOutput["contact"]): string | null {
  const parts = [contact.name, contact.email, contact.phone, contact.wechat ? `WeChat: ${contact.wechat}` : null].filter((value): value is string => Boolean(value?.trim()));
  return parts.length ? parts.join(" · ") : null;
}

function hasValue(field: Tier1Field, fields: Partial<Tier1Data>): boolean {
  const value = fields[field];
  return value !== null && value !== undefined && value !== "" && value !== "UNKNOWN";
}

function toCandidate(output: SupplierExtractionStructuredOutput, source: RawSource): ExtractionCandidate {
  const allowed = source.type === "IMAGE_BUSINESS_CARD" ? BUSINESS_CARD_FIELDS : undefined;
  const allFields: Partial<Tier1Data> = {
    companyName: output.companyName, city: output.city, province: output.province, contact: contactToTier1(output.contact),
    supplierType: output.supplierType, fob: output.fob, moq: output.moq, leadTime: output.leadTime,
    category: output.category, interestScore: output.interestScore,
  };
  const evidenceByField = new Map<Tier1Field, FieldEvidence[]>();
  for (const evidence of output.evidence) {
    if (!allowed || allowed.has(evidence.field)) evidenceByField.set(evidence.field, [...(evidenceByField.get(evidence.field) ?? []), evidence]);
  }
  const extractedFields: Partial<Tier1Data> = {};
  const reviewFields = new Set<Tier1Field>();
  for (const field of output.detectedFields) {
    if (allowed && !allowed.has(field)) continue;
    // A detected value without source evidence is deliberately withheld.
    if (hasValue(field, allFields) && evidenceByField.has(field)) extractedFields[field] = allFields[field] as never;
    else reviewFields.add(field);
  }
  for (const field of output.reviewFields) if (!allowed || allowed.has(field)) reviewFields.add(field);
  return { rawSource: source, extractedFields, reviewFields: [...reviewFields], evidence: [...evidenceByField.values()].flat() };
}

export class MistralExtractionProvider implements ExtractionProvider {
  readonly name = "mistral";
  private readonly pending = new Map<string, Promise<ExtractionCandidate>>();
  private readonly timeoutMs: number;

  constructor(private readonly options: MistralExtractionProviderOptions) {
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  supports(source: RawSource): boolean {
    return source.type === "TEXT" || source.type === "IMAGE_BUSINESS_CARD";
  }

  async extract(input: ExtractionInput): Promise<ExtractionCandidate> {
    if (!this.supports(input.source)) throw new MistralExtractionError("Esta fuente no está soportada por Mistral");
    const key = sourceKey(input.source);
    const existing = this.pending.get(key);
    if (existing) return existing;
    const task = this.extractFresh(input);
    this.pending.set(key, task);
    try { return await task; } finally { if (this.pending.get(key) === task) this.pending.delete(key); }
  }

  private async request(path: string, body: unknown): Promise<unknown> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new MistralExtractionTimeoutError("Mistral tardó demasiado en responder")); }, this.timeoutMs); });
    try { return await Promise.race([this.options.client.post(path, body, controller.signal), timeout]); }
    catch (error) {
      if (controller.signal.aborted && !(error instanceof MistralExtractionTimeoutError)) throw new MistralExtractionTimeoutError("Mistral tardó demasiado en responder");
      throw error;
    } finally { if (timer) clearTimeout(timer); }
  }

  private async extractFresh({ source }: ExtractionInput): Promise<ExtractionCandidate> {
    if (source.type === "TEXT") {
      if (!source.text?.trim()) throw new MistralExtractionError("No hay texto para extraer");
      const response = await this.request("/chat/completions", {
        model: MISTRAL_TEXT_MODEL,
        response_format: { type: "json_schema", json_schema: SUPPLIER_EXTRACTION_JSON_SCHEMA },
        messages: [{ role: "system", content: "Extraé sólo datos explícitos. Nunca inferir ni completar. Si una evidencia no es suficiente, usar reviewFields o missingFields." }, { role: "user", content: source.text }],
        temperature: 0,
      });
      return toCandidate(parseModelOutput(response, "chat"), source);
    }
    const attachmentId = source.attachmentId;
    if (!attachmentId) throw new MistralExtractionError("Falta el adjunto de business card");
    const card = await this.options.businessCards.resolve(attachmentId);
    const base64 = Buffer.from(card.bytes).toString("base64");
    const response = await this.request("/ocr", {
      model: MISTRAL_OCR_MODEL,
      document: { type: "image_url", image_url: `data:${card.mimeType};base64,${base64}` },
      document_annotation_format: { type: "json_schema", json_schema: SUPPLIER_EXTRACTION_JSON_SCHEMA },
      document_annotation_prompt: "Extraé sólo companyName, contact (name, email, phone, wechat), city y province que estén visibles. No infieras otros campos; marcá review o missing cuando no haya evidencia suficiente.",
    });
    return toCandidate(parseModelOutput(response, "ocr"), source);
  }
}

/** Creates the single Mistral provider at server composition time. */
export function createMistralExtractionProviderFromEnvironment(options: Omit<MistralExtractionProviderOptions, "client"> & { apiKey?: string } ): MistralExtractionProvider {
  const apiKey = options.apiKey ?? process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new MistralExtractionError("Falta configurar MISTRAL_API_KEY");
  return new MistralExtractionProvider({ ...options, client: new FetchMistralHttpClient(apiKey) });
}
