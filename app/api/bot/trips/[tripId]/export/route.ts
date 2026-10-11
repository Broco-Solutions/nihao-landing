import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";
import { apiError } from "@/lib/bot/http";
import { getTripInsights } from "@/lib/bot/trip-insights";
import { ValidationError } from "@/lib/bot/validation";

import { sheetsFor, renderPdf, renderXlsx, type Kind } from "@/lib/bot/trip-export";
import { tripExportFilename } from "@/lib/app-routes";

function contentDisposition(disposition: "inline" | "attachment", filename: string) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\\r\n]/g, "_");
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const user = await getAuthenticatedUser(); const { tripId } = await params;
    const query = new URL(request.url).searchParams;
    const kind = query.get("kind") ?? "report"; const format = query.get("format") ?? "pdf";
    if (!["report", "summary", "suppliers", "products"].includes(kind) || !["pdf", "xlsx"].includes(format)) throw new ValidationError("Exportacion invalida");
    const data = await getTripInsights(getPrisma(), user.id, tripId);
    const sheets = sheetsFor(data, kind as Kind);
    const bytes = format === "pdf" ? await renderPdf(sheets, { tripName: data.trip.name, startDate: data.trip.startDate, endDate: data.trip.endDate }) : await renderXlsx(sheets);
    const date = new Date().toISOString().slice(0, 10);
    const filename = tripExportFilename(data.trip.name, format as "pdf" | "xlsx", date, kind);
    const disposition = format === "pdf" && query.get("view") === "1" ? "inline" : "attachment";
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": contentDisposition(disposition, filename), "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
