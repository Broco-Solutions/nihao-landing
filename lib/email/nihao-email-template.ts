type NihaoEmailTemplateInput = {
  preheader: string;
  title: string;
  bodyHtml: string;
  ctaLabel: string;
  actionUrl: string;
  noteHtml?: string;
};

export const NIHAO_EMAIL_LOGO_URL = "https://www.nihaonegocios.com/logo-nihao.png";

export function escapeEmailHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

export function renderNihaoEmail(input: NihaoEmailTemplateInput) {
  const safeUrl = escapeEmailHtml(input.actionUrl);
  const safePreheader = escapeEmailHtml(input.preheader);
  const safeTitle = escapeEmailHtml(input.title);
  const safeCtaLabel = escapeEmailHtml(input.ctaLabel);

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>${safeTitle}</title>
  </head>
  <body style="margin:0;padding:0;width:100%;background-color:#FAFAFA;color:#2F2626;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;line-height:1px;font-size:1px;">${safePreheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#FAFAFA" style="width:100%;background-color:#FAFAFA;border-collapse:collapse;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;border-collapse:separate;background-color:#FFFFFF;border:1px solid #E9DDDD;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:22px 36px;background-color:#FFFFFF;border-bottom:1px solid #EFE6E6;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">
                  <tr>
                    <td width="52" valign="middle" style="width:52px;vertical-align:middle;">
                      <img src="${NIHAO_EMAIL_LOGO_URL}" width="44" height="44" alt="Nihao Negocios" style="display:block;width:44px;height:44px;border:0;outline:none;text-decoration:none;">
                    </td>
                    <td aria-hidden="true" valign="middle" style="vertical-align:middle;font-family:Georgia,'Times New Roman',serif;font-size:23px;line-height:28px;font-weight:bold;color:#931111;letter-spacing:-0.2px;">Nihao <span style="color:#2F2626;">Negocios</span></td>
                    <td width="48" align="right" style="width:48px;"><span style="display:inline-block;width:36px;height:3px;background-color:#E6B041;border-radius:3px;font-size:0;line-height:0;">&nbsp;</span></td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td bgcolor="#931111" style="padding:38px 36px 34px;background-color:#931111;">
                <p style="margin:0 0 10px;color:#F2CD7A;font-size:12px;line-height:18px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;">Nihao Negocios</p>
                <h1 style="margin:0;color:#FFFFFF;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:38px;font-weight:normal;letter-spacing:-0.3px;">${safeTitle}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:34px 36px 38px;background-color:#FFFFFF;">
                <div style="font-size:16px;line-height:26px;color:#403636;">${input.bodyHtml}</div>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 26px;border-collapse:separate;">
                  <tr>
                    <td align="center" bgcolor="#931111" style="border-radius:8px;background-color:#931111;mso-padding-alt:14px 24px;">
                      <a href="${safeUrl}" style="display:inline-block;padding:14px 24px;color:#FFFFFF;font-size:15px;line-height:20px;font-weight:bold;text-decoration:none;border-radius:8px;background-color:#931111;">${safeCtaLabel}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px;color:#716666;font-size:13px;line-height:20px;">Si el botón no funciona, copiá y pegá este enlace en tu navegador:</p>
                <p style="margin:0 0 24px;font-size:13px;line-height:20px;word-break:break-all;"><a href="${safeUrl}" style="color:#730D0D;text-decoration:underline;">${safeUrl}</a></p>
                ${input.noteHtml ? `<div style="margin-top:24px;padding:16px 18px;background-color:#FBF7EF;border-left:3px solid #E6B041;color:#625747;font-size:13px;line-height:20px;">${input.noteHtml}</div>` : ""}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 36px;background-color:#F7F2F2;border-top:1px solid #E9DDDD;color:#7B6E6E;font-size:12px;line-height:18px;text-align:center;">
                Nihao Negocios · Información comercial organizada para cada viaje
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
