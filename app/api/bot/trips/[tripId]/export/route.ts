import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";
import { apiError } from "@/lib/bot/http";
import { getTripInsights } from "@/lib/bot/trip-insights";
import { ValidationError } from "@/lib/bot/validation";

import { sheetsFor, renderPdf, renderXlsx, type Kind } from "@/lib/bot/trip-export";

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const user = await getAuthenticatedUser(); const { tripId } = await params;
    const query = new URL(request.url).searchParams;
    const kind = query.get("kind") ?? "report"; const format = query.get("format") ?? "pdf";
    if (!["report", "summary", "suppliers", "products"].includes(kind) || !["pdf", "xlsx"].includes(format)) throw new ValidationError("Exportacion invalida");
    const data = await getTripInsights(getPrisma(), user.id, tripId);
    const sheets = sheetsFor(data, kind as Kind);
    const bytes = format === "pdf" ? await renderPdf(sheets) : await renderXlsx(sheets);
    const filename = `nihao-${kind}-${tripId}.${format}`;
    const disposition = format === "pdf" && query.get("view") === "1" ? "inline" : "attachment";
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `${disposition}; filename="${filename}"`, "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
