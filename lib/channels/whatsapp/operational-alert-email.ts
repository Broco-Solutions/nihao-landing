import { Resend } from "resend";
import { escapeEmailHtml, renderNihaoEmail } from "../../email/nihao-email-template.ts";

export type OperationalEmail = { subject: string; title: string; lines: string[]; idempotencyKey: string };

const OPERATIONAL_ALERT_RECIPIENT = "soporte@brocosolutions.com";

export function operationalAlertRecipients(raw = process.env.WHATSAPP_OPERATIONAL_ALERT_EMAILS) {
  return [...new Set((raw ?? "").split(/[,;\n]+/u).map((value) => value.trim().toLowerCase()).filter((value) => value === OPERATIONAL_ALERT_RECIPIENT))];
}

export async function sendOperationalEmail(input: OperationalEmail) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.INVITATION_EMAIL_FROM?.trim();
  const recipients = operationalAlertRecipients();
  if (!apiKey || !from || !recipients.length) throw new Error("OperationalAlertEmailConfigurationMissing");
  const safeLines = input.lines.map((line) => escapeEmailHtml(line));
  const text = `${input.title}\n\n${input.lines.join("\n")}\n\nEste aviso no incluye teléfonos ni contenido comercial.`;
  const html = renderNihaoEmail({
    preheader: input.subject,
    title: input.title,
    bodyHtml: `<p style="margin:0 0 16px;">${safeLines.join("</p><p style=\"margin:0 0 16px;\">")}</p>`,
    ctaLabel: "Abrir Nihao",
    actionUrl: "https://www.nihaonegocios.com/app",
    noteHtml: "Este aviso operativo no incluye teléfonos, mensajes, audios ni información comercial.",
  });
  const result = await new Resend(apiKey).emails.send({ from, to: recipients, subject: input.subject, html, text }, { idempotencyKey: input.idempotencyKey });
  if (result.error) throw new Error("OperationalAlertEmailRejected");
}
