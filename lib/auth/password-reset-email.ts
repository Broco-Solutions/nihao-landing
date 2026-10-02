import { Resend } from "resend";

export type PasswordResetEmailInput = { recipientEmail: string; resetUrl: string };
export type PasswordResetEmailMessage = { from: string; to: string; subject: string; html: string; text: string };
export type PasswordResetEmailClient = { send(message: PasswordResetEmailMessage): Promise<void> };

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

export function passwordResetEmailContent(input: PasswordResetEmailInput) {
  const safeUrl = escapeHtml(input.resetUrl);
  return {
    subject: "Restablecé tu contraseña de Nihao Negocios",
    text: `Recibimos una solicitud para restablecer la contraseña de tu cuenta de Nihao Negocios.\n\nRestablecer contraseña: ${input.resetUrl}\n\nSi no solicitaste este cambio, podés ignorar este correo.`,
    html: `<!doctype html><html lang="es"><body style="margin:0;background:#f7f5f1;font-family:Arial,sans-serif;color:#1f2937"><main style="max-width:560px;margin:24px auto;padding:32px;background:#ffffff;border-radius:16px"><h1 style="font-size:24px;margin:0 0 20px">Restablecé tu contraseña</h1><p>Recibimos una solicitud para restablecer la contraseña de tu cuenta de Nihao Negocios.</p><p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;background:#d95d39;color:#ffffff;padding:14px 20px;border-radius:10px;text-decoration:none;font-weight:700">Restablecer contraseña</a></p><p style="font-size:14px;color:#4b5563">Si no solicitaste este cambio, podés ignorar este correo.</p></main></body></html>`,
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
