import type { AgentState } from "./agent-contract.ts";
import type { BurstSnapshot } from "./burst-types.ts";

export type DeterministicConversationIntent =
  | { kind: "PRESENCE"; reply: string }
  | { kind: "FOLLOW_UP" }
  | { kind: "OUT_OF_SCOPE"; reply: string }
  | { kind: "DO_NOT_STORE"; reply: string }
  | { kind: "CONTRADICTORY_CONTROL"; reply: string };

const normalize = (value: string) => value
  .normalize("NFD")
  .replace(/\p{M}/gu, "")
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim();

const lowInformation = new Set(["m", "mm", "mmm", "j", "f", "ch", "v", "cv", "con", "ok"]);

/**
 * Resolve only controls whose meaning is safe without an LLM. Everything else
 * continues through the semantic agent with its authorized context and tools.
 */
export function deterministicConversationIntent(value: string | null | undefined): DeterministicConversationIntent | null {
  const text = normalize(value ?? "");
  if (!text || lowInformation.has(text)) return null;

  if (/^(?:estas ahi|seguis ahi|seguis|hay alguien|me lees|me escuchas|estas disponible)$/u.test(text)) {
    return { kind: "PRESENCE", reply: "¡Sí, acá estoy! 👋 Decime cómo seguimos." };
  }

  if (/^(?:y|y que|que paso con lo anterior|que paso con eso)$/u.test(text)) return { kind: "FOLLOW_UP" };

  const tourismRequest = /\b(?:itinerario|turismo|turistico|turistica|vacaciones|hoteles?|actividades turisticas|lugares turisticos)\b/u.test(text)
    && /\b(?:china|beijing|pekin|shanghai|tren(?:es)?|hotel(?:es)?)\b/u.test(text);
  if (tourismRequest) {
    return {
      kind: "OUT_OF_SCOPE",
      reply: "Puedo ayudarte a registrar y consultar proveedores, productos y condiciones comerciales de tu viaje con Nihao. Para organizar turismo, hoteles o traslados, contactá al equipo de Nihao.",
    };
  }

  const refusesWrite = /\b(?:sin registrar|no (?:lo |la |los |las )?(?:guardes|registres|cargues)|no continues|no sigas|detene|pausa)\b/u.test(text);
  if (!refusesWrite) return null;
  const asksToContinue = /\b(?:avancemos|avanzamos|sigamos|continua|continuemos|segui|dale avanzamos|dale sigamos)\b/u.test(text);
  if (asksToContinue) {
    return {
      kind: "CONTRADICTORY_CONTROL",
      reply: "No registré información comercial de este mensaje porque contiene dos indicaciones distintas.\n\n*Decime cuál querés:*\n1. No registrar y pausar.\n2. Continuar con la carga.",
    };
  }
  return {
    kind: "DO_NOT_STORE",
    reply: "Entendido. No registré información comercial de este mensaje. Lo que ya estaba guardado se mantiene sin cambios.",
  };
}

export function pureDeterministicConversationIntent(snapshot: BurstSnapshot): { intent: DeterministicConversationIntent; messageIds: string[] } | null {
  const messages = snapshot.messages.filter((message) => message.sequence > (snapshot.state.evaluatedRevision ?? 0));
  if (!messages.length || messages.some((message) => message.envelope.type !== "TEXT" || message.envelope.quotedMessageId || message.envelope.selectionId)) return null;
  const meaningful = messages.filter((message) => !lowInformation.has(normalize(message.envelope.text ?? "")));
  if (meaningful.length !== 1) return null;
  const intent = deterministicConversationIntent(meaningful[0].envelope.text);
  return intent ? { intent, messageIds: messages.map((message) => message.id) } : null;
}

export function answerDeterministicConversationIntent(snapshot: BurstSnapshot, state: AgentState): { intent: DeterministicConversationIntent["kind"]; text: string } | null {
  const resolved = pureDeterministicConversationIntent(snapshot);
  if (!resolved) return null;
  const reply = resolved.intent.kind === "FOLLOW_UP"
    ? followUpReply(state)
    : resolved.intent.reply;
  state.controlIds = [...new Set([...state.controlIds, ...resolved.messageIds])];
  state.evaluatedRevision = snapshot.revision;
  state.agent.terminal = { revision: snapshot.revision, response: reply };
  state.agent.termination = { reason: state.question ? "asked_clarification" : "completed", revision: snapshot.revision, rounds: 0 };
  return { intent: resolved.intent.kind, text: reply };
}

function followUpReply(state: AgentState): string {
  if (state.agent.termination?.reason === "no_progress" || state.agent.termination?.reason === "model_error" || state.agent.termination?.reason === "tool_error") {
    return "La operación anterior no terminó. La información recibida se conserva y no generé registros nuevos por este mensaje. Si querés retomar ese procesamiento, respondé *REINTENTAR*. También podés hacer otra consulta.";
  }
  if (state.question) return `Lo anterior sigue esperando esta aclaración:\n\n${state.question}\n\nPodés responderla o hacer otra consulta.`;
  const unresolved = state.ingestion?.loads.filter((load) => !load.resolution && !["PROCESSED", "FAILED", "NEEDS_REVIEW"].includes(load.status)).length ?? 0;
  if (unresolved) return "Lo anterior sigue en procesamiento. La información recibida se conserva; te aviso cuando termine o si necesito una aclaración.";
  return "Estoy acá. No veo una solicitud anterior pendiente. Decime qué querés registrar o consultar.";
}

export function isIndependentConversationControl(value: string | null | undefined): boolean {
  return deterministicConversationIntent(value) !== null;
}

export function isConversationFollowUp(value: string | null | undefined): boolean {
  return deterministicConversationIntent(value)?.kind === "FOLLOW_UP";
}

export type CommercialWritePolicy = "ALLOW" | "DENY" | "CLARIFY";

/** Backend safety boundary for explicit negative instructions. The semantic
 * agent still interprets the rest of a mixed turn, but write tools stay closed
 * until a contradictory instruction is clarified. */
export function commercialWritePolicy(snapshot: BurstSnapshot): CommercialWritePolicy {
  const texts = snapshot.messages
    .filter((message) => message.envelope.type === "TEXT" && !snapshot.state.controlIds.includes(message.id))
    .map((message) => normalize(message.envelope.text ?? ""));
  const refusals = texts.filter((text) => /\b(?:sin registrar|no (?:lo |la |los |las |nada )?(?:guardes|registres|cargues)|no continues|no sigas|detene|pausa)\b/u.test(text));
  if (!refusals.length) return "ALLOW";
  return refusals.some((text) => /\b(?:avancemos|avanzamos|sigamos|continua|continuemos|segui|dale avanzamos|dale sigamos)\b/u.test(text)) ? "CLARIFY" : "DENY";
}
