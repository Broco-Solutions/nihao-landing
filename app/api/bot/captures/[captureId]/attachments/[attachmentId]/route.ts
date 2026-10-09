import { requireTripMember } from "@/lib/bot/authorization";
import { PrismaTripAccessRepository } from "@/lib/bot/persistence/prisma-trip-access-repository";
import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { AttachmentService } from "@/lib/bot/attachments";
import { apiError } from "@/lib/bot/http";
import { PrismaAttachmentRepository } from "@/lib/bot/persistence/prisma-attachment-repository";
import { getStorageProvider } from "@/lib/bot/storage";
import { parseTripContext } from "@/lib/bot/validation";
import { assignProductAttachment } from "@/lib/nihao/operations/product-files";

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
    const productId = body.productId === null ? null : body.productId;
    await prisma.$transaction(tx => assignProductAttachment(tx, { userId: user.id, tripId }, { captureId, attachmentId, productId }, "web"));
    return Response.json({ productId });
  } catch (error) { return apiError(error); }
}
