import { ValidationError } from "./validation.ts";

export const NOTES_MAX_LENGTH = 2048;
export function parseNotes(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.trim().length > NOTES_MAX_LENGTH) throw new ValidationError(`Notas inválidas: máximo ${NOTES_MAX_LENGTH} caracteres`);
  return value.trim() || null;
}
const clauses = (text: string) => text.split(/\n+|(?<=[.!?])\s+/u).map(s => s.trim()).filter(Boolean);
const identity = (text: string) => text.normalize("NFC").toLowerCase().replace(/[.!?]+$/u, "").replace(/\s+/gu, " ").trim();
/** Compose without paraphrasing, dropping prior facts or truncating overflow. null explicitly clears. */
export function mergeNotes(existing: string | null | undefined, incoming: unknown): string | null {
  const addition = parseNotes(incoming);
  if (addition === null) return null;
  const result = clauses(existing ?? "");
  const seen = new Set(result.map(identity));
  for (const clause of clauses(addition)) if (!seen.has(identity(clause))) { result.push(clause); seen.add(identity(clause)); }
  return parseNotes(result.join("\n"));
}

const proof = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
  .replace(/\b(?:este|esta|esto)\s+viene\s+en\b/gu, "disponible en")
  .replace(/\bviene\s+en\b/gu, "disponible en")
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/** Notes are excerpts from selected FACTS, not an alternative container for structured fields. */
export function assertGroundedNotes(value: unknown, facts: string[], structuredValues: string[] = []): string | null {
  const notes = parseNotes(value);
  if (!notes) return null;
  const known = new Set(structuredValues.map(proof).filter(Boolean));
  for (const clause of clauses(notes)) {
    if (/(?:\b(?:moq|fob|lead\s*time|email|e-mail|correo|telefono|whatsapp|wechat|fax|website|sitio web|pedido minimo)\b|@|https?:\/\/|\bwww\.|\b(?:plazo|precio|minimo)\s*[:=]?\s*\d)/iu.test(clause) || /^(?:\+|\(?\+)?[\d\s().-]{6,}$/u.test(clause.trim()) || known.has(proof(clause))) throw new ValidationError("Usá el campo estructurado correspondiente; no dupliques esos datos en notes");
    const literal = proof(clause);
    if (!literal || !facts.some(fact => ` ${proof(fact)} `.includes(` ${literal} `))) throw new ValidationError("Notas sin evidencia FACTS literal asociada; no inferir disponibilidad desde una foto");
  }
  return notes;
}
