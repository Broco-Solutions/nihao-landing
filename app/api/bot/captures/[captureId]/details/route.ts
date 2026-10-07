import { autoConfirmWebCapture } from "@/lib/bot/persistence/auto-confirmation";
import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { apiError } from "@/lib/bot/http";
import { writableCapture, parseSupplierEdit } from "@/lib/bot/supplier-edit";
import { parseTripContext, ValidationError } from "@/lib/bot/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ captureId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { captureId } = await params;
    const body = await request.json();
    const { tripId } = parseTripContext(body);
    const prisma = getPrisma();
    const capture = await writableCapture(prisma, user.id, tripId, captureId);
    const { data, contacts } = parseSupplierEdit(body);
    if (Object.keys(data).some((key) => !["website", "notes"].includes(key))) throw new ValidationError("Campo de captura inválido");
    const updated = await prisma.supplierCapture.update({ where: { id: captureId }, data: { ...(capture.supplier ? { status: "DRAFT" as const } : {}), ...(data.notes !== undefined ? { notes: data.notes as string | null } : {}), ...(data.website !== undefined ? { website: data.website as string | null } : {}), ...(contacts ? { contactMethods: contacts } : {}) } });
    const confirmed = await autoConfirmWebCapture(prisma, { userId: user.id, tripId }, captureId);
    return Response.json({ website: updated.website, contactMethods: updated.contactMethods, capture: confirmed });
  } catch (error) { return apiError(error); }
}
