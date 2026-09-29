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
    if (capture.status !== "DRAFT") throw new ValidationError("El proveedor ya está confirmado");
    const { data, contacts } = parseSupplierEdit(body);
    if (Object.keys(data).some((key) => key !== "website")) throw new ValidationError("Campo de captura inválido");
    const updated = await prisma.supplierCapture.update({ where: { id: captureId }, data: { ...(data.website !== undefined ? { website: data.website as string | null } : {}), ...(contacts ? { contactMethods: contacts } : {}) } });
    return Response.json({ website: updated.website, contactMethods: updated.contactMethods });
  } catch (error) { return apiError(error); }
}
