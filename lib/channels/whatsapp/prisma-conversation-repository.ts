import type { PrismaClient } from "../../../generated/prisma/client.ts";
import { normalizeWhatsAppPhone } from "../../bot/whatsapp-phone.ts";

type Selection = { kind: "ready"; userId: string; tripId: string; companyId: string } | { kind: "prompt"; text: string } | { kind: "unlinked" };

/** Selection is persisted because webhook deliveries can run on different workers. */
export class PrismaWhatsAppConversationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async select(phone: string, message: string | undefined): Promise<Selection> {
    const user = await this.prisma.user.findUnique({ where: { whatsappPhone: normalizeWhatsAppPhone(phone) }, select: { id: true } });
    if (!user) return { kind: "unlinked" };
    const trips = await this.prisma.tripMember.findMany({ where: { userId: user.id, trip: { status: { in: ["ACTIVE", "PLANNED"] } } }, select: { tripId: true, trip: { select: { name: true, status: true } } } });
    if (!trips.length) return { kind: "unlinked" };
    trips.sort((a, b) => (a.trip.status === "ACTIVE" ? 0 : 1) - (b.trip.status === "ACTIVE" ? 0 : 1) || a.trip.name.localeCompare(b.trip.name) || a.tripId.localeCompare(b.tripId));
    const existing = await this.prisma.whatsAppConversation.findUnique({ where: { userId: user.id } });
    const command = message?.trim().toLocaleLowerCase("es") ?? "";
    if (["cambiar", "viaje", "empresa"].includes(command)) {
      await this.prisma.whatsAppConversation.deleteMany({ where: { userId: user.id } });
      return { kind: "prompt", text: "Elegí el contexto para tu próximo proveedor enviando cualquier mensaje nuevamente." };
    }
    const state = existing?.stage === "DONE" ? null : existing;
    if (state?.stage === "TRIP") {
      const index = Number(command) - 1;
      if (!Number.isInteger(index) || !trips[index]) return { kind: "prompt", text: this.tripPrompt(trips) };
      return this.selectCompany(user.id, trips[index].tripId, undefined, false);
    }
    if (state?.stage === "COMPANY" && state.tripId && trips.some((trip) => trip.tripId === state.tripId)) return this.selectCompany(user.id, state.tripId, command, false);
    if (state?.stage === "READY" && state.tripId && state.companyId) {
      const allowed = await this.prisma.tripCompanyMember.findUnique({ where: { companyId_userId: { companyId: state.companyId, userId: user.id } }, select: { company: { select: { tripId: true } } } });
      const admin = await this.prisma.tripMember.findUnique({ where: { tripId_userId: { tripId: state.tripId, userId: user.id } }, select: { role: true } });
      if (trips.some((trip) => trip.tripId === state.tripId) && (allowed?.company.tripId === state.tripId || (admin?.role === "ADMIN" && Boolean(await this.prisma.tripCompany.findFirst({ where: { id: state.companyId, tripId: state.tripId } }))))) return { kind: "ready", userId: user.id, tripId: state.tripId, companyId: state.companyId };
    }
    if (trips.length > 1) {
      await this.prisma.whatsAppConversation.upsert({ where: { userId: user.id }, create: { userId: user.id, stage: "TRIP" }, update: { tripId: null, companyId: null, stage: "TRIP" } });
      return { kind: "prompt", text: this.tripPrompt(trips) };
    }
    return this.selectCompany(user.id, trips[0].tripId, undefined, true);
  }

  private tripPrompt(trips: Array<{ tripId: string; trip: { name: string } }>) {
    return `¿Para qué viaje es el próximo proveedor? Respondé con el número:\n${trips.map((trip, index) => `${index + 1}. ${trip.trip.name}`).join("\n")}`;
  }

  private async selectCompany(userId: string, tripId: string, answer: string | undefined, processOriginal: boolean): Promise<Selection> {
    const member = await this.prisma.tripMember.findUnique({ where: { tripId_userId: { tripId, userId } }, select: { role: true } });
    const companies = await this.prisma.tripCompany.findMany({ where: { tripId, ...(member?.role === "ADMIN" ? {} : { members: { some: { userId } } }) }, select: { id: true, name: true }, orderBy: { name: "asc" } });
    if (!companies.length) return { kind: "prompt", text: "Todavía no pertenecés a una empresa de este viaje." };
    const index = answer ? Number(answer) - 1 : companies.length === 1 ? 0 : -1;
    if (!Number.isInteger(index) || !companies[index]) {
      await this.prisma.whatsAppConversation.upsert({ where: { userId }, create: { userId, tripId, stage: "COMPANY" }, update: { tripId, companyId: null, stage: "COMPANY" } });
      return { kind: "prompt", text: `¿Para qué empresa es el próximo proveedor? Respondé con el número:\n${companies.map((company, position) => `${position + 1}. ${company.name}`).join("\n")}` };
    }
    await this.prisma.whatsAppConversation.upsert({ where: { userId }, create: { userId, tripId, companyId: companies[index].id, stage: "READY" }, update: { tripId, companyId: companies[index].id, stage: "READY" } });
    return processOriginal ? { kind: "ready", userId, tripId, companyId: companies[index].id } : { kind: "prompt", text: `Empresa seleccionada: ${companies[index].name}. Enviá ahora la información del proveedor.` };
  }

  async complete(userId: string): Promise<void> {
    await this.prisma.whatsAppConversation.updateMany({ where: { userId, stage: "READY" }, data: { stage: "DONE" } });
  }
}
