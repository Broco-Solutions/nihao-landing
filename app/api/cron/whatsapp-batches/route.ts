export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const batchSecret = process.env.WHATSAPP_BATCH_SECRET;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  if (!batchSecret || !apiUrl) return new Response("Cron not configured", { status: 503 });
  const response = await fetch(new URL("/api/channels/whatsapp/process-batches", apiUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${batchSecret}` },
    cache: "no-store",
    signal: AbortSignal.timeout(55_000),
  });
  if (!response.ok) return new Response("Batch processing failed", { status: 502 });
  return Response.json(await response.json());
}
