import { requireTripMember } from "@/lib/bot/authorization";
import { PrismaTripAccessRepository } from "@/lib/bot/persistence/prisma-trip-access-repository";
import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { AttachmentService } from "@/lib/bot/attachments";
import { apiError } from "@/lib/bot/http";
import { PrismaAttachmentRepository } from "@/lib/bot/persistence/prisma-attachment-repository";
import { getStorageProvider } from "@/lib/bot/storage";
import { parseTripContext } from "@/lib/bot/validation";
import { writableCapture } from "@/lib/bot/supplier-edit";
import { ValidationError } from "@/lib/bot/validation";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ captureId: string; attachmentId: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const { captureId, attachmentId } = await params;
    const { tripId } = parseTripContext({ tripId: new URL(request.url).searchParams.get("tripId") });
    await requireTripMember(new PrismaTripAccessRepository(getPrisma()), { userId: user.id, tripId: tripId });
    const service = new AttachmentService(new PrismaAttachmentRepository(getPrisma()), getStorageProvider());
    await service.delete({ userId: user.id, tripId }, captureId, attachmentId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ captureId: string; attachmentId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { captureId, attachmentId } = await params;
    const body = await request.json();
    const { tripId } = parseTripContext(body);
    const prisma = getPrisma();
    await writableCapture(prisma, user.id, tripId, captureId);
    const attachment = await prisma.supplierAttachment.findFirst({ where: { id: attachmentId, supplierCaptureId: captureId, type: "PRODUCT_IMAGE" } });
    if (!attachment) throw new ValidationError("Imagen no encontrada");
    const productId = body.productId === null ? null : body.productId;
    if (productId !== null) {
      if (typeof productId !== "string") throw new ValidationError("Producto inválido");
      const product = await prisma.supplierProduct.findFirst({ where: { id: productId, captureId } });
      if (!product) throw new ValidationError("Producto inválido");
    }
    await prisma.supplierAttachment.update({ where: { id: attachmentId }, data: { productId } });
    return Response.json({ productId });
  } catch (error) { return apiError(error); }
}
