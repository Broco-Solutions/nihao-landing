import { FetchMistralHttpClient, MISTRAL_OCR_MODEL, MISTRAL_TEXT_MODEL, type MistralHttpClient } from "../../bot/extraction/mistral-extraction-provider.ts";

export type BatchEvidence = { id: string; type: "TEXT" | "IMAGE"; text: string | null; ocrText: string | null };
export type BatchGroup = { name: string; messageIds: string[] };
export type BatchSuggestion = { messageId: string; providerName: string | null; reason: string };
export type BatchAnalysis = {
  groups: BatchGroup[];
  suggestions: BatchSuggestion[];
  imageKinds: Record<string, "BUSINESS_CARD" | "PRODUCT_IMAGE">;
};

function normalized(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Model proposals must be supported by the actual message or OCR text before assignment. */
export function validateBatchAnalysis(value: unknown, evidence: BatchEvidence[]): BatchAnalysis {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Análisis de lote inválido");
  const raw = value as { groups?: unknown; suggestions?: unknown; imageKinds?: unknown };
  if (!Array.isArray(raw.groups) || !Array.isArray(raw.suggestions) || !raw.imageKinds || typeof raw.imageKinds !== "object") throw new Error("Análisis de lote incompleto");
  const byId = new Map(evidence.map((item) => [item.id, item]));
  const assigned = new Set<string>();
  const groups: BatchGroup[] = [];
  const suggestions: BatchSuggestion[] = [];
  for (const candidate of raw.groups) {
    if (!candidate || typeof candidate !== "object") continue;
    const group = candidate as { name?: unknown; messageIds?: unknown };
    if (typeof group.name !== "string" || !group.name.trim() || group.name.length > 120 || !Array.isArray(group.messageIds)) continue;
    const name = group.name.trim();
    const confirmed: string[] = [];
    for (const id of group.messageIds) {
      if (typeof id !== "string" || assigned.has(id)) continue;
      const item = byId.get(id);
      if (!item) continue;
      const source = normalized(item.type === "IMAGE" ? item.ocrText ?? "" : item.text ?? "");
      const label = normalized(name);
      if (label.length >= 3 && ` ${source} `.includes(` ${label} `)) {
        confirmed.push(id);
        assigned.add(id);
      } else {
        suggestions.push({ messageId: id, providerName: name, reason: "El proveedor no aparece explícitamente en esta evidencia" });
        assigned.add(id);
      }
    }
    if (confirmed.length) groups.push({ name, messageIds: confirmed });
  }
  for (const candidate of raw.suggestions) {
    if (!candidate || typeof candidate !== "object") continue;
    const item = candidate as { messageId?: unknown; providerName?: unknown; reason?: unknown };
    if (typeof item.messageId !== "string" || assigned.has(item.messageId) || !byId.has(item.messageId)) continue;
    suggestions.push({ messageId: item.messageId, providerName: typeof item.providerName === "string" ? item.providerName.slice(0, 120) : null, reason: typeof item.reason === "string" ? item.reason.slice(0, 200) : "Hace falta identificar el proveedor" });
    assigned.add(item.messageId);
  }
  for (const item of evidence) if (!assigned.has(item.id)) suggestions.push({ messageId: item.id, providerName: null, reason: "Hace falta identificar el proveedor" });
  const imageKinds: BatchAnalysis["imageKinds"] = {};
  for (const item of evidence) if (item.type === "IMAGE") imageKinds[item.id] = (raw.imageKinds as Record<string, unknown>)[item.id] === "BUSINESS_CARD" ? "BUSINESS_CARD" : "PRODUCT_IMAGE";
  return { groups, suggestions, imageKinds };
}

function responseText(response: unknown): string {
  const content = (response as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Mistral no devolvió un análisis de lote");
  return content;
}

export class MistralBatchAnalyzer {
  constructor(private readonly client: MistralHttpClient) {}

  async readImage(bytes: Uint8Array, mimeType: string): Promise<string> {
    const response = await this.client.post("/ocr", {
      model: MISTRAL_OCR_MODEL,
      document: { type: "image_url", image_url: `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}` },
    }, AbortSignal.timeout(20_000));
    const pages = (response as { pages?: Array<{ markdown?: string }> })?.pages;
    return Array.isArray(pages) ? pages.map((page) => page.markdown ?? "").join("\n").slice(0, 6000) : "";
  }

  async analyze(evidence: BatchEvidence[]): Promise<BatchAnalysis> {
    const response = await this.client.post("/chat/completions", {
      model: MISTRAL_TEXT_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Agrupá mensajes de WhatsApp por proveedor. Respondé JSON con groups:[{name,messageIds}], suggestions:[{messageId,providerName,reason}], imageKinds:{messageId:BUSINESS_CARD|PRODUCT_IMAGE}. Usá solo nombres explícitos en texto u OCR. Si la relación es dudosa, sugerila pero no la confirmes. Incluí cada mensaje una sola vez. Una tarjeta suele contener contacto, teléfono o email; otra foto es PRODUCT_IMAGE." },
        { role: "user", content: JSON.stringify(evidence.map((item) => ({ id: item.id, type: item.type, text: item.text, ocrText: item.ocrText }))) },
      ],
    }, AbortSignal.timeout(20_000));
    return validateBatchAnalysis(JSON.parse(responseText(response)), evidence);
  }
}

export function createMistralBatchAnalyzer(): MistralBatchAnalyzer {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) throw new Error("MISTRAL_API_KEY no está configurada");
  return new MistralBatchAnalyzer(new FetchMistralHttpClient(key));
}
