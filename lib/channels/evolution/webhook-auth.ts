import { timingSafeEqual } from "node:crypto";

export const EVOLUTION_WEBHOOK_SECRET_HEADER = "x-nihao-webhook-secret";

/** Fail closed before parsing or persisting any webhook payload. */
export function authenticateEvolutionWebhook(request: Request, configuredSecret: string | undefined): Response | null {
  const secret = configuredSecret?.trim();
  if (!secret || Buffer.byteLength(secret) < 32) {
    return Response.json({ received: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }

  const supplied = request.headers.get(EVOLUTION_WEBHOOK_SECRET_HEADER);
  if (!supplied) return Response.json({ received: false }, { status: 401, headers: { "cache-control": "no-store" } });
  const expectedBytes = Buffer.from(secret, "utf8");
  const suppliedBytes = Buffer.from(supplied, "utf8");
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
    return Response.json({ received: false }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  return null;
}
