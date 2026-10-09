import type { AgentQuestion } from "./agent-contract.ts";
import { orderedBurstMessages, type BurstMessage, type BurstSnapshot } from "./burst-types.ts";

const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const singular = (word: string) => word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word;
const words = (value: string) => normalize(value).split(" ").map(singular);
const ignored = new Set("el la los las de del un una producto productos proveedor proveedores co ltd limited company manufacturing factory".split(" ").map(singular));

/** Lexical aliases are not fuzzy identity: every requested word must match. */
export function matchesProductName(query: string, name: string): boolean {
  const tokens = words(query).filter(w => !ignored.has(w));
  const candidate = words(name);
  return tokens.length > 0 && tokens.every(w => candidate.includes(w));
}
export function mentionsProduct(text: string, name: string): boolean {
  const tokens = words(name).filter(w => !ignored.has(w));
  return Boolean(tokens.length && words(text).includes(tokens[0]));
}
/** Prefer distinguishing words when present; a category alone can have several matches. */
export function namedProductCandidates<T extends { name?: string | null }>(text: string, candidates: T[]): T[] {
  const full = candidates.filter(r => r.name && matchesProductName(r.name, text));
  return full.length ? full : candidates.filter(r => r.name && mentionsProduct(text, r.name));
}
export function questionOption(question: AgentQuestion, text: string) {
  if (/^\d+$/u.test(text.trim())) return question.options[Number(text.trim()) - 1];
  const exact = question.options.filter(o => normalize(o.label) === normalize(text));
  if (exact.length === 1) return exact[0];
  const tokens = words(text).filter(w => !ignored.has(w));
  if (tokens.length < 2) return undefined;
  const matches = question.options.filter(o => {
    const label = words(o.label);
    return tokens.every(w => label.includes(w) || w.length >= 5 && label.some(v => v.startsWith(w) && v.length - w.length <= 2));
  });
  return matches.length === 1 ? matches[0] : undefined;
}
/** Bind the actual answer; a later price or upload cannot replace it. */
export function questionAnswer(snapshot: BurstSnapshot, pending?: AgentQuestion | null): BurstMessage | undefined {
  if (!pending) return undefined;
  if (pending.answer) return snapshot.messages.find(m => m.id === pending.answer!.messageId);
  const replies = snapshot.state.outboundReplies?.filter(r => r.revision === pending.revision).map(r => r.messageId) ?? [];
  const eligible = orderedBurstMessages(snapshot).filter(m => m.sequence > pending.revision && (!m.envelope.quotedMessageId || replies.includes(m.envelope.quotedMessageId)));
  return eligible.find(m => m.envelope.type === "TEXT" && questionOption(pending, m.envelope.text ?? ""))
    ?? eligible.find(m => m.envelope.type === "TEXT" || m.envelope.type === "AUDIO");
}
export function selectedQuestionOption(snapshot: BurstSnapshot, pending?: AgentQuestion | null) {
  if (!pending) return undefined;
  if (pending.answer?.optionId) return pending.options.find(o => o.id === pending.answer!.optionId);
  const answer = questionAnswer(snapshot, pending);
  return answer && questionOption(pending, answer.envelope.text ?? answer.reading?.transcript ?? "");
}
export const explicitSupplierFacts = (text: string) => /\b(?:proveedor|empresa|fabrica(?:cion)? propia|exportan?|logo)\b/iu.test(normalize(text));
/** Only clear continuations bypass semantic interpretation; a new named item never does. */
export const simpleFollowup = (text: string) => /^(?:fob|moq|precio|plazo|lead\s*time|color(?:es)?|personalizable|customizable)\b/iu.test(text.trim()) && !/[?]|\b(?:nuevo|otro|otra|tambien fabrica|agrega|carga|producto)\b/iu.test(normalize(text));
