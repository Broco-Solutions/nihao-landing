import test from "node:test";
import assert from "node:assert/strict";
import { operationalEmailIdempotencyKey, sendOperationalEmail } from "../../lib/channels/whatsapp/operational-alert-email.ts";

const recoveryKey = (last = "4") => `whatsapp-recovery-${Array.from({ length: 5 }, (_, i) => `${String(i).padStart(8, "0")}-0000-4000-8000-00000000000${i === 4 ? last : i}-1793629206013`).join("-")}`;

test("cinco recuperaciones agrupadas producen una clave estable admitida sin perder la identidad completa del lote", () => {
  const key = recoveryKey();
  assert.ok(key.length > 256, "reproduce el rechazo del lote productivo de cinco recuperaciones");
  const bounded = operationalEmailIdempotencyKey(key);
  assert.ok(bounded.length <= 256);
  assert.equal(bounded, operationalEmailIdempotencyKey(key));
  assert.equal(key.slice(0, 256), recoveryKey("9").slice(0, 256));
  assert.notEqual(bounded, operationalEmailIdempotencyKey(recoveryKey("9")), "no se trunca el identificador del último incidente");
  assert.notEqual(bounded, operationalEmailIdempotencyKey(key.replace("whatsapp-recovery-", "whatsapp-alert-")));
  const short = "whatsapp-recovery-incident-1793629206013";
  assert.equal(operationalEmailIdempotencyKey(short), short, "no vuelve a enviar claves cortas ya aceptadas");
  assert.equal(operationalEmailIdempotencyKey("a".repeat(256)), "a".repeat(256));
});

test("el transporte real del SDK limita la clave y conserva el código de rechazo sin enviar correo externo", async () => {
  const originalFetch = globalThis.fetch;
  const keys = ["RESEND_API_KEY", "INVITATION_EMAIL_FROM", "WHATSAPP_OPERATIONAL_ALERT_EMAILS"] as const;
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.RESEND_API_KEY = "re_test_no_external_delivery";
  process.env.INVITATION_EMAIL_FROM = "Nihao <invitaciones@example.test>";
  process.env.WHATSAPP_OPERATIONAL_ALERT_EMAILS = "soporte@brocosolutions.com";
  const input = { subject: "[NIHAO-OPS] [RECUPERADO] Componente de WhatsApp", title: "Recuperación sintética", lines: ["Incidentes sintéticos"], idempotencyKey: recoveryKey() };
  let calls = 0;
  try {
    globalThis.fetch = async (_url, init) => {
      calls++;
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("idempotency-key"), operationalEmailIdempotencyKey(input.idempotencyKey));
      assert.ok(headers.get("idempotency-key")!.length <= 256);
      return calls === 1 ? Response.json({ id: "synthetic-email" }) : Response.json({ name: "rate_limit_exceeded", message: "Synthetic rate limit" }, { status: 429 });
    };
    await sendOperationalEmail(input);
    await assert.rejects(sendOperationalEmail(input), { name: "rate_limit_exceeded", message: "OperationalAlertEmailRejected" });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; }
  }
});
