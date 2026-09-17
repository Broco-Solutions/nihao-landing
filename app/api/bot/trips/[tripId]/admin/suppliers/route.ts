import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { apiError } from "@/lib/bot/http";
import { PrismaTripSupplierReportRepository } from "@/lib/bot/persistence/prisma-trip-supplier-report-repository";
import { ValidationError } from "@/lib/bot/validation";

function integer(value: string | null, fallback: number, max: number) { const parsed = value ? Number(value) : fallback; if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) throw new ValidationError("Parámetro de reporte inválido"); return parsed; }
export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try { const user = await getAuthenticatedUser(); const { tripId } = await params; const query = new URL(request.url).searchParams; const supplierType = query.get("supplierType"); if (supplierType && !["FACTORY", "TRADING", "UNKNOWN"].includes(supplierType)) throw new ValidationError("Tipo de proveedor inválido"); const order = query.get("order") ?? "recent"; if (!["recent", "company", "interest"].includes(order)) throw new ValidationError("Orden inválido"); const incomplete = query.get("incomplete"); if (incomplete && incomplete !== "1") throw new ValidationError("Filtro de completitud inválido"); const compareIds = query.get("compare")?.split(",").filter(Boolean) ?? []; if (compareIds.length > 4) throw new ValidationError("Podés comparar hasta 4 proveedores"); const dashboard = await new PrismaTripSupplierReportRepository(getPrisma()).getForAdmin(user.id, tripId, { search: query.get("search")?.trim() || undefined, category: query.get("category") || undefined, supplierType: supplierType as never, travelerId: query.get("travelerId") || undefined, interest: query.get("interest") ? integer(query.get("interest"), 1, 5) : undefined, incomplete: incomplete === "1", page: integer(query.get("page"), 1, 10_000), limit: integer(query.get("limit"), 12, 50), order: order as never, compareIds }); return Response.json({ report: dashboard }); }
  catch (error) { return apiError(error); }
}
