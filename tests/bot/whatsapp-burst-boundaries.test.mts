import { WhatsAppAgentService } from "../../lib/channels/whatsapp/agent-service.ts";
import { WhatsAppBurstService } from "../../lib/channels/whatsapp/burst-service.ts";
import type { WhatsAppAgentOrchestrator } from "../../lib/channels/whatsapp/agent-orchestrator.ts";
import type { BurstStore } from "../../lib/channels/whatsapp/burst-types.ts";
import { AgentCheckpoint } from "../../lib/channels/whatsapp/agent-contract.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { cardOcrCoverageIncomplete, frontCardNeedsSideVerification, normalizeContactCard, normalizeFlatPrintedCard, productConflictsWithCardOcr, readOriginalImage, VISUAL_PROMPT } from "../../lib/channels/whatsapp/multimodal-reading.ts";
import { buildEvidenceGraph, cardMentionsReference, explicitCardReference, updateGraphSummary, nextIngestionQuestion } from "../../lib/channels/whatsapp/evidence-grouping.ts";
import { answersPending, isIndependentConversationQuery, isLowInformationText } from "../../lib/channels/whatsapp/burst-routing.ts";

import { strongSupplierIdentity, supplierSearchMatches } from "../../lib/channels/whatsapp/supplier-identity.ts";
import { resolveHistoricalSnapshot } from "../../lib/channels/whatsapp/historical-resolution.ts";
import { agentState, type AgentState } from "../../lib/channels/whatsapp/agent-contract.ts";
import { AgentTools, recordReceipt } from "../../lib/channels/whatsapp/agent-tools.ts";
import { PrismaBurstStore } from "../../lib/channels/whatsapp/prisma-burst-store.ts";
import { createAgentEnvironment, localAgentDatabase } from "../../evals/whatsapp-agent/environment.ts";
import type { VisualReading, CardReading } from "../../lib/channels/whatsapp/ingestion-types.ts";
import type { BurstSnapshot, BurstEnvelope, BurstState } from "../../lib/channels/whatsapp/burst-types.ts";

test("legacy question-only clarification resumes its answer without capturing new uploads", () => {
  const state = { tripId: null, groups: [], question: "¿Para qué empresa son las tarjetas?", controlIds: [], pendingRefs: [] };
  const envelope = { instance: "synthetic", phone: "123", messageId: "answer", type: "TEXT" as const, text: "las primeras dos por kendal y las últimas dos por broco", media: null, sentAt: null };
  assert.equal(answersPending(envelope, state), true);
  for (const text of ["Tengo otra silla", "Nuevo proveedor Alfa", "Agregá este producto", "Cargá esta mesa", "Producto: mesa"]) assert.equal(answersPending({ ...envelope, text }, state), false);
  assert.equal(answersPending({ ...envelope, text: "" }, state), false);
  assert.equal(answersPending({ ...envelope, text: "1" }, state), false, "legacy question has no numeric options to select");
  assert.equal(answersPending({ ...envelope, type: "IMAGE" }, state), false);
  assert.equal(answersPending(envelope, { ...state, question: null }), false);
});

test("consultas independientes y fragmentos breves no responden una aclaración anterior", () => {
  const state = agentState({ tripId: "trip", groups: [], question: "No llegó la foto. ¿Podés reenviarla?", controlIds: [], pendingRefs: [] });
  state.agent.pending = { type: "CLARIFICATION", revision: 1, text: state.question!, options: [] };
  const envelope: BurstEnvelope = { instance: "nihao", phone: "123", messageId: "new", type: "TEXT", text: "", media: null, sentAt: null };
  for (const text of ["Mm", "J", "F", "Ch", "V", "Cv", "Con", "Ok??"]) {
    assert.equal(isLowInformationText(text), true);
    assert.equal(answersPending({ ...envelope, text }, state), false, text);
  }
  for (const text of ["¿Cargaste todo?", "¿Qué cargaste?", "Respondeme todo", "¿Qué falta?", "¿Qué productos guardé?", "Mostrame mis productos", "¿Qué proveedores tengo?", "Listame los proveedores guardados"]) {
    assert.equal(isIndependentConversationQuery(text), true);
    assert.equal(answersPending({ ...envelope, text }, state), false, text);
  }
  assert.equal(answersPending({ ...envelope, text: "Ni idea" }, state), true, "una respuesta directa y significativa todavía puede resolver la pregunta activa");
  assert.equal(answersPending({ ...envelope, text: "PANLOS BRICK" }, state), true);
  assert.equal(answersPending({ ...envelope, text: "Quiero organizar un viaje a China para conocer Beijing, Shanghái y otras ciudades. Necesito un itinerario completo con hoteles, trenes y actividades turísticas." }, state), false, "un tema nuevo y extenso no queda atrapado en la aclaración");
  assert.equal(answersPending({ ...envelope, text: "¿Por qué no respondiste mi consulta anterior?" }, state), false, "una consulta nueva no responde la aclaración por accidente");
  assert.equal(answersPending({ ...envelope, type: "AUDIO", text: null }, state), false, "un audio nuevo no queda secuestrado sin cita explícita");
  assert.equal(answersPending({ ...envelope, type: "AUDIO", text: null, quotedMessageId: "question" }, state, ["question"]), true);
});

const card = (overrides: Partial<CardReading> = {}): CardReading => ({ companyName: "Example Technology Co., Ltd", personName: "Ava", role: null, emails: ["ava@example.test"], phones: ["+8613812345678"], websites: ["www.example.test"], address: null, visibleText: [], uncertainFields: [], branding: "EXAMPLE", ...overrides });
const visual = (overrides: Partial<VisualReading> = {}): VisualReading => ({ type: "BUSINESS_CARD", side: "FRONT", confidence: .98, readability: "readable", visual: "Tarjeta plana de cartulina; gráfico impreso", card: card(), product: null, ...overrides });
function snapshot(readings: VisualReading[]): BurstSnapshot {
  const id = randomUUID();
  const s: BurstSnapshot = { id, instance: "boundary-test", phone: "123", userId: "user", revision: readings.length, status: "PROCESSING", leaseId: "lease", state: agentState({ tripId: "trip", groups: [], question: null, controlIds: [], pendingRefs: [] }), messages: readings.map((v, i) => {
    const id = randomUUID(); const text = [v.card?.companyName, ...v.card?.emails ?? [], ...v.card?.phones ?? [], ...v.card?.websites ?? [], ...v.card?.visibleText ?? []].filter(Boolean).join("\n");
    return { id, sequence: i + 1, sentAt: null, envelope: { instance: "boundary-test", phone: "123", messageId: id, type: "IMAGE", text: null, media: null, sentAt: null }, reading: { complete: true, imageKind: v.type === "PRODUCT" ? "PRODUCT_IMAGE" : v.type, ocr: text, segments: [{ id: `${id}:1`, text }], ingestion: { status: "PARSED", stage: "parsed", attempts: [], loadIds: [], classification: v, independentReadings: [v], readability: v.readability, ocrCandidate: { extractedFields: { companyName: v.card?.companyName }, contactMethods: v.card?.emails.map(rawText => ({ type: "EMAIL", rawText })), reviewFields: [], evidence: [], rawSource: { type: "IMAGE_BUSINESS_CARD", text } } } } };
  }) };
  s.state.ingestion = buildEvidenceGraph(s); return s;
}

test("una ráfaga válida no termina en silencio si el agente no produce texto", async () => {
  const s = snapshot([]); let reply = ""; let claimed = false;
  const store = {
    async claim() { if (claimed) return []; claimed = true; return [s]; },
    async catalog() { return { trips: [{ id: "trip", name: "China", companies: [{ id: "company", name: "Demo" }] }] }; },
    async saveReading() {},
    async reserve() { return true; },
    async finish(_snapshot: BurstSnapshot, _state: BurstState, text: string) { reply = text; },
    async retry() { assert.fail("No debe reintentar una ráfaga completada"); },
    async flushReplies() {},
  } as unknown as BurstStore;
  const service = new WhatsAppBurstService({ store, reader: { async read() { throw new Error("no hay mensajes"); } }, interpreter: { async interpret() { return { ...s.state, notice: null, question: null, groups: [] }; } }, async materialize() { assert.fail("No hay cargas para materializar"); }, async send() {} });
  await service.processDue(1);
  assert.match(reply, /^Recibí y conservé tus mensajes\./u);
});

for (const [name, reading] of [
  ["card back with product illustration", visual({ side: "BACK", card: card({ emails: [], phones: [], companyName: null, visibleText: ["Model blocks", "Printed cube illustration"] }) })],
  ["card front with commercial text and contacts", visual()],
  ["marketing back with only corporate website", visual({ side: "BACK", card: card({ companyName: null, emails: [], phones: [], personName: null }) })],
  ["graphic brand-only card", visual({ side: "UNKNOWN_SIDE", card: card({ companyName: null, emails: [], phones: [], websites: [], visibleText: ["MODEL BRICKS"] }) })],
  ["physical product photo", visual({ type: "PRODUCT", side: "UNKNOWN_SIDE", visual: "Vaso físico de vidrio con volumen, base y paredes visibles", card: null, product: { description: "vaso físico de vidrio", packaging: false, brand: null, model: null, visibleText: [] } })],
  ["real invoice document", visual({ type: "DOCUMENT", side: "UNKNOWN_SIDE", card: null })],
] as const) test(`classification contract: ${name}`, async () => {
  const r = await readOriginalImage({ async post(_path, body) {
    const messages = (body as { messages: Array<{ content: unknown }> }).messages;
    assert.equal(messages[0].content, VISUAL_PROMPT); assert.match(VISUAL_PROMPT, /soporte físico/u); assert.match(VISUAL_PROMPT, /IMPRESOS/u); assert.match(VISUAL_PROMPT, /No requiere contacto/u);
    assert.match(VISUAL_PROMPT, /edge lifted slightly/u); assert.match(VISUAL_PROMPT, /no visible side walls, seams or closing flaps/u);
    assert.match(VISUAL_PROMPT, /Handwritten text is ADDITIONAL evidence/u); assert.match(VISUAL_PROMPT, /Never turn handwriting alone into FOB, MOQ, lead time or a confirmed product/u);
    return { choices: [{ message: { content: JSON.stringify(reading) } }] };
  } }, new Uint8Array([0xff, 0xd8, 0xff]), "image/jpeg");
  assert.equal(r.type, reading.type); assert.equal(r.side, reading.side);
});

test("a PRODUCT enum contradicting a card-shaped physical support activates the existing stronger reader", () => {
  const product = (description: string) => visual({ type: "PRODUCT", side: "UNKNOWN_SIDE", visual: description, card: null, product: { description: "caja ilustrada", brand: null, model: null, visibleText: [], packaging: true } });
  assert.equal(productConflictsWithCardOcr(product("Tarjeta rectangular de cartón, borde delgado y sin solapas."), "PANLOS BRICK"), true);
  assert.equal(productConflictsWithCardOcr(product("Soporte físico rectangular de cartón rígido con una sola cara impresa."), "YKO Blocks"), true);
  assert.equal(productConflictsWithCardOcr(product("Caja con múltiples caras, paredes laterales y solapas visibles."), "YKO Blocks"), false);
});

test("flat PANLOS/YKO printed cards cannot become products when the model contradicts its own physical reading", () => {
  const panlos = normalizeFlatPrintedCard(visual({
    type: "PRODUCT", side: "UNKNOWN_SIDE",
    visual: "Tarjeta rectangular de cartón delgada con impresión en ambas caras, bordes finos, sin solapas ni estructura tridimensional.",
    card: null,
    product: { description: "tarjeta de muestra de ladrillos PANLOS BRICK", brand: "PANLOS", model: "BRICK", visibleText: ["PANLOS BRICK", "MODEL BRICKS"], packaging: false },
  }));
  assert.equal(panlos.type, "BUSINESS_CARD"); assert.equal(panlos.side, "BACK"); assert.equal(panlos.card?.branding, "PANLOS"); assert.equal(panlos.product, null);

  const yko = normalizeFlatPrintedCard(visual({
    type: "PRODUCT", side: "UNKNOWN_SIDE",
    visual: "Soporte físico rectangular plano y fino; no presenta profundidad física, caras laterales ni solapas.",
    card: null,
    product: { description: "muestra impresa YKO Blocks", brand: "YKO", model: null, visibleText: ["YKO Blocks"], packaging: false },
  }));
  assert.equal(yko.type, "BUSINESS_CARD"); assert.equal(yko.card?.branding, "YKO");

  const box = visual({ type: "PRODUCT", side: "UNKNOWN_SIDE", visual: "Caja física con paredes laterales, tapa y múltiples caras visibles.", card: null, product: { description: "caja de bloques", brand: "PANLOS", model: null, visibleText: [], packaging: true } });
  assert.equal(normalizeFlatPrintedCard(box), box);
});
test("Rotoplast brand and sector printed on a flat card never create a product", () => {
  const mistaken = visual({
    type: "PRODUCT", side: "UNKNOWN_SIDE",
    visual: "Tarjeta comercial rectangular, plana y fina, sin profundidad, caras laterales ni solapas.",
    card: null,
    product: { description: "climatizador evaporativo Rotoplast", brand: "Rotoplast", model: null, visibleText: ["Representante exclusivo en Argentina", "Climatizadores Evaporativos"], packaging: false },
  });
  const corrected = normalizeFlatPrintedCard(mistaken);
  assert.equal(corrected.type, "BUSINESS_CARD");
  assert.equal(corrected.side, "BACK");
  assert.equal(corrected.card?.branding, "Rotoplast");
  assert.deepEqual(corrected.card?.visibleText, ["Representante exclusivo en Argentina", "Climatizadores Evaporativos"]);
  assert.equal(corrected.product, null);
});
test("contact-heavy AH TECH reading cannot become a product when OCR proves a business card", () => {
  const mistaken = visual({
    type: "PRODUCT", side: "UNKNOWN_SIDE", visual: "Objeto cilíndrico verde sostenido por una mano.", card: null,
    product: { description: "tapa de recipiente plástico verde", brand: null, model: null, packaging: false, visibleText: ["Anhui Technology Import & Export Co., LTD.", "Tel: 0551 65101144", "WhatsApp: +86 19356077519", "Email: person@ahtech.example", "Add: Hefei, China"] },
  });
  const ocr = "Anhui Technology Import & Export Co., LTD.\nTel: 0551 65101144\nWhatsApp: +86 19356077519\nEmail: person@ahtech.example\nAdd: Hefei, China";
  assert.equal(productConflictsWithCardOcr(mistaken, ocr), true);
  const corrected = normalizeContactCard(mistaken, ocr);
  assert.equal(corrected.type, "BUSINESS_CARD"); assert.equal(corrected.side, "FRONT"); assert.equal(corrected.product, null);
  assert.deepEqual(corrected.card?.emails, ["person@ahtech.example"]); assert.ok(corrected.card?.phones.includes("+8619356077519"));
  const contactCardInFrontOfProduct = visual({
    type: "PRODUCT", side: "UNKNOWN_SIDE", visual: "Mochila física expuesta detrás de una tarjeta sostenida por una mano.", card: null,
    product: { description: "mochila", brand: null, model: null, packaging: false, visibleText: ["Dennis Chen", "M: +86 19859002555", "E: dennis@example.test"] },
  });
  assert.equal(normalizeContactCard(contactCardInFrontOfProduct, "Dennis Chen\nM: +86 19859002555\nE: dennis@example.test").type, "BUSINESS_CARD");
  const physicalProduct = visual({ type: "PRODUCT", side: "UNKNOWN_SIDE", visual: "Máquina física con volumen y carcasa", card: null, product: { description: "máquina industrial", brand: null, model: null, packaging: false, visibleText: ["support@example.test"] } });
  assert.equal(normalizeContactCard(physicalProduct, "support@example.test"), physicalProduct);
});

test("material OCR omitted from a card reading activates stronger review without penalizing short brand backs", () => {
  const printed = card({ visibleText: ["LEOCH BATTERY", "Export Dept.", "Stock Code 00842.HK"] });
  assert.equal(cardOcrCoverageIncomplete(printed, "LEOCH BATTERY Export Dept Stock Code 00842 HK Renewable Energy Shenzhen Address Phone Email Website lawn mower batteries"), true);
  assert.equal(cardOcrCoverageIncomplete({ ...printed, visibleText: [...printed.visibleText, "Renewable Energy", "Shenzhen", "Address", "Phone", "Email", "Website", "lawn mower batteries"] }, "LEOCH BATTERY Export Dept Stock Code 00842 HK Renewable Energy Shenzhen Address Phone Email Website lawn mower batteries"), false);
  assert.equal(cardOcrCoverageIncomplete(card({ companyName: null, visibleText: ["PANLOS BRICK"] }), "PANLOS BRICK MODEL BRICKS"), false);
});
test("a contact-free marketing face labeled FRONT activates side verification", () => {
  assert.equal(frontCardNeedsSideVerification(visual({ card: card({ companyName: "Global Power Solutions", personName: null, role: null, phones: [], emails: [], address: null, visibleText: ["Energy Storage", "Battery Recycling"] }) })), true);
  assert.equal(frontCardNeedsSideVerification(visual()), false);
  assert.equal(frontCardNeedsSideVerification(visual({ side: "BACK", card: card({ personName: null, role: null, phones: [], emails: [], address: null, visibleText: ["Energy Storage"] }) })), false);
});

test("front/back corporate domain groups two cards into one supplier load", () => {
  const s = snapshot([visual(), visual({ side: "BACK", card: card({ companyName: null, emails: [], phones: [], personName: null }) })]);
  assert.equal(s.state.ingestion!.loads.length, 1); assert.equal(s.state.ingestion!.loads[0].assetIds.length, 2);
  const trace = s.state.ingestion!.groupingAttempts![0]; assert.equal(trace.signals.sameDomain, true); assert.equal(trace.decision, "GROUP"); assert.ok(trace.reasons.includes("SAME_DOMAIN"));
});
test("handwriting review stays visible while exact domain groups both card faces", () => {
  const s = snapshot([
    visual({ side: "BACK", card: card({ companyName: null, personName: null, role: null, emails: [], phones: [], visibleText: ["Energy Storage"] }) }),
    visual({ card: card({ uncertainFields: ["handwriting: partially legible note"] }) }),
  ]);
  s.messages[1].reading!.ingestion!.status = "NEEDS_REVIEW";
  s.messages[1].reading!.ingestion!.error = { type: "UNCERTAIN_VISUAL_READING", retryable: false, stage: "vision" };
  s.state.ingestion = undefined; s.state.ingestion = buildEvidenceGraph(s);
  assert.equal(s.state.ingestion.loads.length, 1); assert.equal(s.state.ingestion.loads[0].assetIds.length, 2);
  assert.equal(s.state.ingestion.loads[0].status, "NEEDS_REVIEW"); assert.equal(s.state.ingestion.loads[0].error?.type, "UNCERTAIN_VISUAL_READING");
});
test("two complementary faces both labeled FRONT group only with strong identity", () => {
  const legal = visual({ card: card({ companyName: "Example Manufacturing Co., Ltd", personName: null, emails: ["shared@example.test"], phones: [], branding: "EXAMPLE", websites: ["example.test"] }) });
  const trade = visual({ card: card({ companyName: "Example Brand", personName: null, emails: ["shared@example.test"], phones: [], branding: "EXAMPLE", websites: ["www.example.test"] }) });
  const byContact = snapshot([legal, trade]);
  assert.equal(byContact.state.ingestion!.loads.length, 1);
  assert.ok(byContact.state.ingestion!.groupingAttempts![0].reasons.includes("SAME_SIDE_STRONG_IDENTITY"));

  const contactFace = visual({ card: card({ companyName: "Example Blocks", personName: "Ava", emails: [], phones: [], websites: [], branding: "YKO Blocks" }) });
  const marketingFace = visual({ card: card({ companyName: "Example Toy Factory", personName: "Ava", emails: [], phones: [], websites: [], branding: "YKO building diary" }) });
  assert.equal(snapshot([contactFace, marketingFace]).state.ingestion!.loads.length, 1);
});
test("same-side cards never group from proximity, branding alone or person alone", () => {
  const first = visual({ card: card({ companyName: "First Company", personName: "Ava", emails: [], phones: [], websites: [], branding: "SHARED" }) });
  const otherPerson = visual({ card: card({ companyName: "Second Company", personName: "Bob", emails: [], phones: [], websites: [], branding: "SHARED" }) });
  const otherBrand = visual({ card: card({ companyName: "Third Company", personName: "Ava", emails: [], phones: [], websites: [], branding: "OTHER" }) });
  assert.equal(snapshot([first, otherPerson, otherBrand]).state.ingestion!.loads.length, 3);
  const domainOnly = visual({ card: card({ companyName: "Fourth Company", personName: null, emails: [], phones: [], websites: ["shared.test"], branding: "FOURTH" }) });
  const anotherDomainOnly = visual({ card: card({ companyName: "Fifth Company", personName: null, emails: [], phones: [], websites: ["shared.test"], branding: "FIFTH" }) });
  assert.equal(snapshot([domainOnly, anotherDomainOnly]).state.ingestion!.loads.length, 2);
});
test("two distinct consecutive business cards never merge", () => {
  const s = snapshot([visual(), visual({ side: "BACK", card: card({ companyName: "Other Company", personName: "Different Person", branding: "OTHER", emails: ["other@other.test"], websites: ["other.test"], phones: [] }) })]);
  assert.equal(s.state.ingestion!.loads.length, 2); assert.equal(s.state.ingestion!.groupingAttempts![0].decision, "DO_NOT_GROUP");
});
test("four independent consecutive cards remain four suppliers and zero products", () => {
  const s = snapshot([
    visual({ card: card({ companyName: "AH TECH", branding: "AH TECH", emails: ["one@ah.example"], phones: [], websites: ["ah.example"] }) }),
    visual({ card: card({ companyName: "Xiamen Picvalue Corp.", branding: "PICVALUE", emails: ["two@picvalue.example"], phones: [], websites: ["picvalue.example"] }) }),
    visual({ card: card({ companyName: "陈氏科技", branding: "DENNIS", emails: ["three@chen.example"], phones: [], websites: ["chen.example"] }) }),
    visual({ card: card({ companyName: "Cixi Zhongding Import and Export Co., Ltd.", branding: "TRAVELINES", emails: ["four@travelines.example"], phones: [], websites: ["travelines.example"] }) }),
  ]);
  assert.equal(s.state.ingestion!.loads.filter((load) => load.type === "SUPPLIER").length, 4, JSON.stringify(s.state.ingestion!.loads));
  assert.equal(s.state.ingestion!.loads.filter((load) => load.type === "PRODUCT").length, 0);
});
test("LEOCH and PANLOS front/back sequence uses explicit caption over temporal focus", () => {
  const leochFront = visual({ card: card({ companyName: "LEOCH BATTERY", branding: "LEOCH", emails: ["sales@leoch.example"], websites: ["leoch.example"] }) });
  const leochBack = visual({ side: "BACK", card: card({ companyName: null, personName: null, emails: [], phones: [], websites: ["leoch.example"], branding: "LEOCH", visibleText: ["Global power supply solutions"] }) });
  const panlosBrand = visual({ side: "BACK", card: card({ companyName: null, personName: null, emails: [], phones: [], websites: [], branding: "PANLOS", visibleText: ["PANLOS BRICK", "MODEL BRICKS"] }) });
  const panlosLegal = visual({ card: card({ companyName: "HUADA TOY CO., LTD.", personName: "Emily", emails: ["contact@huada.example"], phones: [], websites: [], branding: null, visibleText: [] }) });
  const s = snapshot([leochFront, leochBack, panlosBrand, panlosLegal]);
  const last = s.messages[3];
  last.envelope.text = "Este es el reverso de panlos brick";
  last.reading!.ingestion!.caption = { supplierReference: "panlos brick", supplierNotes: null, products: [], pendingFacts: null };
  assert.equal(explicitCardReference(last), "panlos brick"); assert.equal(cardMentionsReference(s.messages[2], "panlos brick"), true);
  s.state.ingestion = undefined; s.state.ingestion = buildEvidenceGraph(s);
  const suppliers = s.state.ingestion.loads.filter((load) => load.type === "SUPPLIER");
  assert.equal(suppliers.length, 2, JSON.stringify(s.state.ingestion.loads)); assert.equal(s.state.ingestion.loads.filter((load) => load.type === "PRODUCT").length, 0);
  assert.deepEqual(suppliers.map((load) => load.assetIds.length).sort(), [2, 2]);
  const panlos = suppliers.find((load) => load.assetIds.includes(last.id))!;
  assert.equal(panlos.name, "HUADA TOY CO., LTD."); assert.ok(panlos.reasons.includes("USER_EXPLICIT_CARD_REFERENCE"));
  assert.ok(s.state.ingestion.groupingAttempts?.some((attempt) => attempt.assetB === last.id && attempt.reasons.includes("USER_EXPLICIT_CARD_REFERENCE") && attempt.decision === "GROUP"));
});
test("reconexión masiva conserva 15 tarjetas, 20 productos, 8 audios y 7 textos como unidades independientes", () => {
  const cards = Array.from({ length: 15 }, (_, index) => visual({
    card: card({ companyName: `Marca${String(index + 1).padStart(2, "0")} Industrial`, branding: `MARCA ${index + 1}`, emails: [`contacto${index + 1}@proveedor${index + 1}.example`], phones: [], websites: [`proveedor${index + 1}.example`] }),
  }));
  const products = Array.from({ length: 20 }, (_, index) => visual({
    type: "PRODUCT", side: "UNKNOWN_SIDE", visual: `Producto físico modelo P-${index + 1} con volumen, base y laterales visibles`, card: null,
    product: { description: `Producto P-${index + 1}`, brand: null, model: `P-${index + 1}`, visibleText: [], packaging: false },
  }));
  const s = snapshot([...cards, ...products]);
  const addMessage = (type: "AUDIO" | "TEXT", index: number, text: string) => {
    const id = randomUUID();
    s.messages.push({
      id, sequence: s.messages.length + 1, sentAt: new Date((50 - index) * 1_000),
      envelope: { instance: s.instance, phone: s.phone, messageId: id, type, text: type === "TEXT" ? text : null, media: null, sentAt: new Date((50 - index) * 1_000).toISOString() },
      reading: { complete: true, transcript: type === "AUDIO" ? text : undefined, segments: [{ id: `${id}:1`, text }], ingestion: { status: "PARSED", stage: "parsed", attempts: [], loadIds: [], trustedText: text } },
    });
  };
  for (let index = 0; index < 8; index++) addMessage("AUDIO", index, `Marca${String(index + 1).padStart(2, "0")} Industrial: nota de voz comercial ${index + 1}`);
  for (let index = 0; index < 7; index++) addMessage("TEXT", index + 8, `Marca${String(index + 9).padStart(2, "0")} Industrial: observación comercial ${index + 1}`);
  s.revision = s.messages.length;
  s.state.ingestion = undefined;
  s.state.ingestion = buildEvidenceGraph(s);
  assert.equal(s.messages.length, 50);
  assert.equal(s.state.ingestion.assets.length, 50);
  assert.equal(s.state.ingestion.loads.filter((load) => load.type === "SUPPLIER").length, 15);
  assert.equal(s.state.ingestion.loads.filter((load) => load.type === "PRODUCT").length, 20);
  assert.equal(s.state.ingestion.loads.filter((load) => load.type === "EVIDENCE").length, 0);
  assert.equal(new Set(s.state.ingestion.assets.map((asset) => asset.id)).size, 50);
  assert.equal(s.state.ingestion.links.filter((link) => ["FACTS_FOR", "CONTEXT_FOR"].includes(link.relationship) && link.sourceSegmentId).length, 15);
  assert.equal(s.state.ingestion.links.filter((link) => link.confidence === "AMBIGUOUS").length, 0);
});
test("trade name/legal name requires auditable clarification; uncertain front still gets a candidate", () => {
  const s = snapshot([visual({ card: card({ companyName: "Example Blocks", uncertainFields: ["phones"] }) }), visual({ side: "BACK", card: card({ companyName: "Example Toy Factory Co., Ltd", emails: [], phones: [], websites: ["factory.test"] }) })]);
  assert.equal(s.state.ingestion!.loads.length, 2); assert.equal(s.state.ingestion!.groupingAttempts![0].decision, "AMBIGUOUS");
  assert.ok(s.state.ingestion!.links.some(l => l.relationship === "POSSIBLY_RELATED")); assert.ok(nextIngestionQuestion(s));
});
test("readable brand-only supplier card is incomplete, never ambiguous reading or confirmed", () => {
  const s = snapshot([visual({ card: card({ companyName: null, emails: [], phones: [], websites: [] }) })]);
  const l = s.state.ingestion!.loads[0]; assert.equal(l.type, "SUPPLIER"); assert.equal(l.error?.type, "SUPPLIER_INCOMPLETE"); assert.equal(l.resourceId, undefined); assert.equal(s.state.ingestion!.assets[0].readability, "readable"); assert.match(nextIngestionQuestion(s)!.question, /Cuál es el nombre del proveedor/u);
});
test("WAITING accepts an explicit quoted question, expected number or unambiguous reference; independent uploads do not", () => {
  const s = snapshot([]); const state = s.state as AgentState; state.agent.pending = { type: "CLARIFICATION", revision: 1, text: "Elegí empresa", options: [{ id: "company", label: "Demo Company" }] }; state.question = "Elegí empresa";
  const e: BurstEnvelope = { instance: "test", phone: "123", messageId: "new", type: "IMAGE", media: null, text: null, sentAt: null };
  assert.equal(answersPending(e, state), false); assert.equal(answersPending({ ...e, quotedMessageId: "question" }, state, ["question"]), true);
  assert.equal(answersPending({ ...e, type: "TEXT", text: "1" }, state), true); assert.equal(answersPending({ ...e, type: "TEXT", text: "2" }, state), false);
  assert.equal(answersPending({ ...e, type: "TEXT", text: "Respuesta a la pregunta: Demo Company" }, state), true);
});
for (const name of ["Dragino-style", "Fujie-style"]) test(`historical resolution: ${name} retains original readings and removes review action`, () => {
  const old = snapshot([visual()]); const current = snapshot([visual()]);
  const load = old.state.ingestion!.loads[0]; load.status = "NEEDS_REVIEW"; load.error = { type: "AMBIGUOUS_CARD_READING", stage: "reconciliation", retryable: false };
  const reading = old.messages[0].reading!; reading.ingestion!.status = "NEEDS_REVIEW"; reading.ingestion!.error = load.error; updateGraphSummary(old.state.ingestion!);
  const original = structuredClone(reading);
  const resolved = current.state.ingestion!.loads[0]; resolved.status = "PROCESSED"; resolved.resourceId = "supplier";
  assert.equal(resolveHistoricalSnapshot(old, current, resolved), 1); assert.equal(load.resolution?.status, "RESOLVED_BY_LATER_EVIDENCE"); assert.equal(load.status, "NEEDS_REVIEW");
  const meta = structuredClone(reading.ingestion!); delete meta.resolution; assert.deepEqual(meta, original.ingestion); assert.equal(reading.ocr, original.ocr);
  assert.equal(old.state.ingestion!.summary.needsReview, 0); assert.equal(nextIngestionQuestion(old), null); assert.equal(resolveHistoricalSnapshot(old, current, resolved), 0);
});
test("doubtful identity does not supersede old evidence or accept similar company names", () => {
  const old = snapshot([visual()]); const current = snapshot([visual({ card: card({ companyName: "Unrelated Factory" }) })]); old.state.ingestion!.loads[0].status = "NEEDS_REVIEW"; old.state.ingestion!.loads[0].error = { type: "AMBIGUOUS_CARD_READING", stage: "reconciliation", retryable: false }; const l = current.state.ingestion!.loads[0]; l.status = "PROCESSED"; l.resourceId = "supplier";
  assert.equal(resolveHistoricalSnapshot(old, current, l), 0);
  assert.equal(strongSupplierIdentity({ names: ["ABC"], emails: [], domains: [], phones: [] }, { names: ["ABC"], emails: [], domains: [], phones: [] }).matches, false);
});
test("supplier lookup supports exact email/domain/phone without substring contact matches", () => {
  const r = { companyName: "Example", website: "https://www.example.test", contacts: [{ type: "EMAIL", rawText: "ava@example.test" }, { type: "PHONE", rawText: "+86 138-1234-5678" }] };
  for (const q of ["AVA@example.test", "example.test", "+8613812345678"]) assert.equal(supplierSearchMatches(r, q, false), true);
  for (const q of ["ava", "other@example.test", "notexample.test", "+8613812345679"]) assert.equal(supplierSearchMatches(r, q, false), false);
});

test("PostgreSQL: independent burst, explicit replies, existing resource receipt and historical annotations", { skip: !process.env.EVAL_AGENT_DATABASE_URL }, async t => {
  const prisma = localAgentDatabase(); const env = await createAgentEnvironment(prisma, { trips: [{ id: "trip", name: "China", companies: [{ id: "company", name: "Demo" }], suppliers: [{ id: "existing", captureId: "capture", name: "Example Technology Co., Ltd", companyId: "company", city: null }] }] });
  const supplierId = env.id("existing");
  const extraction = { async extractReading(text: string) { return { extractedFields: {}, evidence: [], reviewFields: [], rawSource: { type: "TEXT" as const, text } }; } };
  const persist = async (s: BurstSnapshot) => { s.userId = env.userId; s.state.tripId = env.id("trip"); for (const m of s.messages) { m.reading!.storageKey = `boundary/${m.id}`; m.reading!.mimeType = "image/jpeg"; await env.storage.put({ key: m.reading!.storageKey, body: new Uint8Array([0xff, 0xd8, 0xff, 1]), contentType: "image/jpeg" }); } await env.persist(s); s.phone = "5491112345678"; };
  try {
    await prisma.supplier.update({ where: { id: supplierId }, data: { website: "www.example.test", contacts: { create: [{ rawText: "ava@example.test", type: "EMAIL", tripId: env.id("trip"), createdById: env.userId }, { rawText: "+8613812345678", type: "PHONE", tripId: env.id("trip"), createdById: env.userId }] } } });
    await t.test("iWo-style existing provider resolves exact supplier, durable idempotent event and PROCESSED load", async () => {
      const s = snapshot([visual()]); await persist(s); const state = s.state as AgentState; const l = state.ingestion!.loads[0];
      const count = await prisma.supplier.count({ where: { tripId: env.id("trip") } });
      const receipt = await env.domain.resolveExistingSupplier(s, l.id); assert.ok(receipt); recordReceipt(state, receipt!);
      assert.equal(receipt!.tool, "resolve_existing_resource"); assert.equal(receipt!.data?.event, "RESOLVED_EXISTING_RESOURCE"); assert.equal(l.resourceId, supplierId); assert.equal(l.status, "PROCESSED"); assert.equal(await prisma.supplier.count({ where: { tripId: env.id("trip") } }), count);
      assert.equal(await prisma.whatsAppAgentOperation.count({ where: { burstId: s.id, tool: "create_supplier_draft" } }), 0);
      assert.deepEqual(await env.domain.resolveExistingSupplier(s, l.id), receipt); assert.equal(await prisma.whatsAppAgentOperation.count({ where: { burstId: s.id } }), 1);
      state.ingestion!.activeLoadId = l.id; state.agent.receipts.push({ operationId: "history", tool: "create_supplier_draft", id: "history", status: "COMPLETED", completedRevision: 0, logicalLoadIds: ["other"] });
      const tools = new AgentTools({ domain: env.domain, extraction, catalog: env.catalog, async checkpoint() {} }); await tools.execute("finish_turn", { response: null, guidance: false }, s, state); assert.equal(tools.done, true);
      await prisma.whatsAppBurst.update({ where: { id: s.id }, data: { status: "DONE", leaseId: null } });
    });
    await t.test("existing supplier survives crash after audit effect, skips agent/create and never reaches no_progress", async () => {
      const s = snapshot([visual()]); await persist(s); let claimed = false; let crashed = false; let completed = false; let reply = "";
      const store = { async claim() { if (claimed) return []; claimed = true; return [s]; }, async catalog() { return env.catalog; }, async saveReading() {}, async finish(_snapshot: BurstSnapshot, _state: AgentState, text: string) { completed = true; reply = text; }, async retry() {}, async flushReplies() {} } as unknown as BurstStore;
      const service = new WhatsAppAgentService({ ingestion: true, store, domain: env.domain, reader: { async read(message) { assert.equal(message.reading?.complete, true); return message.reading!; } }, orchestrator: { async run() { assert.fail("Existing supplier must not call agent or create_supplier_draft"); } } as unknown as WhatsAppAgentOrchestrator, async save(_id, _revision, _lease, state) {
        if (!crashed && state.agent.receipts.some(r => r.tool === "resolve_existing_resource")) { crashed = true; throw new AgentCheckpoint(); }
        await env.save(s, state); return true;
      }, async send() { assert.fail("No real WhatsApp"); } });
      await service.processDue(1); assert.equal(completed, false);
      s.state = (await prisma.whatsAppBurst.findUniqueOrThrow({ where: { id: s.id } })).state as unknown as AgentState;
      claimed = false; await service.processDue(1); assert.equal(completed, true); assert.match(reply, /1 proveedor cargado/u); assert.match(reply, /Todo listo/u);
      assert.equal(s.state.ingestion!.loads[0].resourceId, supplierId); assert.equal(s.state.ingestion!.loads[0].status, "PROCESSED");
      assert.equal((s.state as AgentState).agent.termination?.reason, "completed"); assert.equal(await prisma.whatsAppAgentOperation.count({ where: { burstId: s.id, tool: "resolve_existing_resource" } }), 1);
      await prisma.whatsAppBurst.update({ where: { id: s.id }, data: { status: "DONE", leaseId: null } });
    });
    await t.test("A WAITING + 8 independent uploads creates B; quoted/numeric answers route to A and preserve question", async () => {
      const a = snapshot(Array.from({ length: 36 }, () => visual())); await persist(a);
      const user = await prisma.user.findUniqueOrThrow({ where: { id: env.userId } }); a.phone = user.whatsappPhone!;
      const state = a.state as AgentState; state.agent.pending = { type: "CLARIFICATION", revision: 36, text: "Elegí empresa", options: [{ id: env.id("company"), label: "Demo" }] }; state.question = "Elegí empresa"; state.outboundReplies = [{ revision: 36, messageId: "outbound-question" }];
      await prisma.whatsAppBurst.update({ where: { id: a.id }, data: { status: "WAITING", leaseId: null, phone: a.phone, state: JSON.parse(JSON.stringify(state)) } });
      const store = new PrismaBurstStore(prisma, { newVersion: 3, claimVersions: [3] });
      const e: BurstEnvelope = { instance: a.instance, phone: a.phone, messageId: randomUUID(), type: "IMAGE", text: null, media: null, sentAt: null };
      for (let i = 0; i < 8; i++) await store.receive({ ...e, messageId: randomUUID() });
      const rows = await prisma.whatsAppBurst.findMany({ where: { instance: a.instance, status: { not: "DONE" } }, include: { messages: true } }); assert.equal(rows.length, 2);
      const b = rows.find(r => r.id !== a.id)!; assert.equal(b.messages.length, 8); assert.equal(rows.find(r => r.id === a.id)!.messages.length, 36); assert.equal((rows.find(r => r.id === a.id)!.state as unknown as AgentState).agent.pending?.text, "Elegí empresa");
      await store.receive({ ...e, type: "TEXT", text: "1", quotedMessageId: "outbound-question", messageId: randomUUID() });
      assert.equal((await prisma.whatsAppBurst.findUniqueOrThrow({ where: { id: a.id } })).revision, 37); assert.equal((await prisma.whatsAppBurst.findUniqueOrThrow({ where: { id: b.id } })).revision, 8);
      await prisma.whatsAppBurst.updateMany({ where: { instance: a.instance }, data: { dueAt: new Date(0) } });
      const [first, second] = await Promise.all([store.claim(1), store.claim(1)]); assert.equal(first.length + second.length, 1, "one active worker per phone");
      await prisma.whatsAppBurst.updateMany({ where: { instance: a.instance }, data: { status: "DONE", leaseId: null } });
    });
    await t.test("an old image clarification cannot capture the 00:47 text sequence or its persisted-result queries", async () => {
      const waiting = snapshot([visual()]); await persist(waiting);
      const linkedPhone = (await prisma.user.findUniqueOrThrow({ where: { id: env.userId } })).whatsappPhone!;
      waiting.phone = linkedPhone;
      const stale = waiting.state as AgentState;
      stale.agent.pending = { type: "CLARIFICATION", revision: 1, text: "No llegó la imagen. ¿Podés reenviarla?", options: [] };
      stale.question = stale.agent.pending.text;
      stale.outboundReplies = [{ revision: 1, messageId: "stale-image-question" }];
      await prisma.whatsAppBurst.update({ where: { id: waiting.id }, data: { status: "WAITING", leaseId: null, phone: linkedPhone, state: JSON.parse(JSON.stringify(stale)) } });

      const supplierCount = await prisma.supplier.count({ where: { tripId: env.id("trip") } });
      const productCount = await prisma.supplierProduct.count({ where: { capture: { tripId: env.id("trip") } } });
      const store = new PrismaBurstStore(prisma, { newVersion: 3, claimVersions: [3] });
      const texts = ["Mm", "Ni idea", "J", "F", "J", "Ch", "V", "Cv", "Con", "Con", "V", "Ok??", "Cargaste todo?", "Que cargaste?", "Respondeme todo", "¿Qué productos guardé?", "Quiero organizar un viaje a China para conocer Beijing, Shanghái y otras ciudades. Necesito un itinerario completo con hoteles, trenes y actividades turísticas."];
      for (const text of texts) assert.equal(await store.receive({ instance: waiting.instance, phone: linkedPhone, messageId: randomUUID(), type: "TEXT", text, media: null, sentAt: null }), true);

      const old = await prisma.whatsAppBurst.findUniqueOrThrow({ where: { id: waiting.id }, include: { messages: true } });
      assert.equal(old.status, "WAITING");
      assert.equal(old.revision, 1);
      assert.equal((old.state as unknown as AgentState).agent.pending?.text, stale.agent.pending.text);
      const currentRows = await prisma.whatsAppBurst.findMany({ where: { instance: waiting.instance, phone: linkedPhone, id: { not: waiting.id }, status: "OPEN" }, orderBy: { createdAt: "asc" }, include: { messages: { orderBy: { receivedAt: "asc" } } } });
      const receivedTexts = currentRows.flatMap((row) => row.messages.map((message) => (message.envelope as unknown as BurstEnvelope).text));
      assert.deepEqual([...receivedTexts].sort(), [...texts].sort());
      assert.equal(currentRows.reduce((total, row) => total + row.revision, 0), texts.length);
      assert.equal(currentRows.filter((row) => row.messages.length === 1 && isIndependentConversationQuery((row.messages[0].envelope as unknown as BurstEnvelope).text)).length, 4, "cada consulta persistida tiene su propio turno");
      assert.equal(await prisma.supplier.count({ where: { tripId: env.id("trip") } }), supplierCount);
      assert.equal(await prisma.supplierProduct.count({ where: { capture: { tripId: env.id("trip") } } }), productCount);

      const currentRow = currentRows.find((row) => row.messages.some((message) => (message.envelope as unknown as BurstEnvelope).text === "¿Qué productos guardé?"))!;
      const current: BurstSnapshot = { ...currentRow, state: currentRow.state as unknown as BurstState, messages: currentRow.messages.map((message) => ({ ...message, envelope: message.envelope as unknown as BurstEnvelope, reading: message.reading as never })) };
      const persistedSuppliers = await env.domain.search(current, "SUPPLIER", env.id("trip"), "");
      assert.ok(persistedSuppliers.some((supplier) => supplier.id === supplierId), "la consulta independiente puede leer el catálogo persistido");
      assert.equal(receivedTexts.filter((text) => isIndependentConversationQuery(text)).length, 4);
      assert.equal(receivedTexts.filter((text) => isLowInformationText(text)).length, 11);
      await prisma.whatsAppBurst.updateMany({ where: { instance: waiting.instance }, data: { status: "DONE", leaseId: null } });
    });
    await t.test("a text quote after an unrelated image clarification resolves the cited text in another burst", async () => {
      const linkedPhone = (await prisma.user.findUniqueOrThrow({ where: { id: env.userId } })).whatsappPhone!;
      const source = snapshot([visual()]);
      source.phone = linkedPhone;
      source.messages[0].envelope.phone = linkedPhone;
      const citedText = "¿Cuáles son? Son cuatro proveedores.";
      source.messages[0].envelope = { ...source.messages[0].envelope, type: "TEXT", text: citedText, media: null };
      source.messages[0].reading = { complete: true, segments: [{ id: `${source.messages[0].id}:1`, text: citedText }] };
      await persist(source);
      source.phone = linkedPhone;
      await prisma.whatsAppBurst.update({ where: { id: source.id }, data: { status: "DONE", leaseId: null, phone: linkedPhone } });

      const imageQuestion = snapshot([visual()]);
      imageQuestion.phone = linkedPhone;
      imageQuestion.messages[0].envelope.phone = linkedPhone;
      await persist(imageQuestion);
      imageQuestion.phone = linkedPhone;
      const stale = imageQuestion.state as AgentState;
      stale.agent.pending = { type: "CLARIFICATION", revision: 1, text: "No llegó la imagen. ¿Podés reenviarla?", options: [] };
      stale.question = stale.agent.pending.text;
      stale.outboundReplies = [{ revision: 1, messageId: "missing-image-question" }];
      await prisma.whatsAppBurst.update({ where: { id: imageQuestion.id }, data: { status: "WAITING", leaseId: null, phone: linkedPhone, state: JSON.parse(JSON.stringify(stale)) } });

      const store = new PrismaBurstStore(prisma, { newVersion: 3, claimVersions: [3] });
      const replyId = randomUUID();
      assert.equal(await store.receive({
        instance: source.instance,
        phone: source.phone,
        messageId: replyId,
        type: "TEXT",
        text: "¿Podés ver qué te pregunté acá?",
        media: null,
        sentAt: null,
        quotedMessageId: source.messages[0].envelope.messageId,
      }), true);
      const received = await prisma.whatsAppBurstMessage.findUniqueOrThrow({ where: { instance_messageId: { instance: source.instance, messageId: replyId } }, include: { burst: { include: { messages: { orderBy: { sequence: "asc" } } } } } });
      assert.notEqual(received.burstId, imageQuestion.id, "La cita no puede quedar atrapada en la aclaración de otra imagen");
      const current: BurstSnapshot = {
        ...received.burst,
        state: received.burst.state as unknown as BurstState,
        messages: received.burst.messages.map((message) => ({ ...message, envelope: message.envelope as unknown as BurstEnvelope, reading: message.reading as never })),
      };
      const quoted = await env.domain.quotedEvidence(current);
      assert.equal(quoted.length, 1);
      assert.equal(quoted[0].status, "READY");
      assert.equal(quoted[0].type, "TEXT");
      assert.equal(quoted[0].text, citedText);
      assert.equal((await prisma.whatsAppBurst.findUniqueOrThrow({ where: { id: imageQuestion.id } })).status, "WAITING");
      await prisma.whatsAppBurst.updateMany({ where: { instance: source.instance }, data: { status: "DONE", leaseId: null } });
    });
    await t.test("historical resolution persists metadata and does not rewrite OCR/status", async () => {
      const old = snapshot([visual()]); await persist(old); const l = old.state.ingestion!.loads[0]; l.status = "NEEDS_REVIEW"; l.error = { type: "AMBIGUOUS_CARD_READING", stage: "reconciliation", retryable: false }; old.messages[0].reading!.ingestion!.status = "NEEDS_REVIEW"; old.messages[0].reading!.ingestion!.error = l.error; updateGraphSummary(old.state.ingestion!);
      await prisma.whatsAppBurst.update({ where: { id: old.id }, data: { status: "WAITING", leaseId: null, state: JSON.parse(JSON.stringify(old.state)) } });
      await prisma.whatsAppBurstMessage.update({ where: { id: old.messages[0].id }, data: { reading: JSON.parse(JSON.stringify(old.messages[0].reading)) } });
      const s = snapshot([visual()]); await persist(s); const receipt = await env.domain.resolveExistingSupplier(s, s.state.ingestion!.loads[0].id); recordReceipt(s.state as AgentState, receipt!);
      assert.equal(await env.domain.resolveHistoricalEvidence(s, s.state.ingestion!.loads[0].id), 1);
      const row = await prisma.whatsAppBurstMessage.findUniqueOrThrow({ where: { id: old.messages[0].id } }); const reading = row.reading as unknown as typeof old.messages[0]["reading"];
      assert.equal(reading!.ocr, old.messages[0].reading!.ocr); assert.equal(reading!.ingestion!.status, "NEEDS_REVIEW"); assert.equal(reading!.ingestion!.resolution!.resourceId, supplierId); assert.equal(reading!.ingestion!.resolution!.originalStatus, "NEEDS_REVIEW");
      assert.equal((await prisma.whatsAppBurst.findUniqueOrThrow({ where: { id: old.id } })).state && ((await prisma.whatsAppBurst.findUniqueOrThrow({ where: { id: old.id } })).state as unknown as AgentState).ingestion!.summary.needsReview, 0);
      await prisma.whatsAppBurst.update({ where: { id: s.id }, data: { status: "DONE", leaseId: null } });
    });
    await t.test("exact contact search stays scoped and never accepts changed digits", async () => {
      const s = snapshot([]); s.userId = env.userId;
      for (const q of ["ava@example.test", "example.test", "+86 138-1234-5678"]) assert.deepEqual((await env.domain.search(s, "SUPPLIER", env.id("trip"), q)).map(r => r.id), [supplierId]);
      assert.equal((await env.domain.search(s, "SUPPLIER", env.id("trip"), "+8613812345679")).length, 0); await assert.rejects(env.domain.search(s, "SUPPLIER", "unauthorized", "ava@example.test"), /autorizado/u);
    });
  } finally { await env.cleanup(); await prisma.$disconnect(); }
});

test("classifier response format enforces closed nullable text fields without changing acceptance threshold", async () => {
  await readOriginalImage({ async post(_path, body) {
    const request = body as { response_format: { type: string; json_schema: { strict: boolean; schema: { additionalProperties: boolean; properties: { card: { properties: { branding: { type: string[] } } } } } } } };
    assert.equal(request.response_format.type, "json_schema"); assert.equal(request.response_format.json_schema.strict, true); assert.equal(request.response_format.json_schema.schema.additionalProperties, false); assert.deepEqual(request.response_format.json_schema.schema.properties.card.properties.branding.type, ["string", "null"]);
    return { choices: [{ message: { content: JSON.stringify(visual()) } }] };
  } }, new Uint8Array([1]), "image/jpeg");
});
test("delivery ID callback exposes the actual question ID and never enters the outbound JSON", async () => {
  const { createEvolutionClient } = await import("../../lib/channels/evolution/client.ts"); let id: string | undefined;
  const client = createEvolutionClient({ apiUrl: "https://example.test", apiKey: "test", instance: "test", async fetch(_url, init) { assert.deepEqual(JSON.parse(init!.body as string), { number: "123", text: "Pregunta" }); return Response.json({ key: { id: "actual-question" } }); } });
  await client.sendText({ number: "123", text: "Pregunta", onSentMessageId(messageId) { id = messageId; } }); assert.equal(id, "actual-question");
});
test("resolved historical review question is refreshed without erasing an approval", () => {
  const old = snapshot([visual()]); const current = snapshot([visual()]); const l = old.state.ingestion!.loads[0]; l.status = "NEEDS_REVIEW"; l.error = { type: "AMBIGUOUS_CARD_READING", stage: "reconciliation", retryable: false }; old.messages[0].reading!.ingestion!.status = "NEEDS_REVIEW";
  const state = old.state as AgentState; state.agent.pending = { type: "CLARIFICATION", text: "Quedaron 1 evidencias para revisar", revision: 1, options: [] }; state.question = state.agent.pending.text;
  const resolved = current.state.ingestion!.loads[0]; resolved.status = "PROCESSED"; resolved.resourceId = "supplier";
  assert.equal(resolveHistoricalSnapshot(old, current, resolved), 1); assert.equal(state.agent.pending, null); assert.equal(state.question, null);
  const pending = { type: "APPROVAL" as const, proposalId: "proposal", text: "¿Confirmás?", revision: 1, options: [] }; state.agent.pending = pending; state.question = pending.text;
  resolveHistoricalSnapshot(old, current, resolved); assert.deepEqual(state.agent.pending, pending);
});

test("refreshing an older proposal receipt preserves its checkpointed load attribution", () => {
  const s = snapshot([visual()]); const state = s.state as AgentState; const l = state.ingestion!.loads[0];
  const receipt = { operationId: "proposal", id: "supplier", name: "Example", tool: "update_supplier", status: "PROPOSED", logicalLoadIds: [l.id] };
  recordReceipt(state, receipt); const refreshed = { ...receipt }; delete (refreshed as { logicalLoadIds?: string[] }).logicalLoadIds; recordReceipt(state, refreshed);
  assert.deepEqual(state.agent.receipts[0].logicalLoadIds, [l.id]); assert.equal(state.agent.receipts[0].status, "PROPOSED");
});
