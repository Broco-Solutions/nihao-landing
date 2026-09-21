import { Resend } from "resend";

export type InvitationEmailDelivery = "SENT" | "FAILED";
export type InvitationEmailOperation = "CREATE" | "RESEND";

export type TripInvitationEmailInput = {
  invitationId: string;
  recipientEmail: string;
  invitationUrl: string;
  expiresAt: Date;
  updatedAt: Date;
  operation: InvitationEmailOperation;
  tripName?: string | null;
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

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function displayTripName(tripName?: string | null) {
  return tripName?.trim() || "un viaje";
}

export function invitationEmailContent(input: Pick<TripInvitationEmailInput, "invitationUrl" | "expiresAt" | "tripName">) {
  const tripName = displayTripName(input.tripName);
  const safeTripName = escapeHtml(tripName);
  const safeUrl = escapeHtml(input.invitationUrl);
  const expiresAt = input.expiresAt.toLocaleString("es-AR", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" });
  const subject = `Te invitaron a ${tripName} en Nihao`;
  const text = `Hola,\n\nTe invitaron a participar del viaje "${tripName}" en Nihao.\n\nAceptar invitación: ${input.invitationUrl}\n\nLa invitación vence el ${expiresAt} (UTC).`;
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f7f5f1;font-family:Arial,sans-serif;color:#1f2937"><main style="max-width:560px;margin:24px auto;padding:32px;background:#ffffff;border-radius:16px"><h1 style="font-size:24px;margin:0 0 20px">Te invitaron a Nihao</h1><p>Hola,</p><p>Te invitaron a participar del viaje <strong>${safeTripName}</strong> en Nihao.</p><p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;background:#d95d39;color:#ffffff;padding:14px 20px;border-radius:10px;text-decoration:none;font-weight:700">Aceptar invitación</a></p><p style="font-size:14px;color:#4b5563">Si el botón no funciona, copiá este enlace:</p><p style="font-size:14px;word-break:break-all"><a href="${safeUrl}">${safeUrl}</a></p><p style="font-size:14px;color:#4b5563">La invitación vence el ${escapeHtml(expiresAt)} (UTC).</p></main></body></html>`;
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
