import { FetchMistralHttpClient, MISTRAL_TEXT_MODEL, type MistralHttpClient } from "../../bot/extraction/mistral-extraction-provider.ts";

export type WhatsAppTextIntent = "CAPTURE" | "GUIDANCE" | "LOOKUP";

export class MistralWhatsAppTextIntentClassifier {
  constructor(private readonly client: MistralHttpClient) {}

  async classify(text: string): Promise<WhatsAppTextIntent> {
    try {
      const response = await this.client.post("/chat/completions", {
        model: MISTRAL_TEXT_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Clasificá el mensaje de un viajero a Nihao. Respondé únicamente JSON con intent: CAPTURE, GUIDANCE o LOOKUP. CAPTURE: aporta información concreta para cargar un proveedor o producto (nombre, ubicación, contacto, precio FOB, MOQ, plazo, comentario o interés), incluso si incluye un saludo. LOOKUP: pide buscar, mostrar o consultar información ya guardada sobre proveedores; esos datos solo se consultan en la web. GUIDANCE: saludo, pregunta sobre qué puede hacer Nihao, pedido de ayuda, charla general o cualquier texto sin información concreta para cargar. Si hay duda sobre si contiene datos de un proveedor, elegí GUIDANCE para evitar borradores vacíos." },
          { role: "user", content: text.slice(0, 2000) },
        ],
      }, AbortSignal.timeout(10_000));
      const content = (response as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content;
      if (typeof content !== "string") return "GUIDANCE";
      const intent = (JSON.parse(content) as { intent?: unknown }).intent;
      return intent === "CAPTURE" || intent === "LOOKUP" ? intent : "GUIDANCE";
    } catch {
      return "GUIDANCE";
    }
  }
}

export function createWhatsAppTextIntentClassifier(): MistralWhatsAppTextIntentClassifier {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) throw new Error("MISTRAL_API_KEY no está configurada");
  return new MistralWhatsAppTextIntentClassifier(new FetchMistralHttpClient(key));
}
