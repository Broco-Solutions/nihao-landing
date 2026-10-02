import type { BurstCatalog, BurstEnvelope, BurstGroup, BurstMessage, BurstPlan, BurstReading, BurstSnapshot, BurstState, BurstStore } from "./burst-types.ts";

export interface BurstDependencies {
  store: BurstStore;
  reader: { read(message: BurstMessage, save: (reading: BurstReading) => Promise<void>): Promise<BurstReading> };
  interpreter: { interpret(snapshot: BurstSnapshot, catalog: BurstCatalog): Promise<BurstPlan> };
  materialize(snapshot: BurstSnapshot, group: BurstGroup): Promise<string | { captureId: string; productId: string }>;
  send(phone: string, text: string): Promise<void>;
}

class BurstCheckpoint extends Error {}

export class WhatsAppBurstService {
  constructor(private readonly dependencies: BurstDependencies) {}
  receive(envelope: BurstEnvelope) { return this.dependencies.store.receive(envelope); }

  async processDue(limit = 10): Promise<void> {
    const d = this.dependencies;
    const deadline = Date.now() + 220_000;
    for (let index = 0; index < limit && Date.now() < deadline; index++) {
      const [snapshot] = await d.store.claim(1);
      if (!snapshot) break;
      try {
        const catalog = await d.store.catalog(snapshot.userId, true);
        if (!catalog.trips.length) throw new Error("La autorización del viajero cambió");
        let state: BurstState;
        if (snapshot.status === "COMMITTING") state = snapshot.state;
        else {
          for (const message of snapshot.messages) {
            if (Date.now() > deadline) throw new BurstCheckpoint();
            message.reading = await d.reader.read(message, async (reading) => {
              await d.store.saveReading(message.id, reading);
              if (Date.now() > deadline) throw new BurstCheckpoint();
            });
          }
          // Pending clarifications always go through the global interpreter with their question.
          state = await d.interpreter.interpret(snapshot, catalog);
          if (!(await d.store.reserve(snapshot, state))) {
            await d.store.retry(snapshot);
            continue;
          }
          snapshot.status = "COMMITTING";
          snapshot.state = state;
        }
        for (const group of state.groups) {
          if (group.captureId || !group.certain || !state.tripId || !group.companyId || (group.kind === "PRODUCT" && !group.supplierId)) continue;
          // Recheck permissions at the write boundary, including on resumed reservations.
          if (!catalog.trips.some((t) => t.id === state.tripId && t.companies.some((c) => c.id === group.companyId))) throw new Error("Contexto revocado");
          const result = await d.materialize(snapshot, group);
          if (typeof result === "string") group.captureId = result;
          else { group.captureId = result.captureId; group.productId = result.productId; }
        }
        const saved = state.groups.filter((g) => g.captureId).length;
        const productCount = state.groups.filter((g) => g.productId).length;
        const supplierCount = saved - productCount;
        const summary = [supplierCount ? `${supplierCount} ${supplierCount === 1 ? "borrador de proveedor guardado" : "borradores de proveedores guardados"}.` : "", productCount ? `${productCount} ${productCount === 1 ? "producto asociado" : "productos asociados"} como borrador a ${[...new Set(state.groups.filter((g) => g.productId).map((g) => catalog.trips.find((t) => t.id === state.tripId)?.suppliers?.find((s) => s.id === g.supplierId)?.name ?? "su proveedor"))].join(", ")}. Revisá sus datos y confirmá en la sección Productos de la web.` : ""].filter(Boolean).join("\n");
        const text = [state.notice ?? "", summary, supplierCount ? "Revisá y confirmá los borradores de proveedores en la web de Nihao." : "", state.question ?? ""].filter(Boolean).join("\n\n");
        await d.store.finish(snapshot, state, text);
        console.info("WhatsApp burst processed", { burstId: snapshot.id, revision: snapshot.revision, evidenceCount: snapshot.messages.length, draftCount: saved, pending: Boolean(state.question) });
      } catch (error) {
        await d.store.retry(snapshot, error instanceof BurstCheckpoint);
        if (error instanceof BurstCheckpoint) break;
        console.error("WhatsApp burst retry", { burstId: snapshot.id, revision: snapshot.revision, error: error instanceof Error ? error.name : "UnknownError" });
      }
    }
    await d.store.flushReplies(d.send);
  }
}
