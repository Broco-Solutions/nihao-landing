import { normalizeLeadTimeToDays, parseLocalizedNumber } from "../tier1.ts";
import type { ExtractionCandidate, FieldEvidence, Tier1Data } from "../types.ts";
import type { ExtractionInput, SupplierExtractionAdapter } from "./contract.ts";

function evidence(field: FieldEvidence["field"], confidence: number, value: string): FieldEvidence {
  return { field, confidence, evidence: value };
}

export class DevelopmentTextExtractionAdapter implements SupplierExtractionAdapter {
  readonly name = "development-text-v1";

  supports(source: ExtractionInput["source"]): boolean {
    return source.type === "TEXT" && typeof source.text === "string";
  }

  async extract({ source }: ExtractionInput): Promise<ExtractionCandidate> {
    const text = source.text ?? "";
    const fields: Partial<Tier1Data> = {};
    const fieldEvidence: FieldEvidence[] = [];

    const company = text.match(/(?:se llama|empresa|compa(?:ñ|n)[ií]a)\s+([^,.]+?)(?=,|\.|\s+(?:FOB|precio|MOQ|m[ií]nimo|y tarda)\b)/i);
    if (company) {
      fields.companyName = company[1].trim();
      fieldEvidence.push(evidence("companyName", 0.88, company[0]));
    }

    if (/\bf[aá]brica\b/i.test(text)) {
      fields.supplierType = "FACTORY";
      fieldEvidence.push(evidence("supplierType", 0.96, "fábrica"));
    } else if (/\btrading\b|empresa comercial/i.test(text)) {
      fields.supplierType = "TRADING";
      fieldEvidence.push(evidence("supplierType", 0.94, "trading"));
    }

    const fobMatch = text.match(/\bFOB\s*(?:de|es|:)?\s*(\d+(?:[.,]\d+)?)\s*(USD|US\$|d[oó]lares?|euros?|EUR|yuan(?:es)?|CNY)?(?:\s+por\s+([^,.]+))?/i);
    if (fobMatch) {
      const currencyToken = fobMatch[2]?.toUpperCase() ?? "";
      const currency = /EUR|EURO/.test(currencyToken) ? "EUR" : /CNY|YUAN/.test(currencyToken) ? "CNY" : "USD";
      fields.fob = { amount: Number(fobMatch[1].replace(",", ".")), currency, unit: fobMatch[3]?.trim() || "unidad", rawText: fobMatch[0] };
      fieldEvidence.push(evidence("fob", 0.93, fobMatch[0]));
    }

    const moqMatch = text.match(/(?:\bMOQ\b|m[ií]nimo)\s*(?:de|es|:)?\s*(\d+)/i);
    if (moqMatch) {
      fields.moq = { quantity: Number(moqMatch[1]), unit: "unidades", notes: null, rawText: moqMatch[0] };
      fieldEvidence.push(evidence("moq", 0.92, moqMatch[0]));
    }

    const leadMatch = text.match(/(?:tarda|demora|lead\s*time(?:\s+de|\s*:)?)[^,.]*?((?:\d+|un(?:a|o)?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|quince|veinte|treinta)\s*(?:d[ií]as?|semanas?|mes(?:es)?|days?|weeks?|months?))/i);
    if (leadMatch) {
      fields.leadTime = { rawText: leadMatch[1], days: normalizeLeadTimeToDays(leadMatch[1]) };
      fieldEvidence.push(evidence("leadTime", 0.92, leadMatch[0]));
    }

    const interestMatch = text.match(/(?:inter[eé]s|score)\s*(?:de|es|:)?\s*([1-5])(?:\s*\/\s*5)?/i);
    if (interestMatch) {
      fields.interestScore = parseLocalizedNumber(interestMatch[1]);
      fieldEvidence.push(evidence("interestScore", 0.95, interestMatch[0]));
    }

    return {
      extractedFields: fields,
      reviewFields: fieldEvidence.filter((item) => item.confidence < 0.8).map((item) => item.field),
      evidence: fieldEvidence,
      rawSource: source,
    };
  }
}
