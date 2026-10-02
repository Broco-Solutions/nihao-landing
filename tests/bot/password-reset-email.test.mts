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
  assert.match(content.subject, /Restablecé tu contraseña/);
  assert.match(content.text, /https:\/\/nihao\.example\.test\/reset\?token=abc&next=<x>/);
  assert.match(content.html, /token=abc&amp;next=&lt;x&gt;/);
  assert.match(content.html, /Restablecer contraseña/);
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
