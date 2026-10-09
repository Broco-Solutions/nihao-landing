import type { BurstEnvelope, BurstState } from "./burst-types.ts";
import type { AgentState } from "./agent-contract.ts";

const referenceText = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Named pending products can resume a suspended load; generic confirmations cannot. */
export function namesPendingProduct(envelope: BurstEnvelope, pending: AgentState["agent"]["pending"]): boolean {
  if (envelope.type !== "TEXT" || !pending?.products?.length) return false;
  if (/\b(?:nuevo|otro|otra) (?:producto|proveedor)\b|^(?:tengo|carg[aá]|agreg[aá])(?=\s|$|[.!?:])|\b(?:producto|proveedor)\s*:/iu.test(envelope.text ?? "")) return false;
  const text = ` ${referenceText(envelope.text ?? "")} `;
  return pending.products.some(product => {
    const name = referenceText(product.name);
    return name.length >= 3 && text.includes(` ${name} `);
  });
}

/** WAITING is a suspended workflow, not an inbox for independent uploads. */
export function answersPending(envelope: BurstEnvelope, state: BurstState, questionMessageIds: string[] = []): boolean {
  const pending = (state as Partial<AgentState>).agent?.pending;
  if (!pending && !state.question) return false;
  if (envelope.quotedMessageId && questionMessageIds.includes(envelope.quotedMessageId)) return true;
  if (envelope.type === "AUDIO") return pending?.type === "CLARIFICATION";
  if (envelope.type !== "TEXT") return false;
  const text = envelope.text?.trim() ?? "";
  if (envelope.selectionId && pending?.options.length) return true; // signed picker is validated by selectedSupplierNumber
  if (pending?.contextSelection && /^\d+\s*[;\n]/u.test(text)) return Boolean(pending.options[Number(text.split(/[;\n]/u)[0].trim()) - 1]);
  if (/^\d+$/u.test(text)) return Boolean(pending?.options[Number(text) - 1]);
  if (pending?.type === "CLARIFICATION" && !pending.contextSelection && pending.products?.length) {
    const clauses = text.split(/[;\n]/u).map(line => line.trim()).filter(Boolean);
    if (clauses.length && clauses.every(line => {
      const association = line.split(/\s*(?:→|->)\s*/u);
      return association.length === 2 && Boolean(association[1].trim()) && pending.products!.some(p => p.name.toLowerCase() === association[0].trim().toLowerCase());
    })) return true;
  }
  if (pending?.type === "APPROVAL") return /^(?:sí|si|confirmo|confirmar|aprobar|cancelar|cancelo|no)[.!]?$/iu.test(text);
  if (/^reintentar[.!]?$/iu.test(text)) return true;
  // Exact displayed option or an explicit reference; never guess a free-form upload's intent.
  if (pending?.options.some(o => o.label.trim().toLowerCase() === text.toLowerCase())) return true;
  if (/^\d+\s*[;\n]/u.test(text)) return false;
  if (pending?.products?.some(p => text.toLowerCase().startsWith(p.name.toLowerCase())) && /\b(?:moq|fob|usd|precio)\b/iu.test(text) && !/(?:→|->)/u.test(text)) return false;
  // A free answer belongs to the pending question unless it clearly starts another upload.
  if ((pending?.type === "CLARIFICATION" || !pending && Boolean(state.question)) && text && !/\b(?:nuevo|otro|otra) (?:producto|proveedor)\b|^(?:tengo|carg[aá]|agreg[aá])(?=\s|$|[.!?:])|\b(?:producto|proveedor)\s*:/iu.test(text)) return true;
  return /^(?:respuesta a (?:la |tu )?(?:pregunta|aclaración|aclaracion)|sobre (?:la |tu )?(?:pregunta|aclaración|aclaracion))\s*[:：]/iu.test(text);
}
