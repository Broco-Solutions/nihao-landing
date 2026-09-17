import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { AttachmentService } from "@/lib/bot/attachments";
import { apiError } from "@/lib/bot/http";
import { PrismaAttachmentRepository } from "@/lib/bot/persistence/prisma-attachment-repository";
import { getStorageProvider } from "@/lib/bot/storage";
import { parseTripContext } from "@/lib/bot/validation";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ captureId: string; attachmentId: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const { captureId, attachmentId } = await params;
    const { tripId } = parseTripContext({ tripId: new URL(request.url).searchParams.get("tripId") });
    const service = new AttachmentService(new PrismaAttachmentRepository(getPrisma()), getStorageProvider());
    await service.delete({ userId: user.id, tripId }, captureId, attachmentId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
