import type { PrismaClient } from "../../../generated/prisma/client.ts";
import { EvolutionRequestError } from "../evolution/client.ts";
import { AuthorizationError } from "../../bot/authorization.ts";
import { normalizeWhatsAppPhone } from "../../bot/whatsapp-phone.ts";
import { ValidationError } from "../../bot/validation.ts";

export const WHATSAPP_OPERATIONAL_CONSENT_SCOPE = "OPERATIONAL_ACTIVATION";
export const WHATSAPP_OPERATIONAL_CONSENT_VERSION = "2026-10-11";

export type TravelerWelcomeStatus =
  | "PENDING_ELIGIBILITY"
  | "PENDING_PHONE"
  | "PENDING_CONSENT"
  | "WAITING_FOR_CONTACT"
  | "READY"
  | "SENDING"
  | "ACCEPTED"
  | "SERVER_ACK"
  | "DELIVERED"
  | "READ"
  | "PLAYED"
  | "FAILED"
  | "DELIVERY_UNKNOWN"
  | "CANCELLED";

const terminalStatuses = new Set<TravelerWelcomeStatus>(["ACCEPTED", "SERVER_ACK", "DELIVERED", "READ", "PLAYED", "DELIVERY_UNKNOWN"]);
const deliveryRank: Record<string, number> = { ACCEPTED: 1, SERVER_ACK: 2, DELIVERED: 3, READ: 4, PLAYED: 5 };

function assistantUrl(): string | null {
  const phone = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.replace(/\D/g, "") ?? "";
  return /^\d{8,15}$/u.test(phone) ? `https://wa.me/${phone}` : null;
}

function firstName(value: string): string | null {
  const candidate = value.trim().replace(/\s+/g, " ").split(" ")[0] ?? "";
  return candidate && candidate.length <= 60 && /\p{L}/u.test(candidate) && !candidate.includes("@") ? candidate : null;
}

export function travelerWelcomeText(name: string | null | undefined): string {
  const greeting = firstName(name ?? "") ? `¡Hola, *${firstName(name ?? "")}*! 👋🇨🇳` : "¡Hola! 👋🇨🇳";
  return `${greeting}

¡Bienvenido a *Nihao Negocios*!

Tu acceso al asistente de WhatsApp ya está habilitado.

Durante tu viaje podés enviarme fotos de tarjetas y productos, audios o mensajes con información de proveedores: precios FOB, cantidades mínimas, plazos y todo lo que te parezca importante.

📋 Voy a ayudarte a organizar esa información para que puedas consultarla y revisarla después desde la plataforma.

*¿Empezamos?*

Podés mandarme la foto de una tarjeta o contarme qué proveedor querés registrar.

¡Buenos negocios! 🚀`;
}

export type TravelerWelcomeView = {
  tripId: string;
  whatsappPhone: string | null;
  consentGranted: boolean;
  status: TravelerWelcomeStatus;
  canConsent: boolean;
  openAssistantUrl: string | null;
};

/**
 * Eligibility and outbox for the one-time traveler welcome. Evolution's
 * free-form sendText endpoint is not an approved-template transport, so an
 * eligible welcome waits for an inbound message before becoming READY.
 */
export class PrismaTravelerWelcomeService {
  constructor(private readonly prisma: PrismaClient) {}

  async state(userId: string, tripId: string): Promise<TravelerWelcomeView> {
    const member = await this.prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId } },
      select: { role: true, user: { select: { whatsappPhone: true } } },
    });
    if (!member) throw new AuthorizationError("No tenés acceso a este viaje");
    const phone = member.user.whatsappPhone;
    const consent = phone ? await this.prisma.whatsAppOperationalConsent.findUnique({
      where: { userId_phone_scope: { userId, phone, scope: WHATSAPP_OPERATIONAL_CONSENT_SCOPE } },
      select: { revokedAt: true },
    }) : null;
    const welcome = await this.prisma.whatsAppTravelerWelcome.findUnique({ where: { userId_tripId: { userId, tripId } }, select: { status: true } });
    return {
      tripId,
      whatsappPhone: phone,
      consentGranted: Boolean(consent && !consent.revokedAt),
      status: (welcome?.status ?? (phone ? "PENDING_CONSENT" : "PENDING_PHONE")) as TravelerWelcomeStatus,
      canConsent: member.role === "TRAVELER" && Boolean(phone),
      openAssistantUrl: phone ? assistantUrl() : null,
    };
  }

  async setConsent(userId: string, tripId: string, granted: boolean, origin: "ONBOARDING" | "TRIP_WEB"): Promise<TravelerWelcomeView> {
    const member = await this.prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId } },
      select: { role: true, user: { select: { whatsappPhone: true } } },
    });
    if (!member || member.role !== "TRAVELER") throw new AuthorizationError("No tenés acceso de viajero a este viaje");
    if (!member.user.whatsappPhone) throw new ValidationError("Tu cuenta todavía no tiene un WhatsApp vinculado");
    const phone = normalizeWhatsAppPhone(member.user.whatsappPhone);
    const now = new Date();
    await this.prisma.whatsAppOperationalConsent.upsert({
      where: { userId_phone_scope: { userId, phone, scope: WHATSAPP_OPERATIONAL_CONSENT_SCOPE } },
      create: { userId, phone, scope: WHATSAPP_OPERATIONAL_CONSENT_SCOPE, version: WHATSAPP_OPERATIONAL_CONSENT_VERSION, origin, grantedAt: now, revokedAt: granted ? null : now },
      update: { version: WHATSAPP_OPERATIONAL_CONSENT_VERSION, origin, ...(granted ? { grantedAt: now, revokedAt: null } : { revokedAt: now }) },
    });
    if (!granted) await this.prisma.whatsAppTravelerWelcome.updateMany({
      where: { userId, tripId, phone, status: { in: ["WAITING_FOR_CONTACT", "READY", "FAILED"] } },
      data: { status: "PENDING_CONSENT", readyAt: null, sendStartedAt: null, providerMessageId: null, acceptedAt: null },
    });
    await this.reevaluate(userId, tripId);
    return this.state(userId, tripId);
  }

  async reevaluateAll(userId: string): Promise<void> {
    const memberships = await this.prisma.tripMember.findMany({ where: { userId, role: "TRAVELER" }, select: { tripId: true } });
    for (const membership of memberships) await this.reevaluate(userId, membership.tripId);
  }

  async reevaluate(userId: string, tripId: string): Promise<TravelerWelcomeStatus> {
    const existing = await this.prisma.whatsAppTravelerWelcome.findUnique({ where: { userId_tripId: { userId, tripId } }, select: { status: true, phone: true } });
    if (existing && terminalStatuses.has(existing.status as TravelerWelcomeStatus)) return existing.status as TravelerWelcomeStatus;
    const member = await this.prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId } },
      select: {
        role: true,
        onboardingCompletedAt: true,
        trip: { select: { status: true } },
        user: { select: { name: true, whatsappPhone: true } },
      },
    });
    if (existing?.status === "SENDING" || existing && ["READY", "FAILED"].includes(existing.status) && existing.phone === member?.user.whatsappPhone) return existing.status as TravelerWelcomeStatus;
    const companyCount = member ? await this.prisma.tripCompanyMember.count({ where: { userId, company: { tripId, active: true } } }) : 0;
    const phone = member?.user.whatsappPhone ? normalizeWhatsAppPhone(member.user.whatsappPhone) : null;
    const consent = phone ? await this.prisma.whatsAppOperationalConsent.findUnique({
      where: { userId_phone_scope: { userId, phone, scope: WHATSAPP_OPERATIONAL_CONSENT_SCOPE } },
      select: { revokedAt: true },
    }) : null;
    let status: TravelerWelcomeStatus;
    if (!member || member.role !== "TRAVELER" || !["PLANNED", "ACTIVE"].includes(member.trip.status) || companyCount === 0) status = "CANCELLED";
    else if (!member.onboardingCompletedAt) status = "PENDING_ELIGIBILITY";
    else if (!phone) status = "PENDING_PHONE";
    else if (!consent || consent.revokedAt) status = "PENDING_CONSENT";
    else status = "WAITING_FOR_CONTACT";
    const now = new Date();
    await this.prisma.whatsAppTravelerWelcome.upsert({
      where: { userId_tripId: { userId, tripId } },
      create: { userId, tripId, phone, text: member ? travelerWelcomeText(member.user.name) : null, status, eligibleAt: status === "WAITING_FOR_CONTACT" ? now : null },
      update: { phone, text: member ? travelerWelcomeText(member.user.name) : null, status, eligibleAt: status === "WAITING_FOR_CONTACT" ? now : null, readyAt: null, sendStartedAt: null, providerMessageId: null, acceptedAt: null, deliveryUpdatedAt: null, lastErrorAt: null, lastErrorCode: null },
    });
    return status;
  }

  async activateFromInbound(userId: string, tripId: string, phoneValue: string): Promise<boolean> {
    const phone = normalizeWhatsAppPhone(phoneValue);
    await this.reevaluate(userId, tripId);
    const result = await this.prisma.whatsAppTravelerWelcome.updateMany({
      where: { userId, tripId, phone, status: "WAITING_FOR_CONTACT" },
      data: { status: "READY", readyAt: new Date() },
    });
    return result.count === 1;
  }

  async flushReady(send: (phone: string, text: string, onMessageId: (id: string) => void) => Promise<void>): Promise<boolean> {
    const row = await this.prisma.whatsAppTravelerWelcome.findFirst({ where: { status: "READY", phone: { not: null }, text: { not: null } }, orderBy: { readyAt: "asc" } });
    if (!row?.phone || !row.text) return false;
    const claimed = await this.prisma.whatsAppTravelerWelcome.updateMany({ where: { id: row.id, status: "READY" }, data: { status: "SENDING", sendStartedAt: new Date() } });
    if (!claimed.count) return false;
    let providerMessageId: string | null = null;
    try {
      await send(row.phone, row.text, (id) => { providerMessageId = id; });
      await this.prisma.whatsAppTravelerWelcome.update({ where: { id: row.id }, data: { status: "ACCEPTED", providerMessageId, acceptedAt: new Date(), lastErrorAt: null, lastErrorCode: null } });
    } catch (error) {
      await this.prisma.whatsAppTravelerWelcome.update({
        where: { id: row.id },
        data: error instanceof EvolutionRequestError
          ? { status: "FAILED", lastErrorAt: new Date(), lastErrorCode: `EVOLUTION_HTTP_${error.status}` }
          : { status: "DELIVERY_UNKNOWN", lastErrorAt: new Date(), lastErrorCode: "EVOLUTION_TRANSPORT_UNKNOWN" },
      });
    }
    return true;
  }

  async applyDeliveryStatus(providerMessageId: string, status: string): Promise<boolean> {
    const row = await this.prisma.whatsAppTravelerWelcome.findFirst({ where: { providerMessageId }, select: { id: true, status: true } });
    if (!row) return false;
    const currentRank = deliveryRank[row.status] ?? 0;
    const nextRank = deliveryRank[status] ?? 0;
    if (!nextRank && status !== "DELIVERY_FAILED") return false;
    if (status === "DELIVERY_FAILED" && currentRank >= deliveryRank.DELIVERED) return false;
    if (nextRank && nextRank < currentRank) return false;
    await this.prisma.whatsAppTravelerWelcome.update({ where: { id: row.id }, data: { status, deliveryUpdatedAt: new Date(), ...(status === "DELIVERY_FAILED" ? { lastErrorAt: new Date(), lastErrorCode: "WHATSAPP_DELIVERY_FAILED" } : {}) } });
    return true;
  }
}
