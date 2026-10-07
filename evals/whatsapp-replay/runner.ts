import { AgentCheckpoint } from "../../lib/channels/whatsapp/agent-contract.ts";
import { ProviderHttpError } from "../../lib/channels/whatsapp/operational-runtime.ts";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createAgentEnvironment, localAgentDatabase } from "../whatsapp-agent/environment.ts";
import { BurstReader } from "../../lib/channels/whatsapp/burst-reader.ts";
import { WhatsAppAgentService } from "../../lib/channels/whatsapp/agent-service.ts";
import { WhatsAppAgentOrchestrator, WHATSAPP_AGENT_PROMPT } from "../../lib/channels/whatsapp/agent-orchestrator.ts";
import { createWhatsAppAIClient, OPENAI_AGENT_MODEL, OPENAI_AGENT_REASONING_EFFORT } from "../../lib/channels/whatsapp/agent-provider.ts";
import { MistralExtractionProvider } from "../../lib/bot/extraction/mistral-extraction-provider.ts";
import { MistralBatchAnalyzer } from "../../lib/channels/whatsapp/batch-association.ts";
import { createMistralTranscriptionProviderFromEnvironment } from "../../lib/bot/transcription.ts";
import { AGENT_TOOLS, type AgentDomain, type AgentState, type AgentWrite } from "../../lib/channels/whatsapp/agent-contract.ts";
import type { BurstReading, BurstSnapshot, BurstStore } from "../../lib/channels/whatsapp/burst-types.ts";
import { fixtureAsset, loadFixture } from "./fixture.ts";
import { hash, IdentityMap, ReplayTape, ReplayMismatch, type TapeData } from "./tape.ts";
import { buildReport } from "./report.ts";

export const REPLAY_CONFIG = { version: 1, model: OPENAI_AGENT_MODEL, reasoning: OPENAI_AGENT_REASONING_EFFORT, promptHash: hash(WHATSAPP_AGENT_PROMPT), schemasHash: hash(AGENT_TOOLS), pipelineHash: hash([...["burst-routing", "supplier-identity", "historical-resolution", "burst-reader", "multimodal-reading", "multimodal-ingestion", "evidence-grouping", "agent-policy", "agent-tools", "prisma-agent-domain", "agent-orchestrator", "agent-service", "agent-provider", "batch-association"].map((name) => `channels/whatsapp/${name}.ts`), "bot/extraction/mistral-extraction-provider.ts", "bot/extraction/schema.ts", "bot/transcription.ts"].map((name) => readFileSync(new URL(`../../lib/${name}`, import.meta.url), "utf8"))), visualAcceptanceThreshold: 0.85 };
export const REPLAY_TAPE_CONFIG_HASH = hash({ model: REPLAY_CONFIG.model, reasoning: REPLAY_CONFIG.reasoning, pipelineHash: REPLAY_CONFIG.pipelineHash, promptHash: REPLAY_CONFIG.promptHash, schemasHash: REPLAY_CONFIG.schemasHash, version: REPLAY_CONFIG.version });
export async function replay(path: string, options: { live?: boolean; tape?: TapeData } = {}) {
  const start = performance.now();
  if (options.live && process.env.LIVE_AI !== "true") throw new Error("Live AI requiere LIVE_AI=true explícito");
  if (options.live && options.tape) throw new Error("Live y tape no se pueden combinar");
  const fixture = await loadFixture(path);
  if (options.live && process.env.WHATSAPP_AGENT_MODEL && process.env.WHATSAPP_AGENT_MODEL !== OPENAI_AGENT_MODEL) throw new Error("Replay live exige GPT-5.6 Luna");
  if (options.tape && (options.tape.version !== 1 || options.tape.configHash !== REPLAY_TAPE_CONFIG_HASH)) throw new ReplayMismatch("La configuración/prompt/schema difiere del tape grabado");
  if (!options.live && !options.tape && !fixture.agentMock) throw new Error("Deterministic requiere --tape o agentMock explícito");
  const prisma = localAgentDatabase();
  const env = await createAgentEnvironment(prisma, fixture.catalog).catch(async (error: unknown) => { await prisma.$disconnect(); throw error; });
  try {
    for (const identity of fixture.supplierIdentities ?? []) {
      const record = await prisma.supplier.findFirstOrThrow({ where: { id: env.id(identity.supplierId), createdById: env.userId } });
      await prisma.supplier.update({ where: { id: record.id }, data: { website: identity.website, contacts: { create: [...identity.emails.map(rawText => ({ type: "EMAIL" as const, rawText })), ...identity.phones.map(rawText => ({ type: "PHONE" as const, rawText }))].map(contact => ({ ...contact, tripId: record.tripId, createdById: env.userId })) } } });
    }
  } catch (error) { await env.cleanup(); await prisma.$disconnect(); throw error; }
  const identities = new IdentityMap(env.prefix); const tape = new ReplayTape(identities, options.live ? "live" : "deterministic", REPLAY_TAPE_CONFIG_HASH, options.tape);
  let generatedReport: ReturnType<typeof buildReport> | undefined; const aiUsage: Array<{ kind: string; durationMs: number; usage?: unknown }> = [];
  const writes: Array<{ tool: string; result?: unknown; error?: string }> = [];
  const checkpoints: Array<{ phase: string; assetId?: string; state: unknown }> = [];
  let current = fixture.messages[0]; let scriptIndex = 0; let calls = 0;
  const failures = new Map<string, number>();
  const visionAttempts = new Map<string, number>();
  let finished = false; let state: AgentState | undefined; let reply = ""; const retryReasons: string[] = [];
  try {
    const liveClient = options.live ? createWhatsAppAIClient() : undefined;
    const rawClient = { async post(p: string, b: unknown, signal: AbortSignal) {
      if (!liveClient) throw new Error("Sin respuesta mock: el replay determinístico no llama a red");
      const began = performance.now(); const request = b as { messages?: Array<{ content?: unknown }> };
      const kind = p === "/ocr" ? "ocr" : request.messages?.some((m) => Array.isArray(m.content)) ? "vision" : "luna";
      const call: typeof aiUsage[number] = { kind, durationMs: 0 }; aiUsage.push(call);
      try { const result = await liveClient.post(p, b, signal); call.usage = (result as { usage?: unknown; usage_info?: unknown }).usage ?? (result as { usage_info?: unknown }).usage_info; return result; }
      finally { call.durationMs = performance.now() - began; }
    } };
    const liveTranscription = options.live ? createMistralTranscriptionProviderFromEnvironment() : undefined;
    const ingestionClient = { async post(p: string, body: unknown, signal: AbortSignal) {
      const request = body as { messages?: Array<{ content?: unknown }>; response_format?: { type: string } };
      const kind = p === "/ocr" ? "ocr" : request.messages?.some((m) => Array.isArray(m.content)) ? "vision" : request.response_format?.type === "json_schema" ? "extraction" : "segmentation";
      return tape.call(kind, body, async () => {
        if (options.live) return rawClient.post(p, body, signal);
        if (current.mock?.failures?.stage === kind) {
          const key = `${current.id}:${kind}`; const attempts = failures.get(key) ?? 0; failures.set(key, attempts + 1);
          if (attempts < current.mock.failures.count) throw new ProviderHttpError("Mistral", current.mock.failures.status);
        }
        if (current.mock?.error === kind) throw new Error(`mock ${kind} failure`);
        const response = (value: unknown) => ({ choices: [{ message: { content: JSON.stringify(value) } }] });
        if (kind === "ocr") { if (current.mock?.ocr === undefined) throw new ReplayMismatch("Fixture sin respuesta OCR"); return { pages: [{ markdown: current.mock.ocr }] }; }
        if (kind === "vision") { const attempt = visionAttempts.get(current.id) ?? 0; visionAttempts.set(current.id, attempt + 1); const value = current.mock?.vision?.[Math.min(attempt, (current.mock?.vision?.length ?? 1) - 1)]; if (!value) throw new ReplayMismatch("Fixture sin respuesta visual para este intento"); return response(value); }
        const text = String(request.messages?.at(-1)?.content ?? "");
        if (kind === "segmentation") return response({ segments: [text] });
        const owner = fixture.messages.find((m) => m.mock?.ocr === text || m.mock?.transcript === text || m.text === text);
        const candidate = owner?.mock?.extraction;
        const fields = candidate?.extractedFields ?? (text === current.mock?.ocr ? { companyName: current.mock?.vision?.[0]?.card?.companyName ?? null } : {});
        const detected = Object.entries(fields).filter(([, value]) => value !== undefined && value !== null).map(([field]) => field);
        return response({ companyName: null, city: null, province: null, supplierType: "UNKNOWN", fob: null, moq: null, leadTime: null, category: null, interestScore: null, ...fields, contact: { name: fields.contact ?? null, email: null, phone: null, wechat: null }, detectedFields: detected, reviewFields: candidate?.reviewFields ?? [], missingFields: [], evidence: detected.map((field) => ({ field, confidence: 0.97, evidence: text })) });
      });
    } };
    // Only external response transport is substituted. Production parsers/validators run in both modes.
    const extraction = new MistralExtractionProvider({ client: ingestionClient, businessCards: { async resolve() { throw new Error("El replay usa originales de fixture, no attachments remotos"); } } });
    const reader = new BurstReader({ multimodal: true, storage: env.storage,
      client: { async getMedia() { return { bytes: new Uint8Array(await readFile(await fixtureAsset(path, current.asset!))), mimeType: current.mimeType! }; } },
      mistral: ingestionClient, extraction, analyzer: new MistralBatchAnalyzer(ingestionClient),
      transcription: { async transcribe(input) { return tape.call("transcription", { asset: current.id, hash: hash(Buffer.from(input.bytes).toString("base64")), mimeType: input.mimeType }, async () => {
        if (liveTranscription) return liveTranscription.transcribe(input);
        if (current.mock?.transcript === undefined) throw new ReplayMismatch("Fixture sin transcripción"); return { text: current.mock.transcript, model: "voxtral-mini-latest" };
      }); } },
    });
    const burstId = `replay_${hash(fixture.id).slice(0, 24)}`; const messageId = (id: string) => `${burstId}_${id}`;
    const snapshot: BurstSnapshot = { id: burstId, instance: "replay", userId: env.userId, phone: "5491112345678", revision: fixture.messages.length, leaseId: "replay-lease", status: "PROCESSING", state: { tripId: null, groups: [], question: null, controlIds: [], pendingRefs: [] }, messages: fixture.messages.map((m, i) => ({ id: messageId(m.id), sequence: i + 1, sentAt: new Date(m.timestamp), envelope: { instance: "replay", phone: "5491112345678", messageId: m.whatsappMessageId ?? messageId(m.id), type: m.type, text: m.text ?? null, sentAt: m.timestamp, quotedMessageId: m.quotedMessageId ? fixture.messages.some((f) => f.id === m.quotedMessageId) ? fixture.messages.find((f) => f.id === m.quotedMessageId)?.whatsappMessageId ?? messageId(m.quotedMessageId) : m.quotedMessageId : undefined, selectionId: m.selectionId, ...(m.context ? { replayContext: m.context } : {}), media: m.type === "TEXT" ? null : { key: { id: m.id, remoteJid: "replay@s.whatsapp.net", fromMe: false }, message: {} } }, reading: { segments: [], ...(m.priorOCR !== undefined ? { ocr: m.priorOCR } : {}), ...(m.priorTranscript !== undefined ? { transcript: m.priorTranscript, model: "fixture-prior" } : {}) } })) };
    await env.persist(snapshot);
    const domain: AgentDomain = { ...env.domain,
      async persistImageLoad(...args) { const r = await env.domain.persistImageLoad(...args); identities.observe(r); writes.push({ tool: r.tool, result: r }); return r; },
      async resolveExistingSupplier(...args) { const r = await env.domain.resolveExistingSupplier(...args); if (r) identities.observe(r); return r; },
      async resolveHistoricalEvidence(...args) { return env.domain.resolveHistoricalEvidence(...args); },
      async receipts(s) { const results = await env.domain.receipts(s); identities.observe(results); return results; },
      async write(s, input: AgentWrite) { const entry: typeof writes[number] = { tool: input.tool }; writes.push(entry); try { const r = await env.domain.write(s, input); identities.observe(r); entry.result = r; return r; } catch (error) { entry.error = error instanceof Error ? error.message : "Error"; throw error; } },
      async search(...args) { const r = await env.domain.search(...args); identities.observe(r); return r; }, async get(...args) { const r = await env.domain.get(...args); identities.observe(r); return r; },
      async pending(...args) { const r = await env.domain.pending(...args); identities.observe(r); return r; }, async resolve(...args) { const r = await env.domain.resolve(...args); identities.observe(r); return r; }, async displayed(...args) { return env.domain.displayed(...args); }, async recentMemory(...args) { return env.domain.recentMemory(...args); },
    };
    const agent = { async post(p: string, b: unknown, signal: AbortSignal) { return tape.call("agent", b, async () => {
      if (options.live) return rawClient.post(p, b, signal);
      const step = fixture.agentMock?.[scriptIndex++]; if (!step) throw new ReplayMismatch("Fixture agotó respuestas mock del agente");
      const input = b as { messages: Array<{ content: string; role: string }> }; const initial = JSON.parse(input.messages[1].content);
      const lastTool = [...input.messages].reverse().find((m) => m.role === "tool"); const last = lastTool ? JSON.parse(lastTool.content) : null;
      const refs: Record<string, unknown> = { "@trip": env.catalog.trips[0].id, "@company": env.catalog.trips[0].companies[0].id, "@seedSupplier": env.catalog.trips[0].suppliers?.[0]?.id, "@evidenceIds": last?.evidence?.map((e: { id: string }) => e.id), "@activeSources": initial.logicalLoads?.find((l: { id: string }) => l.id === initial.activeLoadId)?.assetIds.map((id: string) => ({ messageId: id, quote: null, role: "FACTS" })) };
      function fill(value: unknown): unknown { if (typeof value === "string") return value.startsWith("@message:") ? messageId(value.slice(9)) : value in refs ? refs[value] : value; if (Array.isArray(value)) return value.map(fill); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v)])); return value; }
      return { choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: `replay-call-${++calls}`, type: "function", function: { name: step.tool, arguments: JSON.stringify(fill(step.args)) } }] } }] };
    }); } };
    let claimed = false;
    const store = { async claim() { if (claimed) return []; claimed = true; return [snapshot]; }, async catalog() { return env.catalog; }, async saveReading(id: string, reading: BurstReading) { checkpoints.push({ phase: "asset", assetId: id, state: structuredClone(reading.ingestion) }); await prisma.whatsAppBurstMessage.update({ where: { id }, data: { reading: JSON.parse(JSON.stringify(reading)) } }); }, async finish(_s: BurstSnapshot, result: AgentState, text: string) { finished = true; state = result; reply = text; await env.save(snapshot, result); }, async retry(_s: BurstSnapshot, checkpoint: boolean) { retryReasons.push(checkpoint ? "checkpoint" : "worker_error"); state = snapshot.state as AgentState; }, async flushReplies() {} } as unknown as BurstStore;
    let assetsThisWindow = 0;
    const service = new WhatsAppAgentService({ assetConcurrency: 1, ingestion: true, store, domain, reader: { async read(message, save) { current = fixture.messages.find((m) => messageId(m.id) === message.id)!; const completed = message.reading?.complete; const result = await reader.read(message, save, snapshot.revision);
      if (!completed && fixture.operational && ++assetsThisWindow >= fixture.operational.checkpointEveryAssets) throw new AgentCheckpoint();
      return result; } }, orchestrator: new WhatsAppAgentOrchestrator({ domain, extraction, client: agent, model: OPENAI_AGENT_MODEL }), async save(_id, _rev, _lease, result) { checkpoints.push({ phase: "agent", state: { activeLoadId: result.ingestion?.activeLoadId, rounds: result.agent.rounds, termination: result.agent.termination, lastCall: result.agent.calls.at(-1)?.name } }); await env.save(snapshot, result); return true; }, async send() { throw new Error("Replay no permite enviar WhatsApp"); } });
    for (let worker = 0; worker < (fixture.operational?.maxWorkerRuns ?? 10) && !finished; worker++) {
      assetsThisWindow = 0; claimed = false; const previousRetries = retryReasons.length;
      await service.processDue(1);
      if (retryReasons.slice(previousRetries).includes("worker_error")) break;
      const nextAttempt = Math.min(...snapshot.messages.flatMap((m) => m.reading?.ingestion?.status === "PENDING_RETRY" && m.reading.ingestion.operational?.nextAttemptAt ? [m.reading.ingestion.operational.nextAttemptAt] : []));
      if (!finished && Number.isFinite(nextAttempt)) await new Promise((resolve) => setTimeout(resolve, Math.max(0, nextAttempt - Date.now())));
    }
    if (!finished && !retryReasons.includes("worker_error")) retryReasons.push("resume_limit");
    tape.finish();
    const operations = await prisma.whatsAppAgentOperation.findMany({ where: { burstId } });
    const persistedNotes: Record<string, string | null> = {};
    for (const load of state?.ingestion?.loads ?? []) if (load.resourceId && ["SUPPLIER", "PRODUCT"].includes(load.type)) {
      const preservedCapture = operations.some(o => (o.result as unknown as { logicalLoadIds?: string[]; data?: { preservedImageLoad?: boolean } }).logicalLoadIds?.includes(load.id) && (o.result as unknown as { data?: { preservedImageLoad?: boolean } }).data?.preservedImageLoad && o.tool === "create_supplier_draft");
      const record = await domain.get(snapshot, load.type === "PRODUCT" && !preservedCapture ? "PRODUCT" : "SUPPLIER", load.resourceId);
      persistedNotes[load.id] = typeof record.data.notes === "string" ? record.data.notes : null;
    }
    const report = buildReport({ persistedNotes, fixture, snapshot, state: state ?? snapshot.state as AgentState, writes, checkpoints, operations: operations.map((o) => ({ status: o.status, tool: o.tool, result: o.result })), reply, durationMs: performance.now() - start, tape, aiUsage, retryReasons, config: REPLAY_CONFIG, mode: options.live ? "live" : "deterministic", recordedUsage: options.tape?.providerCalls ?? [], gitSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), dirty: Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()) });
    generatedReport = report;
    return { report, tape: { ...tape.data(), providerCalls: aiUsage } };
  } finally { try { await env.cleanup(); } finally { await prisma.$disconnect(); if (generatedReport) generatedReport.ai.totalDurationMs = performance.now() - start; } }
}
