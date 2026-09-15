import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { AttachmentService, MAX_ATTACHMENT_SIZE } from "@/lib/bot/attachments";
import { apiError } from "@/lib/bot/http";
import { PrismaAttachmentRepository } from "@/lib/bot/persistence/prisma-attachment-repository";
import { getStorageProvider } from "@/lib/bot/storage";
import { parseTripContext, ValidationError } from "@/lib/bot/validation";

function service() {
  return new AttachmentService(new PrismaAttachmentRepository(getPrisma()), getStorageProvider());
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ captureId: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const { captureId } = await params;
    const { tripId } = parseTripContext({ tripId: new URL(request.url).searchParams.get("tripId") });
    const attachments = await service().list({ userId: user.id, tripId }, captureId);
    return Response.json({ attachments });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ captureId: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const { captureId } = await params;
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_ATTACHMENT_SIZE + 512 * 1024) throw new ValidationError("El archivo debe pesar hasta 8 MB");
    const form = await request.formData();
    const { tripId } = parseTripContext({ tripId: form.get("tripId") });
    const file = form.get("file");
    if (!(file instanceof File)) throw new ValidationError("Seleccioná una imagen");
    const attachment = await service().upload({
      userId: user.id,
      tripId,
      captureId,
      type: form.get("type"),
      mimeType: file.type,
      size: file.size,
      body: new Uint8Array(await file.arrayBuffer()),
    });
    return Response.json({ attachment }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
