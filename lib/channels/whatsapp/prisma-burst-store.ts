import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "../../../generated/prisma/client.ts";
import { normalizeWhatsAppPhone } from "../../bot/whatsapp-phone.ts";
import { BURST_QUIET_MS, type BurstCatalog, type BurstEnvelope, type BurstReading, type BurstSnapshot, type BurstState, type BurstStore } from "./burst-types.ts";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const initialState = (): BurstState => ({ tripId: null, groups: [], question: null, controlIds: [], pendingRefs: [] });

export class PrismaBurstStore implements BurstStore {
  constructor(private readonly prisma: PrismaClient, private readonly options: { newVersion?: number; claimVersions?: number[]; allowNew?: boolean } = {}) {}

  async receive(envelope: BurstEnvelope): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { whatsappPhone: normalizeWhatsAppPhone(envelope.phone) }, select: { id: true } });
    if (!user || !(await this.catalog(user.id)).trips.length) return false;
    const activeV2 = await this.prisma.whatsAppBurst.findFirst({ where: { instance: envelope.instance, phone: envelope.phone, status: { not: "DONE" } }, select: { id: true } });
    if (!activeV2 && (await this.prisma.whatsAppBatch.findFirst({ where: { instance: envelope.instance, phone: envelope.phone, status: { in: ["OPEN", "READY", "PROCESSING", "NEEDS_CLARIFICATION"] } }, select: { id: true } }) || await this.prisma.supplierCapture.findFirst({ where: { createdById: user.id, status: "DRAFT", trip: { status: { in: ["ACTIVE", "PLANNED"] } }, company: { active: true, members: { some: { userId: user.id } } }, whatsappCardState: { in: ["PENDING", "ANALYZING"] } }, select: { id: true } }))) return false;
    const accepted = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`burst:${envelope.instance}:${envelope.phone}`}))`;
      if (await tx.whatsAppBurstMessage.findUnique({ where: { instance_messageId: { instance: envelope.instance, messageId: envelope.messageId } } })) return;
      // A v1 capture already acknowledged this delivery. Never process it twice across rollout.
      if (await tx.whatsAppBatchMessage.findUnique({ where: { instance_messageId: { instance: envelope.instance, messageId: envelope.messageId } } })) return;
      if (await tx.whatsAppMessageReply.findUnique({ where: { instance_messageId: { instance: envelope.instance, messageId: envelope.messageId } } })) return;
      if (await tx.whatsAppCommandReceipt.findUnique({ where: { instance_messageId: { instance: envelope.instance, messageId: envelope.messageId } } })) return;
      let burst = await tx.whatsAppBurst.findFirst({ where: { instance: envelope.instance, phone: envelope.phone, status: { not: "DONE" } } });
      const now = new Date();
      const dueAt = new Date(now.getTime() + (/^listo[.!]?$/iu.test(envelope.text?.trim() ?? "") ? 0 : BURST_QUIET_MS));
      if (!burst && this.options.allowNew === false) return false;
      if (!burst) burst = await tx.whatsAppBurst.create({ data: { instance: envelope.instance, phone: envelope.phone, userId: user.id, version: this.options.newVersion ?? 2, dueAt, state: json(initialState()) } });
      if (burst.userId !== user.id) throw new Error("La vinculación de WhatsApp cambió durante la carga");
      const revision = burst.revision + 1;
      await tx.whatsAppBurstMessage.create({ data: { burstId: burst.id, instance: envelope.instance, messageId: envelope.messageId, sequence: revision, sentAt: envelope.sentAt ? new Date(envelope.sentAt) : null, envelope: json(envelope) } });
      await tx.whatsAppBurst.update({ where: { id: burst.id }, data: { revision, dueAt, ...(burst.status === "COMMITTING" ? {} : { status: "OPEN" }) } });
      // Superseded questions must not be sent after a clarification has already arrived.
      await tx.whatsAppBurstReply.updateMany({ where: { burstId: burst.id, status: "PENDING" }, data: { status: "SUPERSEDED" } });
    });
    return accepted !== false;
  }

  async catalog(userId: string, includeSuppliers = false): Promise<BurstCatalog> {
    const memberships = await this.prisma.tripMember.findMany({ where: { userId, role: "TRAVELER", trip: { status: { in: ["ACTIVE", "PLANNED"] } } }, select: { trip: { select: { id: true, name: true, companies: { where: { active: true, members: { some: { userId } } }, select: { id: true, catalogCompany: { select: { name: true } } }, orderBy: { catalogCompany: { name: "asc" } } } } } } });
    const trips = memberships.map(({ trip }) => ({ id: trip.id, name: trip.name, companies: trip.companies.map((c) => ({ id: c.id, name: c.catalogCompany.name })) })).filter((t) => t.companies.length).sort((a, b) => a.name.localeCompare(b.name));
    if (!includeSuppliers) return { trips };
    return { trips: await Promise.all(trips.map(async (trip) => ({ ...trip, suppliers: (await this.prisma.supplier.findMany({ where: { tripId: trip.id, companyId: { in: trip.companies.map((c) => c.id) }, status: "CONFIRMED", companyName: { not: null } }, select: { id: true, companyName: true, companyId: true, captureId: true, city: true }, orderBy: [{ companyName: "asc" }, { id: "asc" }] })).map((s) => ({ id: s.id, name: s.companyName!, companyId: s.companyId, captureId: s.captureId, city: s.city })) }))) };
  }

  async claim(limit: number): Promise<BurstSnapshot[]> {
    const now = new Date();
    const candidates = await this.prisma.whatsAppBurst.findMany({ where: { version: { in: this.options.claimVersions ?? [2] }, dueAt: { lte: now }, OR: [{ status: { in: ["OPEN", "COMMITTING"] }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }, { status: "PROCESSING", leaseUntil: { lt: now } }] }, orderBy: { dueAt: "asc" }, take: limit });
    const snapshots: BurstSnapshot[] = [];
    for (const candidate of candidates) {
      const leaseId = randomUUID();
      const claimed = await this.prisma.whatsAppBurst.updateMany({ where: { id: candidate.id, revision: candidate.revision, status: candidate.status, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }, data: { status: candidate.status === "COMMITTING" ? "COMMITTING" : "PROCESSING", leaseId, leaseUntil: new Date(now.getTime() + 330_000), attempts: { increment: 1 } } });
      if (!claimed.count) continue;
      const row = await this.prisma.whatsAppBurst.findUniqueOrThrow({ where: { id: candidate.id }, include: { messages: { orderBy: { sequence: "asc" } } } });
      snapshots.push({ ...row, state: row.state as unknown as BurstState, messages: row.messages.map((m) => ({ ...m, envelope: m.envelope as unknown as BurstEnvelope, reading: m.reading as unknown as BurstReading | null })) });
    }
    return snapshots;
  }

  async saveReading(messageId: string, reading: BurstReading) {
    await this.prisma.whatsAppBurstMessage.update({ where: { id: messageId }, data: { reading: json(reading) } });
  }

  async reserve(snapshot: BurstSnapshot, state: BurstState): Promise<boolean> {
    const changed = await this.prisma.whatsAppBurst.updateMany({ where: { id: snapshot.id, revision: snapshot.revision, leaseId: snapshot.leaseId, status: "PROCESSING" }, data: { status: "COMMITTING", state: json(state) } });
    return changed.count === 1;
  }

  async finish(snapshot: BurstSnapshot, state: BurstState, text: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`burst:${snapshot.instance}:${snapshot.phone}`}))`;
      const current = await tx.whatsAppBurst.findUniqueOrThrow({ where: { id: snapshot.id } });
      if (current.leaseId !== snapshot.leaseId) return;
      const newer = current.revision !== (state.evaluatedRevision ?? snapshot.revision);
      await tx.whatsAppBurst.update({ where: { id: snapshot.id }, data: { state: json(state), status: newer ? "OPEN" : state.question ? "WAITING" : "DONE", leaseId: null, leaseUntil: null, attempts: 0 } });
      if (text && !newer) await tx.whatsAppBurstReply.upsert({ where: { burstId_revision: { burstId: snapshot.id, revision: snapshot.revision } }, create: { burstId: snapshot.id, revision: snapshot.revision, text }, update: {} });
      const proposalId = (state as BurstState & { agent?: { pending?: { proposalId?: string } } }).agent?.pending?.proposalId;
      if (text && !newer && proposalId) {
        const proposal = await tx.whatsAppAgentOperation.findFirst({ where: { id: proposalId, burstId: snapshot.id, status: "PROPOSED" } });
        const sent = proposal?.displayedRevision != null && await tx.whatsAppBurstReply.findFirst({ where: { burstId: snapshot.id, revision: proposal.displayedRevision, status: "SENT" } });
        if (proposal && !sent) await tx.whatsAppAgentOperation.update({ where: { id: proposal.id }, data: { displayedRevision: snapshot.revision } });
      }
    });
  }

  async retry(snapshot: BurstSnapshot, checkpoint = false) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`burst:${snapshot.instance}:${snapshot.phone}`}))`;
      const current = await tx.whatsAppBurst.findUniqueOrThrow({ where: { id: snapshot.id } });
      if (current.leaseId !== snapshot.leaseId) return;
      const needsHelp = !checkpoint && current.status !== "COMMITTING" && current.attempts >= 5 && current.revision === snapshot.revision;
      const text = "No pude terminar de procesar esta ráfaga. Los mensajes y las lecturas completadas siguen guardados. Respondé reintentar para volver a intentar; si un archivo sigue fallando, podés reenviarlo.";
      const state = current.state as unknown as BurstState;
      if (needsHelp) state.question = text;
      await tx.whatsAppBurst.update({ where: { id: current.id }, data: { status: needsHelp ? "WAITING" : current.status === "COMMITTING" ? "COMMITTING" : "OPEN", leaseId: null, leaseUntil: null, state: json(state), ...(checkpoint || needsHelp ? { attempts: 0 } : {}), dueAt: new Date(Date.now() + 30_000) } });
      if (needsHelp) await tx.whatsAppBurstReply.upsert({ where: { burstId_revision: { burstId: current.id, revision: current.revision } }, create: { burstId: current.id, revision: current.revision, text }, update: {} });
    });
  }

  async flushReplies(send: (phone: string, text: string) => Promise<void>) {
    const now = new Date();
    const replies = await this.prisma.whatsAppBurstReply.findMany({ where: { OR: [{ status: "PENDING" }, { status: "SENDING", leaseUntil: { lt: now } }] }, include: { burst: true }, take: 10, orderBy: { createdAt: "asc" } });
    for (const reply of replies) {
      const claim = await this.prisma.whatsAppBurstReply.updateMany({ where: { id: reply.id, status: reply.status, ...(reply.status === "SENDING" ? { leaseUntil: { lt: now } } : {}) }, data: { status: "SENDING", leaseUntil: new Date(now.getTime() + 30_000) } });
      if (!claim.count) continue;
      try {
        const current = await this.prisma.whatsAppBurst.findUniqueOrThrow({ where: { id: reply.burstId } });
        if (current.revision !== reply.revision) {
          await this.prisma.whatsAppBurstReply.update({ where: { id: reply.id }, data: { status: "SUPERSEDED" } });
          continue;
        }
        await send(reply.burst.phone, reply.text);
        await this.prisma.whatsAppBurstReply.update({ where: { id: reply.id }, data: { status: "SENT", leaseUntil: null } });
      } catch {
        await this.prisma.whatsAppBurstReply.update({ where: { id: reply.id }, data: { status: "PENDING", leaseUntil: null } });
      }
    }
  }
}
