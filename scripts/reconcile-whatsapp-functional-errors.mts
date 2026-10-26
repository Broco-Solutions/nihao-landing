import { getPrisma } from "../lib/auth/prisma.ts";
import type { AgentFunctionalRemediation } from "../lib/channels/whatsapp/agent-contract.ts";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const value = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const release = value("--release");
const actor = value("--actor") ?? "ops:incident-reconciliation";
const resolution = value("--resolution") ?? "TEST_TRAFFIC";
const valueOptions = new Set(["--release", "--actor", "--resolution"]);
const ids: string[] = [];
for (let index = 0; index < args.length; index++) {
  if (valueOptions.has(args[index])) { index++; continue; }
  if (args[index] === "--apply") continue;
  ids.push(args[index]);
}

if (!release || release.length < 7) throw new Error("--release requiere el commit desplegado");
if (!["TEST_TRAFFIC", "MANUAL_REVIEW", "QUERY_RETRY_AVAILABLE"].includes(resolution)) throw new Error("--resolution inválida");
if (!ids.length) throw new Error("Indicá al menos un burst ID");

const prisma = getPrisma();

try {
  const bursts = await prisma.whatsAppBurst.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, status: true, revision: true, updatedAt: true, state: true,
      operations: { select: { status: true } },
      replies: { select: { status: true } },
      messages: { select: { envelope: true, storageStatus: true } },
    },
  });
  const byId = new Map(bursts.map((burst) => [burst.id, burst]));
  const plans = ids.map((id) => {
      const burst = byId.get(id);
      if (!burst) throw new Error(`Ráfaga inexistente: ${id}`);
      const state = structuredClone(burst.state) as {
        agent?: { termination?: { reason?: string; revision?: number; errorCode?: string; failedTool?: string }; functionalRemediation?: AgentFunctionalRemediation };
        ingestion?: { loads?: Array<{ status?: unknown; resolution?: unknown }> };
      };
      const termination = state.agent?.termination;
      if (burst.status !== "WAITING" || termination?.reason !== "tool_error" || typeof termination.revision !== "number" || typeof termination.errorCode !== "string" || typeof termination.failedTool !== "string") throw new Error(`La ráfaga ${id} no es un error funcional conciliable`);
      if (burst.operations.some((operation) => !["COMPLETED", "CANCELLED", "EXPIRED", "STALE"].includes(operation.status))) throw new Error(`La ráfaga ${id} tiene operaciones abiertas`);
      if (burst.replies.some((reply) => ["PENDING", "SENDING", "DELIVERY_FAILED", "DELIVERY_UNKNOWN"].includes(reply.status)) || !burst.replies.some((reply) => ["DELIVERED", "READ", "PLAYED"].includes(reply.status))) throw new Error(`La ráfaga ${id} no tiene entrega confirmada`);
      if (!burst.messages.length || burst.messages.some((message) => String((message.envelope as { type?: unknown }).type ?? "UNKNOWN") === "TEXT" ? message.storageStatus !== "NOT_REQUIRED" : message.storageStatus !== "STORED")) throw new Error(`La ráfaga ${id} tiene fuentes sin conservación durable`);
      const loads = Array.isArray(state.ingestion?.loads) ? state.ingestion.loads : [];
      if (loads.some((load: { status?: unknown; resolution?: unknown }) => !["PROCESSED", "NEEDS_REVIEW", "FAILED"].includes(String(load.status ?? "")) && !load.resolution)) throw new Error(`La ráfaga ${id} conserva trabajo técnico activo`);
      const existing = state.agent?.functionalRemediation as AgentFunctionalRemediation | undefined;
      if (existing) {
        const same = existing.status === "RESOLVED" && existing.release === release && existing.resolution === resolution
          && existing.termination?.revision === termination.revision && existing.termination?.errorCode === termination.errorCode && existing.termination?.failedTool === termination.failedTool;
        if (!same) throw new Error(`La ráfaga ${id} ya tiene otra conciliación`);
        return { id, burst, state, changed: false, remediation: existing };
      }
      const remediation: AgentFunctionalRemediation = {
        status: "RESOLVED",
        resolution: resolution as AgentFunctionalRemediation["resolution"],
        resolvedAt: new Date().toISOString(),
        release,
        actor,
        termination: { revision: termination.revision, errorCode: termination.errorCode, failedTool: termination.failedTool },
      };
      if (!state.agent) throw new Error(`La ráfaga ${id} no tiene estado de agente`);
      state.agent.functionalRemediation = remediation;
      return { id, burst, state, changed: apply, remediation };
  });
  if (apply) await prisma.$transaction(async (tx) => {
    for (const plan of plans.filter((item) => item.changed)) {
      const updated = await tx.whatsAppBurst.updateMany({ where: { id: plan.id, revision: plan.burst.revision, status: "WAITING", updatedAt: plan.burst.updatedAt }, data: { state: JSON.parse(JSON.stringify(plan.state)) } });
      if (updated.count !== 1) throw new Error(`La ráfaga ${plan.id} cambió durante la conciliación`);
    }
  }, { maxWait: 10_000, timeout: 30_000 });
  const results = plans.map(({ id, changed, remediation }) => ({ id, changed, remediation }));
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", count: results.length, results }));
} finally {
  await prisma.$disconnect();
}
