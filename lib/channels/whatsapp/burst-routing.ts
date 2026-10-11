import type { BurstEnvelope, BurstState } from "./burst-types.ts";
import type { AgentState } from "./agent-contract.ts";
import { isIndependentConversationControl } from "./conversation-intent.ts";

const referenceText = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const LOW_INFORMATION = new Set(["m", "mm", "mmm", "j", "f", "ch", "v", "cv", "con", "ok"]);
export type PersistedCatalogQuery = "PRODUCTS" | "SUPPLIERS" | "SUMMARY";

/** Pure read intents can be answered from the authorized persisted catalog.
 * Keep this deliberately narrow: compound commands still belong to the agent. */
export function persistedCatalogQuery(value: string | null | undefined): PersistedCatalogQuery | null {
  const text = referenceText(value ?? "");
  if (!text) return null;
  if (/\b(?:y|tambien|ademas)\b.{0,80}\b(?:agrega|agregar|carga|cargar|registra|registrar|actualiza|actualizar|corrige|corregir|crea|crear|borra|borrar|elimina|eliminar)\b/u.test(text)) return null;
  const products = /^(?:(?:que|cuales|cuantos)\s+(?:son\s+)?(?:mis\s+|los\s+)?productos(?:\s+(?:que\s+)?(?:guarde|guardaste|tengo|tenes|cargue|cargaste|registre|registraste|hay|guardados|registrados|cargados))?|(?:mostrame|mostra|decime|lista|listame|ver)\s+(?:mis\s+|los\s+)?productos|(?:mis|los)\s+productos(?:\s+(?:guardados|registrados|cargados))?)\b/u.test(text);
  const suppliers = /^(?:(?:que|cuales|cuantos)\s+(?:son\s+)?(?:mis\s+|los\s+)?proveedores(?:\s+(?:que\s+)?(?:guarde|guardaste|tengo|tenes|cargue|cargaste|registre|registraste|hay|guardados|registrados|cargados))?|(?:mostrame|mostra|decime|lista|listame|ver)\s+(?:mis\s+|los\s+)?proveedores|(?:mis|los)\s+proveedores(?:\s+(?:guardados|registrados|cargados))?)\b/u.test(text);
  if (products && suppliers) return "SUMMARY";
  if (products) return "PRODUCTS";
  if (suppliers) return "SUPPLIERS";
  if (/^(?:(?:que|cuales|cuantos)\s+(?:cargaste|cargue|guarde|guardaste|registre|registraste|quedaron)|(?:cargaste|cargue|guarde|guardaste|registre|registraste)\s+(?:todo|algo)|(?:mostrame|mostra|decime|resumime|respondeme)\s+(?:todo|que|cuales|lo\s+(?:cargado|guardado|registrado)))\b/u.test(text)) return "SUMMARY";
  return null;
}

/** Queries about the persisted result are independent turns. They must never
 * become an answer to an unrelated, older clarification. */
export function isIndependentConversationQuery(value: string | null | undefined): boolean {
  const text = referenceText(value ?? "");
  if (!text) return false;
  return Boolean(persistedCatalogQuery(text)) || /^(?:(?:que|cuales|cuantos)\s+(?:faltan)|(?:que|cual)\s+(?:falta|quedo\s+pendiente)|estado\s+(?:de\s+)?(?:la\s+)?(?:carga|captura|procesamiento)|(?:decime|mostrame|indica(?:me)?)\s+(?:que\s+)?(?:evidencia|captura)s?\s+(?:esta|estan|sigue|siguen)\s+pendiente(?:s)?|(?:que\s+)?(?:evidencia|captura)s?\s+(?:esta|estan|sigue|siguen)\s+pendiente(?:s)?|que\s+falta\s+procesar)\b/u.test(text);
}

export function isIndependentConversationTurn(value: string | null | undefined): boolean {
  return isIndependentConversationQuery(value) || isIndependentConversationControl(value);
}

/** Fragments caused by typing, reconnection or accidental sends are preserved
 * in the new burst, but do not claim an older question by themselves. */
export function isLowInformationText(value: string | null | undefined): boolean {
  const text = referenceText(value ?? "");
  return !text || LOW_INFORMATION.has(text) || /^[a-z]$/u.test(text);
}

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
  // An unquoted voice note is a new piece of evidence. Treating every audio as
  // an answer made independent fair captures fall into old questions.
  if (envelope.type === "AUDIO") return false;
  if (envelope.type !== "TEXT") return false;
  const text = envelope.text?.trim() ?? "";
  if (pending?.terminalFailure) return /^reintentar[.!]?$/iu.test(text);
  if ((pending?.type === "CLARIFICATION" || (!pending && state.question)) && isIndependentConversationControl(text) && /^(?:(?:no+\s+)?(?:no\s+)?nada\s+(?:olvidate|olvidalo|dejalo|dejemoslo)|(?:olvidate|olvidalo|dejalo|dejemoslo)(?:\s+por ahora)?|no importa|dejemos eso|cancel[aá] (?:eso|la aclaracion|la pregunta))$/iu.test(text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim())) return true;
  if (isIndependentConversationTurn(text) || isLowInformationText(text)) return false;
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
  // Legacy questions predate structured reply metadata and keep their original
  // free-text behavior. Structured clarifications accept only concise answers;
  // a question or long new topic must start its own turn.
  const startsAnotherUpload = /\b(?:nuevo|otro|otra) (?:producto|proveedor)\b|^(?:tengo|carg[aá]|agreg[aá])(?=\s|$|[.!?:])|\b(?:producto|proveedor)\s*:/iu.test(text);
  if (!pending && state.question && text && !startsAnotherUpload) return true;
  if (pending?.type === "CLARIFICATION" && text && text.length <= 120 && !/[?¿]/u.test(text) && !startsAnotherUpload) return true;
  return /^(?:respuesta a (?:la |tu )?(?:pregunta|aclaración|aclaracion)|sobre (?:la |tu )?(?:pregunta|aclaración|aclaracion))\s*[:：]/iu.test(text);
}
