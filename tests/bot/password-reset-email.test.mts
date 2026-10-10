import assert from "node:assert/strict";
import { test } from "node:test";
import { passwordResetEmailContent, sendPasswordResetEmail, type PasswordResetEmailClient } from "../../lib/auth/password-reset-email.ts";

const originalFrom = process.env.INVITATION_EMAIL_FROM;
const originalKey = process.env.RESEND_API_KEY;

function restore() {
  if (originalFrom === undefined) delete process.env.INVITATION_EMAIL_FROM; else process.env.INVITATION_EMAIL_FROM = originalFrom;
  if (originalKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = originalKey;
}

test("el correo de recuperación conserva el enlace dinámico y escapa HTML", () => {
  const content = passwordResetEmailContent({ recipientEmail: "user@example.test", resetUrl: "https://nihao.example.test/reset?token=abc&next=<x>" });
  assert.equal(content.subject, "Restablecé tu contraseña de Nihao");
  assert.match(content.text, /https:\/\/nihao\.example\.test\/reset\?token=abc&next=<x>/);
  assert.match(content.html, /token=abc&amp;next=&lt;x&gt;/);
  assert.match(content.html, /Restablecer contraseña/);
  assert.match(content.html, /<h1[^>]*>Recuperá el acceso a tu cuenta<\/h1>/);
  assert.match(content.html, /role="presentation"/);
  assert.match(content.html, /max-width:600px/);
  assert.match(content.html, /#931111/);
  assert.match(content.html, /#E6B041/);
  assert.match(content.text, /Si no solicitaste este cambio/);
  assert.doesNotMatch(content.html, /#d95d39/i);
});

test("la URL de recuperación no puede inyectar atributos HTML", () => {
  const content = passwordResetEmailContent({ recipientEmail: "user@example.test", resetUrl: 'https://nihao.example.test/reset?token=" onclick="alert(1)' });
  assert.doesNotMatch(content.html, /onclick="alert/);
  assert.match(content.html, /token=&quot; onclick=&quot;alert\(1\)/);
});

test("envía recuperación mediante el cliente configurado", async () => {
  process.env.INVITATION_EMAIL_FROM = "Nihao <cuentas@example.test>";
  delete process.env.RESEND_API_KEY;
  const messages: Parameters<PasswordResetEmailClient["send"]>[0][] = [];
  await sendPasswordResetEmail({ recipientEmail: "user@example.test", resetUrl: "https://nihao.example.test/reset?token=secret" }, { async send(message) { messages.push(message); } });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].to, "user@example.test");
  assert.equal(messages[0].from, "Nihao <cuentas@example.test>");
  restore();
});
