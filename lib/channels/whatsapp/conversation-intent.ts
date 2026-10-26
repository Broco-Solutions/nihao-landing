import type { AgentState } from "./agent-contract.ts";
import { renderReviewRequiredOutcome } from "./traveler-response-policy.ts";
import type { BurstSnapshot } from "./burst-types.ts";
import { updateGraphSummary } from "./evidence-summary.ts";

export type DeterministicConversationIntent =
  | { kind: "PRESENCE"; reply: string }
  | { kind: "CAPABILITIES"; reply: string }
  | { kind: "FOLLOW_UP" }
  | { kind: "CANCEL_CLARIFICATION"; reply: string }
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

const capabilityReply = "Sí. Podés enviar texto, fotos, audios y documentos; fotos y audios se interpretan, y los documentos se conservan para revisión manual (PDF no tiene extracción automática). Los videos todavía no se procesan en este flujo. En Nihao, abrí tu viaje y la sección *Pendientes* para revisar la información que necesita atención.";
const capabilityQuestion = (text: string) => {
  const asksAboutUpload = /\b(?:podes|puedes|se puede|puedo|guardas|guardar|recibis|recibir|aceptas|aceptan|soportas|soportan|funciona|formatos?)\b/u.test(text);
  const mentionsDestination = /\b(?:web|webb|app|nihao|guardar|guardas|recibir|aceptar|soportar)\b/u.test(text);
  const mediaKinds = ["foto", "fotos", "imagen", "imagenes", "audio", "audios", "video", "videos", "documento", "documentos", "archivo", "archivos"];
  const mediaCount = mediaKinds.filter((word) => new RegExp(`\\b${word}\\b`, "u").test(text)).length;
  const commercial = /\b(?:proveedor|producto|fob|moq|usd|precio|cantidad|empresa|pedido|modelo)\b/u.test(text);
  return !commercial && (asksAboutUpload && mentionsDestination || mediaCount >= 2 && /\b(?:todo|tambien|acepta|soporta|web|guardar|guardar|formatos?)\b/u.test(text));
};

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

  if (capabilityQuestion(text)) return { kind: "CAPABILITIES", reply: capabilityReply };

  if (/^(?:y|y que|que paso con lo anterior|que paso con eso)$/u.test(text)) return { kind: "FOLLOW_UP" };

  if (/^(?:(?:no+\s+)?(?:no\s+)?nada\s+(?:olvidate|olvidalo|dejalo|dejemoslo)|(?:olvidate|olvidalo|dejalo|dejemoslo)(?:\s+por ahora)?|no importa|dejemos eso|cancel[aá] (?:eso|la aclaracion|la pregunta))$/u.test(text)) {
    return { kind: "CANCEL_CLARIFICATION", reply: "Entendido. Dejamos esa aclaración acá. La evidencia que ya enviaste se conserva para que puedas revisarla en la Web." };
  }

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
  if (!meaningful.length) return null;
  const intents = meaningful.map((message) => deterministicConversationIntent(message.envelope.text));
  const allCapabilities = intents.every((intent) => intent?.kind === "CAPABILITIES");
  if (allCapabilities) return { intent: intents[0]!, messageIds: messages.map((message) => message.id) };
  if (meaningful.length !== 1) return null;
  const intent = intents[0];
  return intent ? { intent, messageIds: messages.map((message) => message.id) } : null;
}

export function answerDeterministicConversationIntent(snapshot: BurstSnapshot, state: AgentState): { intent: DeterministicConversationIntent["kind"]; text: string } | null {
  const resolved = pureDeterministicConversationIntent(snapshot);
  if (!resolved) return null;
  let cancelledClarification = false;
  // A proposal is a persisted business operation. Let the approval tools cancel
  // it so its receipt and audit trail remain authoritative.
  if (resolved.intent.kind === "CANCEL_CLARIFICATION" && state.agent.pending?.type === "APPROVAL") return null;
  if (resolved.intent.kind === "CANCEL_CLARIFICATION" && (state.agent.pending?.type === "CLARIFICATION" || (!state.agent.pending && state.question))) {
    cancelledClarification = true;
    const loadId = state.agent.pending?.loadId ?? state.ingestion?.activeLoadId;
    const load = state.ingestion?.loads.find((candidate) => candidate.id === loadId);
    if (load && !["PROCESSED", "FAILED", "NEEDS_REVIEW"].includes(load.status)) {
      load.status = "NEEDS_REVIEW";
      load.question = undefined;
      load.questionText = null;
      load.reasons = [...new Set([...load.reasons, "TRAVELER_CANCELLED_CLARIFICATION"] )];
      load.error = undefined;
    }
    const graph = state.ingestion;
    if (graph && graph.activeLoadId === loadId) graph.activeLoadId = undefined;
    state.agent.pending = null;
    state.question = null;
    if (graph) updateGraphSummary(graph);
  }
  const reply = resolved.intent.kind === "FOLLOW_UP"
    ? followUpReply(snapshot, state)
    : resolved.intent.kind === "CANCEL_CLARIFICATION" && !cancelledClarification
      ? "Entendido, dejamos esto acá. No hice cambios ni inicié una carga nueva."
    : resolved.intent.reply;
  state.controlIds = [...new Set([...state.controlIds, ...resolved.messageIds])];
  state.evaluatedRevision = snapshot.revision;
  state.agent.terminal = { revision: snapshot.revision, response: reply };
  state.agent.termination = { reason: state.question ? "asked_clarification" : "completed", revision: snapshot.revision, rounds: 0 };
  return { intent: resolved.intent.kind, text: reply };
}


function followUpReply(snapshot: BurstSnapshot, state: AgentState): string {
  const termination = state.agent.termination;
  if (termination && ["no_progress", "max_rounds", "model_error", "tool_error"].includes(termination.reason)) {
    const recoveryInProgress = state.ingestion?.loads.some((load) => load.status === "PENDING_RETRY") ?? false;
    if (state.agent.pending?.terminalFailure || termination.reason === "no_progress" || termination.reason === "max_rounds"
      || termination.reason === "tool_error" && termination.failedTool === "finish_turn"
        && ["UNFINISHED_OPERATION", "UNVERIFIED_RESPONSE"].includes(termination.errorCode ?? "")
      || ["model_error", "tool_error"].includes(termination.reason) && !recoveryInProgress) {
      return renderReviewRequiredOutcome(state.agent.receipts, snapshot);
    }
    return "La operación anterior sigue en procesamiento automático. Conservé la información recibida; podés hacer otra consulta o revisar la carga en Nihao → tu viaje → Pendientes.";
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
