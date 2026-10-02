import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { apiError } from "@/lib/bot/http";
import { productUpdateData, productRecord, writableCapture } from "@/lib/bot/supplier-edit";
import { CaptureNotFoundError } from "@/lib/bot/persistence/repository";
import { parseTripContext, ValidationError } from "@/lib/bot/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ captureId: string; productId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { captureId, productId } = await params;
    const body = await request.json();
    const { tripId } = parseTripContext(body);
    await writableCapture(getPrisma(), user.id, tripId, captureId);
    const existing = await getPrisma().supplierProduct.findFirst({ where: { id: productId, captureId } });
    if (!existing) throw new CaptureNotFoundError("Producto no encontrado");
    const product = await getPrisma().supplierProduct.update({ where: { id: productId }, data: productUpdateData(existing, body), include: { images: { select: { id: true } } } });
    return Response.json({ product: productRecord(product) });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ captureId: string; productId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { captureId, productId } = await params;
    const { tripId } = parseTripContext({ tripId: new URL(request.url).searchParams.get("tripId") });
    await writableCapture(getPrisma(), user.id, tripId, captureId);
    const existing = await getPrisma().supplierProduct.findFirst({ where: { id: productId, captureId }, include: { images: { select: { id: true } } } });
    if (!existing) throw new CaptureNotFoundError("Producto no encontrado");
    if (existing.images.length) throw new ValidationError("Desasigná las imágenes antes de eliminar el producto");
    await getPrisma().supplierProduct.delete({ where: { id: productId } });
    return new Response(null, { status: 204 });
  } catch (error) { return apiError(error); }
}
