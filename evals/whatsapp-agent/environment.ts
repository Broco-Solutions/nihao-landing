import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.ts";
import type { BurstCatalog, BurstSnapshot } from "../../lib/channels/whatsapp/burst-types.ts";
import { PrismaAttachmentRepository } from "../../lib/bot/persistence/prisma-attachment-repository.ts";
import { AttachmentService } from "../../lib/bot/attachments.ts";
import { PrismaAgentDomain } from "../../lib/channels/whatsapp/prisma-agent-domain.ts";
import type { StorageProvider } from "../../lib/bot/storage/provider.ts";
import type { AgentState } from "../../lib/channels/whatsapp/agent-contract.ts";

export function localAgentDatabase() {
  const value = process.env.EVAL_AGENT_DATABASE_URL;
  if (!value) throw new Error("EVAL_AGENT_DATABASE_URL is required: exclusively local PostgreSQL /nihao_agent_test");
  const url = new URL(value);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/nihao_agent_test") throw new Error("Agent evals refuse nonlocal/project databases");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: value }) });
}
export async function createAgentEnvironment(prisma: PrismaClient, input: BurstCatalog) {
  const prefix = randomUUID(); const userId = `${prefix}-user`;
  const ids = new Map<string, string>(); const id = (key: string) => { if (!ids.has(key)) ids.set(key, `${prefix}-${key}`); return ids.get(key)!; };
  const catalog: BurstCatalog = { trips: input.trips.map((t) => ({ id: id(t.id), name: t.name, companies: t.companies.map((c) => ({ id: id(c.id), name: c.name })), suppliers: t.suppliers?.map((s) => ({ ...s, id: id(s.id), captureId: id(s.captureId), companyId: id(s.companyId) })) })) };
  await prisma.user.create({ data: { id: userId, name: "Agent eval", email: `${prefix}@example.test`, whatsappPhone: `549${prefix.replace(/\D/g, "").slice(0, 10).padEnd(10, "0")}` } });
  for (const trip of catalog.trips) {
    await prisma.trip.create({ data: { id: trip.id, name: trip.name, status: "ACTIVE", createdById: userId, members: { create: { userId, role: "TRAVELER" } } } });
    for (const company of trip.companies) {
      const base = await prisma.company.create({ data: { name: company.name, normalizedName: `${prefix}-${company.name.toLowerCase()}` } });
      await prisma.tripCompany.create({ data: { id: company.id, tripId: trip.id, catalogCompanyId: base.id, active: true, members: { create: { userId } } } });
    }
    for (const supplier of trip.suppliers ?? []) {
      await prisma.supplierCapture.create({ data: { id: supplier.captureId, tripId: trip.id, companyId: supplier.companyId, createdById: userId, status: "CONFIRMED", sourceType: "TEXT", companyName: supplier.name, city: supplier.city, missingFields: [], reviewFields: [], acknowledgedUnknownFields: [], evidence: [] } });
      await prisma.supplier.create({ data: { id: supplier.id, captureId: supplier.captureId, tripId: trip.id, companyId: supplier.companyId, createdById: userId, companyName: supplier.name, city: supplier.city, pendingFields: [] } });
    }
  }
  const objects = new Map<string, Uint8Array>();
  const storage: StorageProvider = { async put(input) { objects.set(input.key, Uint8Array.from(input.body as Uint8Array)); }, async get(key) { const b = objects.get(key); return b ? new Response(Uint8Array.from(b)).body : null; }, async delete(key) { objects.delete(key); }, async signedUrl() { return "local-eval"; } };
  const repository = new PrismaAttachmentRepository(prisma);
  const domain = new PrismaAgentDomain(prisma, { storage, repository, attachments: new AttachmentService(repository, storage) });
  async function persist(snapshot: BurstSnapshot) {
    snapshot.instance = `agent-eval-${prefix}`;
    await prisma.whatsAppBurst.create({ data: { id: snapshot.id, userId, instance: snapshot.instance, phone: "5491112345678", version: 3, revision: snapshot.revision, status: "PROCESSING", leaseId: snapshot.leaseId, dueAt: new Date(0), state: JSON.parse(JSON.stringify(snapshot.state)), messages: { create: snapshot.messages.map((m) => ({ id: m.id, instance: snapshot.instance, messageId: m.id, sequence: m.sequence, envelope: JSON.parse(JSON.stringify(m.envelope)), reading: JSON.parse(JSON.stringify(m.reading)) })) } } });
  }
  async function save(snapshot: BurstSnapshot, state: AgentState) {
    const row = await prisma.whatsAppBurst.updateMany({ where: { id: snapshot.id, revision: snapshot.revision, leaseId: snapshot.leaseId, status: "PROCESSING" }, data: { state: JSON.parse(JSON.stringify(state)) } });
    if (!row.count) throw new Error("Eval snapshot superseded");
  }
  async function cleanup() {
    const tripIds = catalog.trips.map((t) => t.id);
    await prisma.supplierAttachment.deleteMany({ where: { supplierCapture: { tripId: { in: tripIds } } } });
    await prisma.supplierProduct.deleteMany({ where: { capture: { tripId: { in: tripIds } } } });
    await prisma.supplierContact.deleteMany({ where: { tripId: { in: tripIds } } });
    await prisma.supplier.deleteMany({ where: { tripId: { in: tripIds } } });
    await prisma.supplierCapture.deleteMany({ where: { tripId: { in: tripIds } } });
    await prisma.whatsAppBurst.deleteMany({ where: { userId } });
    const companies = await prisma.tripCompany.findMany({ where: { tripId: { in: tripIds } }, select: { catalogCompanyId: true } });
    await prisma.trip.deleteMany({ where: { id: { in: tripIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companies.map((c) => c.catalogCompanyId) } } });
    await prisma.user.delete({ where: { id: userId } });
  }
  return { prefix, id, userId, catalog, storage, domain, persist, save, cleanup };
}
