import { questionAnswer, selectedQuestionOption } from "./followup-resolution.ts";
import { answersPending } from "./burst-routing.ts";
import { resolveConversationSupplier } from "./conversation-association.ts";
import { observedProduct } from "./product-observation.ts";
import { orderedBurstMessages } from "./burst-types.ts";
import { createHash } from "node:crypto";
import type { BurstMessage, BurstSnapshot } from "./burst-types.ts";
import type { AgentReceipt, AgentState, AgentWrite } from "./agent-contract.ts";
import { AgentToolError } from "./agent-contract.ts";
import { compareNames } from "./card-reconciliation.ts";
import { isSupplierConfirmable } from "../../bot/record-completeness.ts";
import type { EvidenceGraph, LogicalLoad, CardReading } from "./ingestion-types.ts";

export const normalizedReference = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const assetText = (message: BurstMessage) => message.reading?.ingestion?.trustedText ?? (message.envelope.type === "AUDIO" ? message.reading?.transcript ?? "" : message.envelope.type === "IMAGE" ? [message.reading?.ocr, message.envelope.text].filter(Boolean).join("\n") : message.envelope.text ?? "");
const stableId = (snapshot: BurstSnapshot, assetId: string) => `waload_${createHash("sha256").update(`${snapshot.id}:${assetId}`).digest("hex").slice(0, 32)}`;
const domain = (value: string) => { try { return new URL(/^https?:\/\//iu.test(value) ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./u, ""); } catch { return ""; } };
const domains = (card: CardReading) => [...card.websites.map(domain), ...card.emails.map((v) => v.split("@")[1]?.toLowerCase())].filter((v) => v && !["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "qq.com", "163.com"].includes(v));
export function cardRelationship(a: BurstMessage, b: BurstMessage): string[] {
  const va = a.reading?.ingestion?.classification; const vb = b.reading?.ingestion?.classification;
  const ca = va?.card; const cb = vb?.card;
  if (!va || !vb || !ca || !cb || va.side === vb.side && va.side !== "UNKNOWN_SIDE") return [];
  if (ca.companyName && cb.companyName && normalizedReference(ca.companyName) !== normalizedReference(cb.companyName)) return [];
  const reasons: string[] = [];
  if (ca.companyName && cb.companyName && normalizedReference(ca.companyName) === normalizedReference(cb.companyName)) reasons.push("SAME_COMPANY");
  if (domains(ca).some((v) => domains(cb).includes(v))) reasons.push("SAME_DOMAIN");
  if (ca.phones.some((v) => cb.phones.some((w) => v.replace(/\D/gu, "") === w.replace(/\D/gu, ""))) || ca.emails.some((v) => cb.emails.some((w) => v.toLowerCase() === w.toLowerCase()))) reasons.push("SAME_CONTACT");
  const complementary = [va.side, vb.side].includes("FRONT") && [va.side, vb.side].includes("BACK");
  if (!reasons.length || !complementary && !reasons.includes("SAME_CONTACT") && reasons.length < 2) return [];
  if (complementary) reasons.push("COMPLEMENTARY_SIDES");
  return reasons;
}
/** Trade name/legal name is a clarification candidate, never permission to merge. */
export function cardAliasCandidate(a: BurstMessage, b: BurstMessage): boolean {
  const va = a.reading?.ingestion?.classification, vb = b.reading?.ingestion?.classification;
  const ca = va?.card, cb = vb?.card;
  if (!ca || !cb || va?.side !== "FRONT" || vb?.side === "FRONT" || !ca.companyName || !cb.companyName || compareNames(ca.companyName, cb.companyName) !== "NAME_CONFLICT") return false;
  const samePerson = ca.personName && cb.personName && compareNames(ca.personName, cb.personName) !== "NAME_CONFLICT";
  const branding = (text: string | null) => normalizedReference(text ?? "").split(" ").filter(v => v.length >= 3 && !/^(?:logo|marca|branding|empresa|company|texto|text|azul|blue|blanco|white|negro|black|casa|house|diseño|design)$/u.test(v));
  return Boolean(samePerson && branding(ca.branding).some(v => branding(cb.branding).includes(v)));
}
function mentions(text: string, name: string | null) {
  if (!name) return false;
  const full = normalizedReference(name); const alias = full.split(" ")[0]; const literal = ` ${normalizedReference(text)} `;
  return literal.includes(` ${full} `) || alias.length >= 3 && !["china", "shenzhen", "trading", "company", "tools"].includes(alias) && literal.includes(` ${alias} `);
}
const stopWords = new Set("de del el la los las un una unos unas con sin para por en al este esta estos estas producto productos transparente negro negra blanco blanca azul rojo roja vidrio plastico metal madera visible imagen foto packaging caja contiene tiene proveedor proveedores precio usd fob moq dias entrega plazo vale cuesta es y a".split(" "));
function productTokens(load: LogicalLoad, snapshot: BurstSnapshot) {
  return [...new Set(load.assetIds.flatMap((id) => { const p = snapshot.messages.find((m) => m.id === id)?.reading?.ingestion?.classification?.product; return [p?.description, p?.brand, p?.model, ...(p?.visibleText ?? [])].filter(Boolean).join(" ").split(/\s+/u); }).map(normalizedReference).filter((v) => v.length >= 3 && !stopWords.has(v) && !/^\d+$/u.test(v)))];
}
export function updateGraphSummary(graph: EvidenceGraph) {
  for (const asset of graph.assets) {
    const loads = graph.loads.filter((load) => asset.loadIds.includes(load.id));
    if (loads.some((load) => load.status === "PENDING_RETRY")) asset.status = "PENDING_RETRY";
    else if (loads.some((load) => load.status === "FAILED")) asset.status = "FAILED";
    else if (loads.some((load) => load.status === "NEEDS_REVIEW")) asset.status = "NEEDS_REVIEW";
    else if (loads.length && loads.every((load) => load.status === "PROCESSED")) asset.status = "PROCESSED";
    else if (loads.length) asset.status = "GROUPED";
    asset.resolution = loads.find(load => load.resolution)?.resolution;
    asset.error = loads.find((load) => load.error)?.error;
  }
  const actionable = graph.loads.filter(l => !l.resolution);
  graph.summary = { resolvedHistorical: graph.loads.filter(l => l.resolution).length, totalAssets: graph.assets.length, totalLogicalLoads: graph.loads.length, processed: actionable.filter((l) => l.status === "PROCESSED").length, pending: actionable.filter((l) => !["PROCESSED", "NEEDS_REVIEW", "FAILED"].includes(l.status)).length, needsReview: actionable.filter((l) => l.status === "NEEDS_REVIEW").length, failed: actionable.filter((l) => l.status === "FAILED").length };
}
export function buildEvidenceGraph(snapshot: BurstSnapshot): EvidenceGraph {
  const previous = snapshot.state.ingestion;
  const graph: EvidenceGraph = { version: 1, revision: snapshot.revision, groupingAttempts: [], associationAttempts: [], assets: [], loads: [], links: [], derivations: [], summary: { totalAssets: 0, totalLogicalLoads: 0, processed: 0, pending: 0, needsReview: 0, failed: 0 } };
  const pending = (snapshot.state as Partial<AgentState>).agent?.pending;
  const answer = questionAnswer(snapshot, pending);
  const option = selectedQuestionOption(snapshot, pending);
  const questionReply = (m: BurstMessage) => !m.envelope.quotedMessageId || Boolean(snapshot.state.outboundReplies?.some(r => r.revision === pending?.revision && r.messageId === m.envelope.quotedMessageId));
  const loadFor = new Map<string, LogicalLoad>();
  const addLoad = (message: BurstMessage, type: LogicalLoad["type"], name: string | null, identity = message.id) => {
    const old = previous?.loads.find((l) => l.id === stableId(snapshot, identity));
    const parent = previous?.loads.find((load) => load.assetIds.includes(message.id));
    const pendingLoadId = (snapshot.state as Partial<AgentState>).agent?.pending?.loadId;
    const answeredBusinessQuestion = parent?.question && (!pendingLoadId || pendingLoadId === parent.id) && snapshot.messages.some((m) => m.sequence > parent.question!.revision && m.envelope.type === "TEXT" && questionReply(m));
    if (answeredBusinessQuestion && message.reading?.ingestion?.error?.stage === "business") { message.reading.ingestion.status = "PARSED"; message.reading.ingestion.error = undefined; }
    const status = old?.status === "PROCESSED" ? "PROCESSED" : ["FAILED", "NEEDS_REVIEW"].includes(message.reading?.ingestion?.status ?? "") ? message.reading!.ingestion!.status : old?.status === "PENDING_RETRY" ? "PENDING_RETRY" : "GROUPED";
    const load: LogicalLoad = { id: old?.id ?? stableId(snapshot, identity), operational: old?.operational, resolution: parent?.resolution ?? old?.resolution, resourceId: old?.resourceId, execution: old?.execution, type, assetIds: [message.id], name, status, reasons: [], error: message.reading?.ingestion?.error ?? old?.error, ...(old?.question ? { question: old.question, questionText: old.questionText } : {}) };
    graph.loads.push(load); if (!loadFor.has(message.id)) loadFor.set(message.id, load);
    if (message.envelope.type !== "IMAGE") graph.links.push({ sourceAssetId: message.id, targetLoadId: load.id, relationship: "FACTS_FOR", confidence: ["FAILED", "NEEDS_REVIEW"].includes(status) ? "AMBIGUOUS" : "HIGH", reasons: ["INDEPENDENT_TEXT_OR_AUDIO"], candidateTargets: [load.id] });
    return load;
  };
  const images = orderedBurstMessages(snapshot).filter((m) => m.envelope.type === "IMAGE");
  for (const image of images) {
    const v = image.reading?.ingestion?.classification;
    if (image.id === pending?.associationSource?.assetId && option && image.reading?.ingestion?.error?.type === "AMBIGUOUS_CARD_RELATIONSHIP") {
      image.reading.ingestion.status = "PARSED"; image.reading.ingestion.error = undefined;
    }
    addLoad(image, v?.type === "BUSINESS_CARD" ? "SUPPLIER" : v?.type === "PRODUCT" ? "PRODUCT" : "EVIDENCE", v?.card?.companyName ?? observedProduct(image)?.name ?? null);
  }
  const allCards = images.filter(m => m.reading?.ingestion?.classification?.type === "BUSINESS_CARD" && loadFor.get(m.id)!.status !== "FAILED" && !loadFor.get(m.id)!.resolution);
  const cards = allCards.filter(m => loadFor.get(m.id)!.status !== "NEEDS_REVIEW");
  for (const back of allCards.filter((m) => m.reading?.ingestion?.classification?.side !== "FRONT")) {
    const suspected = allCards.filter(front => front.id !== back.id && cardAliasCandidate(front, back));
    let candidates = loadFor.get(back.id)!.status === "NEEDS_REVIEW" ? [] : cards.filter((m) => m.id !== back.id && m.reading?.ingestion?.classification?.side === "FRONT" && (!loadFor.get(back.id)!.resourceId || !loadFor.get(m.id)!.resourceId || loadFor.get(back.id)!.resourceId === loadFor.get(m.id)!.resourceId) && !loadFor.get(m.id)!.error && cardRelationship(m, back).length);
    const selectedFront = back.id === pending?.associationSource?.assetId ? candidates.find((m) => loadFor.get(m.id)?.id === option?.id || answer && normalizedReference(answer.envelope.text ?? "") === normalizedReference(loadFor.get(m.id)?.name ?? "")) : undefined;
    const previousFront = previous?.loads.find((l) => l.assetIds.includes(back.id) && l.reasons.includes("CLARIFICATION_ANSWER"));
    const rememberedFront = previousFront && candidates.find((m) => loadFor.get(m.id)?.id === previousFront.id);
    if (selectedFront || rememberedFront) candidates = [selectedFront ?? rememberedFront!];
    for (const front of allCards.filter((m) => m.id !== back.id && m.reading?.ingestion?.classification?.side === "FRONT")) {
      const a = front.reading!.ingestion!.classification!.card!; const b = back.reading!.ingestion!.classification!.card!;
      const equal = (x: string | null, y: string | null) => Boolean(x && y && normalizedReference(x) === normalizedReference(y));
      graph.groupingAttempts!.push({ assetA: front.id, assetB: back.id, signals: { sameCompany: equal(a.companyName, b.companyName), sameDomain: domains(a).some((v) => domains(b).includes(v)), samePerson: Boolean(a.personName && b.personName && compareNames(a.personName, b.personName) !== "NAME_CONFLICT"), samePhone: a.phones.some((v) => b.phones.some((w) => v.replace(/\D/gu, "") === w.replace(/\D/gu, ""))), sameEmail: a.emails.some((v) => b.emails.some((w) => v.toLowerCase() === w.toLowerCase())), visualBranding: suspected.includes(front) || equal(a.branding, b.branding), complementarySide: back.reading!.ingestion!.classification!.side === "BACK", sequenceDistance: Math.abs(front.sequence - back.sequence) }, reasons: suspected.includes(front) ? ["TRADE_NAME_LEGAL_NAME_CANDIDATE", "SAME_PERSON", "SHARED_BRANDING", "IDENTITY_REQUIRES_CLARIFICATION"] : cardRelationship(front, back), decision: suspected.includes(front) ? "AMBIGUOUS" : candidates.some((m) => m.id === front.id) ? candidates.length === 1 ? "GROUP" : "AMBIGUOUS" : "DO_NOT_GROUP" });
    }
    if (suspected.length) {
      const load = loadFor.get(back.id)!;
      load.status = "NEEDS_REVIEW"; load.error ??= { type: "AMBIGUOUS_CARD_RELATIONSHIP", retryable: false, stage: "grouping" };
      graph.links.push({ sourceAssetId: back.id, relationship: "POSSIBLY_RELATED", confidence: "AMBIGUOUS", reasons: ["TRADE_NAME_LEGAL_NAME_CANDIDATE"], candidateTargets: [...new Set([...suspected, ...candidates].map(m => loadFor.get(m.id)!.id))] });
    } else if (candidates.length === 1) {
      const front = candidates[0]; const from = loadFor.get(back.id)!; const target = loadFor.get(front.id)!;
      if (from !== target) {
        target.assetIds.push(back.id);
        if (target.status === "PROCESSED" && !previous?.loads.find((l) => l.id === target.id)?.assetIds.includes(back.id)) target.status = "GROUPED";
        target.reasons = [...new Set([...target.reasons, ...cardRelationship(front, back)])];
        if (selectedFront || rememberedFront) target.reasons.push("CLARIFICATION_ANSWER");
        target.name ??= from.name; graph.loads = graph.loads.filter((l) => l !== from); loadFor.set(back.id, target);
      }
    } else if (candidates.length > 1) {
      const load = loadFor.get(back.id)!; load.status = "NEEDS_REVIEW"; load.error = { type: "AMBIGUOUS_CARD_RELATIONSHIP", retryable: false, stage: "grouping" };
      graph.links.push({ sourceAssetId: back.id, relationship: "POSSIBLY_RELATED", confidence: "AMBIGUOUS", reasons: ["MULTIPLE_CARD_FRONTS"], candidateTargets: candidates.map((m) => loadFor.get(m.id)!.id) });
    }
  }
  for (const load of graph.loads.filter(l => l.type === "SUPPLIER" && l.status === "GROUPED" && !l.resolution)) {
    const readings = images.filter(m => load.assetIds.includes(m.id)).flatMap(m => m.reading?.ingestion?.classification?.card ?? []);
    if (!readings.some(c => c.companyName) && !isSupplierConfirmable({ name: readings.find(c => c.companyName)?.companyName, contacts: readings.flatMap(c => [...c.emails.map(rawText => ({ type: "EMAIL", rawText })), ...c.phones.map(rawText => ({ type: "PHONE", rawText }))]) })) {
      load.status = "NEEDS_REVIEW";
      load.error = { type: "SUPPLIER_INCOMPLETE", stage: "completeness", retryable: false };
      load.reasons.push("READABLE_BUT_INCOMPLETE");
    }
  }
  for (const image of images) {
    const v = image.reading?.ingestion?.classification; const load = loadFor.get(image.id)!;
    graph.links.push({ sourceAssetId: image.id, targetLoadId: load.id, relationship: v?.type === "PRODUCT" ? "IMAGE_OF" : v?.side === "BACK" ? "BACK_OF" : v?.type === "BUSINESS_CARD" && v.side === "FRONT" ? "FRONT_OF" : "FACTS_FOR", confidence: load.status === "NEEDS_REVIEW" || load.status === "FAILED" ? "AMBIGUOUS" : "HIGH", reasons: load.reasons.length ? load.reasons : ["CLASSIFIED_ASSET"], candidateTargets: [load.id] });
    if (image.reading?.ocr !== undefined) graph.derivations.push({ id: `${image.id}:ocr`, type: "OCR", sourceAssetId: image.id, relationship: "DERIVED_FROM" });
  }
  // Disputed card fields do not make the user's nearest-card reference ambiguous.
  // Keep identity reconciliation separate from attaching literal notes to that card's record.
  const targets = graph.loads.filter((l) => ["SUPPLIER", "PRODUCT"].includes(l.type) && (!["FAILED", "NEEDS_REVIEW"].includes(l.status) || l.type === "SUPPLIER" && l.error?.type === "AMBIGUOUS_CARD_READING"));
  for (const message of orderedBurstMessages(snapshot).filter((m) => m.envelope.type !== "IMAGE")) {
    if (message.reading?.ingestion?.status === "FAILED" || message.reading?.ingestion?.status === "NEEDS_REVIEW" && message.reading.ingestion.error?.stage !== "association") { addLoad(message, "EVIDENCE", null); continue; }
    const segments = message.reading?.segments.length ? message.reading.segments : [{ id: `${message.id}:1`, text: assetText(message) }];
    for (const segment of segments) {
      const text = segment.text;
      if (!text.trim() || /^(?:listo|reintentar)[.!]?$/iu.test(text.trim())) continue;
      if (message.id === answer?.id && option) { graph.links.push({ sourceAssetId: message.id, sourceSegmentId: segment.id, targetLoadId: option.id, relationship: "CONTEXT_FOR", confidence: "HIGH", reasons: ["CLARIFICATION_ANSWER"], candidateTargets: [option.id] }); continue; }
      const answeringLoad = pending?.type === "CLARIFICATION" && pending.loadId && !pending.contextSelection && !pending.supplierPicker && message.sequence > pending.revision && questionReply(message) && answersPending(message.envelope, snapshot.state)
        ? targets.find(load => load.id === pending.loadId && load.type === "PRODUCT" && !load.resourceId) : undefined;
      const selected = answeringLoad ?? (pending?.associationSource?.assetId === message.id && (!pending.associationSource.segmentId || pending.associationSource.segmentId === segment.id) ? targets.find((l) => l.id === option?.id || answer && normalizedReference(answer.envelope.text ?? "") === normalizedReference(l.name ?? "")) : undefined);
      const oldLink = previous?.links.find((l) => l.sourceAssetId === message.id && l.sourceSegmentId === segment.id && l.reasons.includes("CLARIFICATION_ANSWER") && targets.some((t) => t.id === l.targetLoadId));
      let candidates = selected ? [selected] : oldLink ? targets.filter((l) => l.id === oldLink.targetLoadId) : targets.filter((l) => mentions(text, l.name) && l.type === "SUPPLIER");
      let reason = selected || oldLink ? "CLARIFICATION_ANSWER" : "EXPLICIT_SUPPLIER_NAME";
      const explicitProducts = targets.filter((l) => l.type === "PRODUCT" && (mentions(text, l.name) || productTokens(l, snapshot).some((token) => ` ${normalizedReference(text)} `.includes(` ${token} `))));
      if (!selected && !oldLink && explicitProducts.length) { candidates = explicitProducts; reason = "VISUAL_PRODUCT_REFERENCE"; }
      if (!candidates.length) {
        const kind = /\b(?:este|ese|mismo|ultimo) producto\b/u.test(normalizedReference(text)) ? "PRODUCT" : /\b(?:este|ese|mismo|ultimo) proveedor\b/u.test(normalizedReference(text)) ? "SUPPLIER" : undefined;
        if (kind) { candidates = targets.filter((l) => l.type === kind); reason = "EXPLICIT_CONTEXTUAL_REFERENCE"; }
        if (/\b(?:el anterior|proveedor anterior|producto anterior)\b/u.test(normalizedReference(text))) {
          const preceding = targets.map((load) => ({ load, position: Math.max(...load.assetIds.map((id) => snapshot.messages.find((m) => m.id === id)?.sequence ?? -1)) })).filter((candidate) => candidate.position < message.sequence && (!kind || candidate.load.type === kind)).sort((a, b) => b.position - a.position);
          if (preceding[0]) { candidates = [preceding[0].load]; reason = "USER_EXPLICIT_PREVIOUS_REFERENCE"; }
        }
      }
      if (!candidates.length && message.envelope.quotedMessageId) {
        const quoted = snapshot.messages.find((m) => m.envelope.messageId === message.envelope.quotedMessageId);
        if (quoted && loadFor.has(quoted.id)) { candidates = [loadFor.get(quoted.id)!]; reason = "QUOTED_ASSET_REFERENCE"; }
      }
      const productReference = candidates.some((load) => load.type === "PRODUCT") && ["VISUAL_PRODUCT_REFERENCE", "EXPLICIT_CONTEXTUAL_REFERENCE", "USER_EXPLICIT_PREVIOUS_REFERENCE", "QUOTED_ASSET_REFERENCE"].includes(reason);
      const supplierReference = resolveConversationSupplier(snapshot, message.id, text, targets.filter((load) => load.type === "SUPPLIER").map((load) => ({ id: load.id, name: load.name, messageIds: load.assetIds })));
      if (!selected && !oldLink && !(reason === "EXPLICIT_SUPPLIER_NAME" && candidates.length) && supplierReference.id && !productReference) {
        // A photographed product becomes the immediate subject until another supplier card.
        const preceding = orderedBurstMessages(snapshot).slice(0, orderedBurstMessages(snapshot).findIndex(m => m.id === message.id));
        const lastImage = preceding.filter(m => m.envelope.type === "IMAGE").at(-1);
        const lastProduct = lastImage && targets.find(l => l.type === "PRODUCT" && l.assetIds.includes(lastImage.id));
        candidates = supplierReference.reason === "NEAREST_PREVIOUS_SUPPLIER" && lastProduct ? [lastProduct] : targets.filter(load => load.id === supplierReference.id);
        reason = lastProduct && candidates[0] === lastProduct ? "NEAREST_PREVIOUS_PRODUCT" : supplierReference.reason;
      }
      if (!selected && !oldLink && supplierReference.ambiguous && (!productReference || supplierReference.reason !== "UNRESOLVED_QUOTED_REFERENCE")) { candidates = targets.filter((load) => load.type === "SUPPLIER"); reason = "INSUFFICIENT_TARGET_REFERENCE"; }
      const commercial = /\b(?:moq|fob|usd|precio|vale|cuesta|entreg|plazo|dias|lead\s*time)\b/iu.test(normalizedReference(text));
      if (!candidates.length && commercial && targets.length) { candidates = targets.filter(load => load.assetIds.some(id => (snapshot.messages.find(m => m.id === id)?.sequence ?? Infinity) < message.sequence)); reason = "INSUFFICIENT_TARGET_REFERENCE"; }
      graph.associationAttempts!.push({ assetId: message.id, segmentId: segment.id, candidates: targets.map((load) => ({ loadId: load.id, explicitSupplierName: load.type === "SUPPLIER" && mentions(text, load.name), visualProductReference: load.type === "PRODUCT" && (mentions(text, load.name) || productTokens(load, snapshot).some((token) => ` ${normalizedReference(text)} `.includes(` ${token} `))), sequenceDistance: Math.min(...load.assetIds.map((id) => Math.abs(message.sequence - (snapshot.messages.find((m) => m.id === id)?.sequence ?? message.sequence)))) })), selectedTarget: candidates.length === 1 && reason !== "INSUFFICIENT_TARGET_REFERENCE" ? candidates[0].id : undefined, reason, confidence: candidates.length === 1 && reason !== "INSUFFICIENT_TARGET_REFERENCE" ? reason === "VISUAL_PRODUCT_REFERENCE" ? "MEDIUM" : "HIGH" : "AMBIGUOUS", clarificationRequired: Boolean(candidates.length && (candidates.length > 1 || reason === "INSUFFICIENT_TARGET_REFERENCE")) });
      if (candidates.length === 1 && reason !== "INSUFFICIENT_TARGET_REFERENCE") {
        const load = candidates[0];
        if (load.status === "PROCESSED" && !previous?.loads.find((l) => l.id === load.id)?.assetIds.includes(message.id)) addLoad(message, "EVIDENCE", null);
        else if (!load.assetIds.includes(message.id)) load.assetIds.push(message.id);
        graph.links.push({ sourceAssetId: message.id, sourceSegmentId: segment.id, targetLoadId: load.id, relationship: "FACTS_FOR", confidence: reason === "VISUAL_PRODUCT_REFERENCE" ? "MEDIUM" : "HIGH", reasons: [reason], candidateTargets: [load.id] });
        if (!loadFor.has(message.id)) loadFor.set(message.id, load);
      } else if (candidates.length) {
        const load = graph.loads.find((l) => l.type === "EVIDENCE" && l.reasons.includes(`SEGMENT:${segment.id}`)) ?? addLoad(message, "EVIDENCE", null, `${message.id}:${segment.id}`);
        load.reasons = [`SEGMENT:${segment.id}`];
        graph.links = graph.links.filter((link) => !(link.targetLoadId === load.id && link.reasons.includes("INDEPENDENT_TEXT_OR_AUDIO")));
        load.status = "NEEDS_REVIEW"; load.error = { type: "AMBIGUOUS_ASSOCIATION", retryable: false, stage: "association" };
        graph.links.push({ sourceAssetId: message.id, sourceSegmentId: segment.id, relationship: "POSSIBLY_RELATED", confidence: "AMBIGUOUS", reasons: [reason], candidateTargets: candidates.map((l) => l.id) });
      } else if ((!option || message.id !== answer?.id) && !loadFor.has(message.id)) addLoad(message, "EVIDENCE", null);
    }
    if (message.envelope.type === "AUDIO" && message.reading?.transcript !== undefined) graph.derivations.push({ id: `${message.id}:transcript`, type: "TEXT", sourceAssetId: message.id, relationship: "DERIVED_FROM" });
  }
  const supplierReferences = graph.loads.filter((load) => load.type === "SUPPLIER").map((load) => ({ id: load.id, name: load.name, messageIds: [...load.assetIds] }));
  for (const message of orderedBurstMessages(snapshot)) {
    for (const product of graph.loads.filter((load) => load.type === "PRODUCT" && load.assetIds.includes(message.id))) {
      const association = resolveConversationSupplier(snapshot, message.id, assetText(message), supplierReferences);
      if (association.id && (!product.supplierContext || ["EXPLICIT_SUPPLIER_NAME", "ORDINAL_SUPPLIER_REFERENCE", "QUOTED_SUPPLIER_REFERENCE"].includes(association.reason))) {
        product.supplierContext = { loadId: association.id, reason: association.reason, sourceMessageId: message.id };
        const reference = supplierReferences.find((reference) => reference.id === association.id)!;
        reference.messageIds.push(...product.assetIds.filter((id) => !reference.messageIds.includes(id)));
      }
    }
  }
  for (const message of snapshot.messages) {
    const links = graph.links.filter((l) => l.sourceAssetId === message.id && l.targetLoadId);
    const own = graph.loads.filter((l) => l.assetIds.includes(message.id));
    const loadIds = [...new Set([...links.map((l) => l.targetLoadId!), ...own.map((l) => l.id)])];
    const status = !own.length && /^(?:listo|reintentar|\d+)[.!]?$/iu.test(assetText(message).trim()) ? "PROCESSED" : own.some((l) => l.status === "NEEDS_REVIEW") ? "NEEDS_REVIEW" : own.length && own.every((l) => l.status === "PROCESSED") ? "PROCESSED" : message.reading?.ingestion?.status === "FAILED" ? "FAILED" : "GROUPED";
    if (message.reading?.ingestion) { message.reading.ingestion.loadIds = loadIds; message.reading.ingestion.status = status; message.reading.ingestion.error = own.find((l) => l.error)?.error; }
    graph.assets.push({ id: message.id, type: message.envelope.type, status, classification: message.reading?.ingestion?.classification?.type, readability: message.reading?.ingestion?.readability ?? message.reading?.ingestion?.classification?.readability, loadIds, error: message.reading?.ingestion?.error });
  }
  updateGraphSummary(graph); return graph;
}
export function evidenceLinks(snapshot: BurstSnapshot, evidence: { messageId: string; text: string }) {
  const segments = snapshot.messages.find((message) => message.id === evidence.messageId)?.reading?.segments ?? [];
  return snapshot.state.ingestion?.links.filter((link) => link.sourceAssetId === evidence.messageId && (!link.sourceSegmentId || segments.some((segment) => segment.id === link.sourceSegmentId && (segment.text.includes(evidence.text) || evidence.text.includes(segment.text))))) ?? [];
}
export function logicalLoadIds(snapshot: BurstSnapshot, input: AgentWrite) {
  return [...new Set(input.evidence.filter(e => !e.pendingId).flatMap((e) => evidenceLinks(snapshot, e).filter((l) => l.targetLoadId && l.confidence !== "AMBIGUOUS").map((l) => l.targetLoadId!)))];
}
export function assertLoadWrite(snapshot: BurstSnapshot, input: AgentWrite) {
  const graph = snapshot.state.ingestion; if (!graph) return;
  // A completed technical retry remains valid after the load becomes PROCESSED.
  const known = (snapshot.state as Partial<AgentState>).agent?.receipts ?? [];
  if (input.tool.startsWith("create_") && known.some((receipt) => receipt.status === "COMPLETED" && receipt.tool === input.tool && receipt.tripId === input.tripId && receipt.companyId === input.companyId && receipt.evidenceIds?.length === input.evidence.length && input.evidence.every((e) => receipt.evidenceIds!.includes(e.id)) && (input.tool === "create_supplier_draft" || receipt.name === input.name && [receipt.supplierId, receipt.captureId].includes(input.targetId)))) return;
  for (const evidence of input.evidence) {
    // Pending historical evidence is authorized and grounded by the domain;
    // its original message intentionally does not belong to this burst's graph.
    if (evidence.pendingId) continue;
    const asset = graph.assets.find((a) => a.id === evidence.messageId);
    if (!asset || asset.status === "FAILED" || asset.status === "NEEDS_REVIEW" && asset.error?.stage !== "association") throw new AgentToolError("ASSET_NEEDS_REVIEW", "La evidencia necesita lectura o asociación confiable antes de escribir");
    const ambiguous = evidenceLinks(snapshot, evidence).filter((l) => l.confidence === "AMBIGUOUS");
    if (ambiguous.length) throw new AgentToolError("AMBIGUOUS_ASSOCIATION", "Respondé la aclaración de asociación antes de usar esta evidencia");
  }
  const ids = logicalLoadIds(snapshot, input); const loads = graph.loads.filter((l) => ids.includes(l.id));
  const imageLoads = loads.filter((l) => l.assetIds.some((id) => snapshot.messages.some((m) => m.id === id && m.envelope.type === "IMAGE")));
  if (input.tool === "create_supplier_draft" && imageLoads.filter((l) => l.type === "SUPPLIER").length > 1 || input.tool.includes("product") && imageLoads.filter((l) => l.type === "PRODUCT").length > 1) throw new AgentToolError("CROSS_LOAD_EVIDENCE", "La escritura mezcla cargas lógicas distintas");
  if (graph.activeLoadId && input.tool.startsWith("create_") && !ids.includes(graph.activeLoadId)) throw new AgentToolError("WRONG_ACTIVE_LOAD", "La escritura no pertenece a la carga lógica activa");
  for (const load of loads.filter((l) => l.type === "SUPPLIER" && input.tool === "create_supplier_draft")) {
    if (load.status === "PROCESSED" || load.resourceId) throw new AgentToolError("LOAD_ALREADY_PROCESSED", "Esta carga lógica ya tiene proveedor; consultalo antes de completar datos");
    if (load.assetIds.filter((id) => snapshot.messages.some((m) => m.id === id && m.envelope.type === "IMAGE")).some((id) => !input.evidence.some((e) => e.messageId === id && e.role === "FACTS"))) throw new AgentToolError("INCOMPLETE_CARD_GROUP", "Frente y reverso deben prepararse juntos antes de crear el proveedor");
  }
  if (input.targetId && (input.tool === "create_product_draft" || input.tool === "update_supplier")) {
    const facts = input.evidence.filter((e) => e.role === "FACTS");
    const supplierTargets = facts.flatMap((e) => evidenceLinks(snapshot, e)).filter((link) => link.relationship === "FACTS_FOR" && graph.loads.some((load) => load.id === link.targetLoadId && load.type === "SUPPLIER"));
    const known = (snapshot.state as AgentState).agent?.receipts ?? [];
    for (const link of supplierTargets) {
      const supplier = known.find((r) => r.tool === "create_supplier_draft" && r.status === "COMPLETED" && r.logicalLoadIds?.includes(link.targetLoadId!));
      if (supplier && ![supplier.id, supplier.captureId].includes(input.targetId)) throw new AgentToolError("WRONG_ASSOCIATED_SUPPLIER", "El audio está asociado a otro proveedor por el pipeline");
    }
  }
  if (input.tool.includes("product")) {
    const products = imageLoads.filter((l) => l.type === "PRODUCT");
    for (const product of products) {
      const supplierLoad = graph.loads.find((load) => load.id === product.supplierContext?.loadId);
      const supplierReceipt = known.find((receipt) => receipt.status === "COMPLETED" && receipt.logicalLoadIds?.includes(supplierLoad?.id ?? "") && (receipt.tool === "create_supplier_draft" || receipt.tool === "resolve_existing_resource"));
      const targets = [supplierLoad?.resourceId, supplierReceipt?.id, supplierReceipt?.captureId].filter(Boolean);
      if (input.targetId && targets.length && !targets.includes(input.targetId)) throw new AgentToolError("WRONG_ASSOCIATED_SUPPLIER", "El producto pertenece al proveedor indicado por el contexto de mensajes");
    }
    const named = input.name ? graph.loads.filter((load) => load.type === "PRODUCT" && productTokens(load, snapshot).some((token) => ` ${normalizedReference(input.name!)} `.includes(` ${token} `))) : [];
    if (products.length && named.length && !named.some((load) => load.id === products[0].id)) throw new AgentToolError("WRONG_PRODUCT_IMAGE", "La imagen no corresponde al producto nombrado");
    if (products.length) for (const evidence of input.evidence.filter((e) => e.role === "FACTS" && snapshot.messages.some((m) => m.id === e.messageId && m.envelope.type !== "IMAGE"))) {
      const links = evidenceLinks(snapshot, evidence).filter((link) => link.relationship === "FACTS_FOR" && link.confidence !== "AMBIGUOUS");
      if (!links.some((link) => link.targetLoadId === products[0].id)) throw new AgentToolError("UNVERIFIED_PRODUCT_IMAGE_ASSOCIATION", "Los datos del producto no tienen asociación confiable con esta imagen; pedí aclaración");
    }
    const factLinks = input.evidence.filter((e) => e.role === "FACTS").flatMap((e) => evidenceLinks(snapshot, e).filter((l) => l.relationship === "FACTS_FOR" && l.targetLoadId));
    if (products.length && factLinks.some((l) => graph.loads.some((load) => load.id === l.targetLoadId && load.type === "PRODUCT") && l.targetLoadId !== products[0].id)) throw new AgentToolError("WRONG_PRODUCT_IMAGE", "La imagen pertenece a otro producto");
  }
}
export function recordLoadReceipt(state: AgentState, receipt: AgentReceipt) {
  const graph = state.ingestion; if (!graph || receipt.status !== "COMPLETED") return;
  for (const load of graph.loads.filter((l) => receipt.logicalLoadIds?.includes(l.id) && (l.type === "PRODUCT" ? receipt.tool.includes("product") : receipt.data?.preservedImageLoad === true || l.type === "EVIDENCE" || (receipt.tool.includes("supplier") || receipt.tool === "resolve_existing_resource") && l.type === "SUPPLIER"))) { load.status = "PROCESSED"; load.resourceId = receipt.id; load.question = undefined; load.questionText = undefined; }
  for (const asset of graph.assets) if (asset.loadIds.length && asset.loadIds.every((id) => graph.loads.find((l) => l.id === id)?.status === "PROCESSED")) asset.status = "PROCESSED";
  updateGraphSummary(graph);
}
function reviewReason(error: { type: string; stage: string } | undefined) {
  if (error?.type === "SUPPLIER_INCOMPLETE") return "tarjeta legible; faltan nombre o contacto";
  if (error?.type === "AMBIGUOUS_CARD_READING") return "lectura de tarjeta dudosa";
  if (error?.type === "MEDIA_PERSISTENCE_FAILED") return "archivo pendiente de guardar";
  if (error?.type === "DOCUMENT_FILE_REQUIRES_REVIEW") return "documento que requiere revisión";
  if (error?.stage === "transcription") return "audio pendiente de transcribir";
  if (error?.stage === "association") return "asociación por aclarar";
  if (error?.stage === "business") return "carga pendiente de completar";
  return "lectura pendiente o dudosa";
}
export function nextIngestionQuestion(snapshot: BurstSnapshot) {
  const graph = snapshot.state.ingestion; if (!graph) return null;
  const link = graph.links.find((l) => l.confidence === "AMBIGUOUS" && l.relationship === "POSSIBLY_RELATED" && !graph.loads.some(load => load.assetIds.includes(l.sourceAssetId) && load.resourceId));
  if (link) {
    const options = link.candidateTargets.flatMap((id) => { const load = graph.loads.find((l) => l.id === id); return load ? [{ id, label: load.name ?? id }] : []; });
    return { question: `${describeEvidence(snapshot, link.sourceAssetId)}\n¿A qué proveedor o producto corresponde?${options.length > 1 ? ` Las opciones son ${options.map(o => o.label).join(" o ")}.` : ""}`, options, associationSource: { assetId: link.sourceAssetId, segmentId: link.sourceSegmentId } };
  }
  const failed = graph.assets.filter((a) => !a.resolution && ["FAILED", "NEEDS_REVIEW"].includes(a.status));
  if (failed.length) return { question: failed.map(a => `${describeEvidence(snapshot, a.id)} ${reviewReason(a.error)}.`).join("\n\n") + "\n\nReenviá las ilegibles o respondé reintentar para las fallas temporales.", options: [], associationSource: undefined };
  return null;
}

/** Refer to the user's actual asset, never an unidentifiable “esta imagen”. */
export function describeEvidence(snapshot: BurstSnapshot, messageId: string): string {
  const message = snapshot.messages.find(m => m.id === messageId);
  if (!message) return "La evidencia pendiente necesita un destino.";
  const kind = message.envelope.type === "TEXT" ? "El mensaje" : message.envelope.type === "AUDIO" ? "El audio" : message.reading?.imageKind === "BUSINESS_CARD" ? "La tarjeta" : "La imagen";
  const date = message.sentAt ?? (message.envelope.sentAt ? new Date(message.envelope.sentAt) : null);
  const time = date && Number.isFinite(date.getTime()) ? ` de las ${date.toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Cordoba", hour12: false, hour: "2-digit", minute: "2-digit" })}` : ` del mensaje ${message.sequence}`;
  const description = message.envelope.text ?? message.reading?.transcript ?? message.reading?.ingestion?.classification?.product?.description ?? message.reading?.ingestion?.classification?.card?.companyName;
  return `${kind}${time}${description ? `: «${description.slice(0, 240)}»` : ""}.${message.envelope.type === "IMAGE" && message.reading?.storageKey ? " El original está guardado." : ""}`;
}
