import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/auth/prisma";
import { apiError } from "@/lib/bot/http";
import { ValidationError } from "@/lib/bot/validation";
import { associateTripWhatsAppEvidence } from "@/lib/channels/whatsapp/web-evidence";

export async function PATCH(request: Request, { params }: { params: Promise<{ tripId: string; messageId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { tripId, messageId } = await params;
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ValidationError("La asociación no es válida");
    const input = body as Record<string, unknown>;
    if (typeof input.companyId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,79}$/u.test(input.companyId)) throw new ValidationError("Elegí una empresa válida");
    if (input.supplierId !== undefined && input.supplierId !== null && (typeof input.supplierId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,79}$/u.test(input.supplierId))) throw new ValidationError("El proveedor no es válido");
    const association = await associateTripWhatsAppEvidence(getPrisma(), user.id, tripId, messageId, { companyId: input.companyId, supplierId: input.supplierId as string | null | undefined });
    return Response.json({ association }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
