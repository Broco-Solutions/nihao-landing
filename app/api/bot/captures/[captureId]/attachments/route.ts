import { requireTripMember } from "@/lib/bot/authorization";
import { PrismaTripAccessRepository } from "@/lib/bot/persistence/prisma-trip-access-repository";
import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { AttachmentService, MAX_ATTACHMENT_SIZE, parseAttachmentType, validateAttachmentFile } from "@/lib/bot/attachments";
import { boundedRequestBody, MediaIngressError } from "@/lib/channels/whatsapp/media-ingress";
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
    if (contentLength > MAX_ATTACHMENT_SIZE + 512 * 1024) throw new ValidationError("El archivo es demasiado grande");
    const body = await boundedRequestBody(request, MAX_ATTACHMENT_SIZE + 512 * 1024);
    const form = await new Response(body as unknown as BodyInit, { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData();
    const { tripId } = parseTripContext({ tripId: form.get("tripId") });
    const file = form.get("file");
    await requireTripMember(new PrismaTripAccessRepository(getPrisma()), { userId: user.id, tripId: tripId });
    if (!(file instanceof File)) throw new ValidationError("Seleccioná un archivo");
    validateAttachmentFile(file.type, file.size, parseAttachmentType(form.get("type")));
    const attachment = await service().upload({
      userId: user.id,
      tripId,
      captureId,
      type: form.get("type"),
      mimeType: file.type,
      size: file.size,
      clientEvidenceId: typeof form.get("clientEvidenceId") === "string" ? form.get("clientEvidenceId") as string : undefined,
      body: new Uint8Array(await file.arrayBuffer()),
    });
    return Response.json({ attachment }, { status: 201 });
  } catch (error) {
    if (error instanceof MediaIngressError) return Response.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}
