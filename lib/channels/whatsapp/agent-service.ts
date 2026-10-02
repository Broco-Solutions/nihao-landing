import type { BurstEnvelope, BurstReading, BurstMessage, BurstStore } from "./burst-types.ts";
import { AgentCheckpoint, AgentSuperseded, type AgentDomain, type AgentState } from "./agent-contract.ts";
import type { WhatsAppAgentOrchestrator } from "./agent-orchestrator.ts";

export class WhatsAppAgentService {
  constructor(private readonly deps: { store: BurstStore; orchestrator: WhatsAppAgentOrchestrator; domain: AgentDomain; save(snapshotId: string, revision: number, leaseId: string | null, state: AgentState): Promise<boolean>; reader: { read(message: BurstMessage, save: (reading: BurstReading) => Promise<void>): Promise<BurstReading> }; send(phone: string, text: string): Promise<void> }) {}
  receive(envelope: BurstEnvelope) { return this.deps.store.receive(envelope); }
  async processDue(limit = 10) {
    const d = this.deps; const deadline = Date.now() + 220_000;
    for (let index = 0; index < limit && Date.now() < deadline; index++) {
      const [snapshot] = await d.store.claim(1); if (!snapshot) break;
      try {
        const catalog = await d.store.catalog(snapshot.userId);
        if (!catalog.trips.length) throw new Error("Contexto autorizado revocado");
        for (const message of snapshot.messages) {
          if (Date.now() + 30_000 > deadline) throw new AgentCheckpoint();
          message.reading = await d.reader.read(message, (reading) => d.store.saveReading(message.id, reading));
        }
        const { state, text } = await d.orchestrator.run(snapshot, catalog, async (state) => {
          if (!(await d.save(snapshot.id, snapshot.revision, snapshot.leaseId, state))) throw new AgentSuperseded();
        }, deadline);
        await d.store.finish(snapshot, state, text);
        if (state.agent.pending?.proposalId) await d.domain.displayed(snapshot, state.agent.pending.proposalId);
        console.info("WhatsApp agent processed", { burstId: snapshot.id, revision: snapshot.revision, rounds: state.agent.rounds, operationCount: state.agent.receipts.length, pending: Boolean(state.question) });
      } catch (error) {
        await d.store.retry(snapshot, error instanceof AgentCheckpoint || error instanceof AgentSuperseded);
        console.error("WhatsApp agent retry", { burstId: snapshot.id, revision: snapshot.revision, error: error instanceof Error ? error.name : "UnknownError" });
        if (error instanceof AgentCheckpoint) break;
      }
    }
    await d.store.flushReplies(d.send);
  }
}
