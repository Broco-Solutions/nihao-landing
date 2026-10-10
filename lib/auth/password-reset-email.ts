import { Resend } from "resend";
import { renderNihaoEmail } from "../email/nihao-email-template.ts";

export type PasswordResetEmailInput = { recipientEmail: string; resetUrl: string };
export type PasswordResetEmailMessage = { from: string; to: string; subject: string; html: string; text: string };
export type PasswordResetEmailClient = { send(message: PasswordResetEmailMessage): Promise<void> };

export function passwordResetEmailContent(input: PasswordResetEmailInput) {
  return {
    subject: "Restablecé tu contraseña de Nihao",
    text: `NIHAO NEGOCIOS\n\nRecuperá el acceso a tu cuenta\n\nRecibimos una solicitud para cambiar la contraseña de tu cuenta de Nihao Negocios.\n\nRestablecer contraseña: ${input.resetUrl}\n\nSi no solicitaste este cambio, podés ignorar este correo. Tu contraseña actual no se modificará.`,
    html: renderNihaoEmail({
      preheader: "Recuperá el acceso a tu cuenta de Nihao Negocios.",
      title: "Recuperá el acceso a tu cuenta",
      bodyHtml: `<p style="margin:0 0 16px;">Hola,</p><p style="margin:0;">Recibimos una solicitud para cambiar la contraseña de tu cuenta de Nihao Negocios.</p>`,
      ctaLabel: "Restablecer contraseña",
      actionUrl: input.resetUrl,
      noteHtml: "Si no solicitaste este cambio, podés ignorar este correo. Tu contraseña actual no se modificará.",
    }),
  };
}

export async function sendPasswordResetEmail(input: PasswordResetEmailInput, client?: PasswordResetEmailClient) {
  const from = process.env.INVITATION_EMAIL_FROM?.trim();
  if (!from) throw new Error("Password reset email is not configured");
  let sender = client;
  if (!sender) {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) throw new Error("Password reset email is not configured");
    const resend = new Resend(apiKey);
    sender = {
      async send(message) {
        const result = await resend.emails.send(message);
        if (result.error) throw new Error("Resend rejected the password reset email");
      },
    };
  }
  await sender.send({ from, to: input.recipientEmail, ...passwordResetEmailContent(input) });
}
