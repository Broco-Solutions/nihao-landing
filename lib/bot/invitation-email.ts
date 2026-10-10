import { Resend } from "resend";
import type { PrismaClient } from "../../generated/prisma/client.ts";
import { escapeEmailHtml, renderNihaoEmail } from "../email/nihao-email-template.ts";

export type InvitationEmailDelivery = "SENT" | "FAILED";
export type InvitationEmailOperation = "CREATE" | "RESEND";

export type TripInvitationEmailInput = {
  invitationId: string;
  recipientEmail: string;
  invitationUrl: string;
  updatedAt: Date;
  operation: InvitationEmailOperation;
  tripName: string;
  companyName: string;
};

export type InvitationEmailClient = {
  send(input: {
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
    idempotencyKey: string;
  }): Promise<void>;
};

export async function invitationEmailNames(prisma: PrismaClient, invitationId: string) {
  const invitation = await prisma.tripInvitation.findUnique({
    where: { id: invitationId },
    select: { trip: { select: { name: true } }, company: { select: { catalogCompany: { select: { name: true } } } } },
  });
  const tripName = invitation?.trip.name.trim();
  const companyName = invitation?.company.catalogCompany.name.trim();
  return tripName && companyName ? { tripName, companyName } : null;
}

export function invitationEmailContent(input: Pick<TripInvitationEmailInput, "invitationUrl" | "tripName" | "companyName">) {
  const tripName = input.tripName.trim();
  const safeTripName = escapeEmailHtml(tripName);
  const companyName = input.companyName.trim();
  const safeCompanyName = escapeEmailHtml(companyName);
  const bodyText = `Te invitaron a participar de ${tripName} representando a ${companyName}.`;
  const subject = "Tu invitación a Nihao Negocios";
  const availability = "El enlace permanecerá disponible hasta que aceptes la invitación o el administrador genere uno nuevo.";
  const text = `NIHAO NEGOCIOS\n\nTu próximo viaje comienza acá\n\n${bodyText}\n\nDesde Nihao vas a poder organizar tus visitas y registrar proveedores y productos desde WhatsApp y la plataforma Web.\n\nActivar mi acceso: ${input.invitationUrl}\n\n${availability}`;
  const html = renderNihaoEmail({
    preheader: `${bodyText} Activá tu acceso a Nihao Negocios.`,
    title: "Tu próximo viaje comienza acá",
    bodyHtml: `<p style="margin:0 0 16px;">Hola,</p><p style="margin:0 0 16px;">Te invitaron a participar de <strong style="color:#2F2626;">${safeTripName}</strong> representando a <strong style="color:#2F2626;">${safeCompanyName}</strong>.</p><p style="margin:0;">Desde Nihao vas a poder organizar tus visitas y registrar proveedores y productos desde WhatsApp y la plataforma Web.</p>`,
    ctaLabel: "Activar mi acceso",
    actionUrl: input.invitationUrl,
    noteHtml: availability,
  });
  return { subject, html, text };
}

function runtimeEmailClient(): InvitationEmailClient | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.INVITATION_EMAIL_FROM?.trim();
  if (!apiKey || !from) return null;
  const resend = new Resend(apiKey);
  return {
    async send(input) {
      const result = await resend.emails.send({ from: input.from, to: input.to, subject: input.subject, html: input.html, text: input.text }, { idempotencyKey: input.idempotencyKey });
      if (result.error) throw new Error("Resend rejected the invitation email");
    },
  };
}

function sanitizedError(error: unknown) {
  return error instanceof Error ? error.name : "UnknownError";
}

export async function sendTripInvitationEmail(input: TripInvitationEmailInput, client: InvitationEmailClient | null = runtimeEmailClient()): Promise<InvitationEmailDelivery> {
  if (!input.tripName.trim() || !input.companyName.trim()) return "FAILED";
  if (!client || !process.env.INVITATION_EMAIL_FROM?.trim()) {
    console.error("Invitation email delivery failed", { operation: input.operation, invitationId: input.invitationId, provider: "resend", error: "EmailConfigurationMissing" });
    return "FAILED";
  }

  try {
    const content = invitationEmailContent(input);
    await client.send({
      from: process.env.INVITATION_EMAIL_FROM.trim(),
      to: input.recipientEmail,
      ...content,
      idempotencyKey: `trip-invitation-${input.invitationId}-${input.updatedAt.getTime()}`,
    });
    return "SENT";
  } catch (error) {
    console.error("Invitation email delivery failed", { operation: input.operation, invitationId: input.invitationId, provider: "resend", error: sanitizedError(error) });
    return "FAILED";
  }
}
