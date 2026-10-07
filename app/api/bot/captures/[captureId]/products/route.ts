import { deriveProductStatus } from "@/lib/bot/record-completeness";
import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { apiError } from "@/lib/bot/http";
import { parseProduct, productRecord, writableCapture } from "@/lib/bot/supplier-edit";
import { parseTripContext } from "@/lib/bot/validation";

export async function GET(request: Request, { params }: { params: Promise<{ captureId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { captureId } = await params;
    const { tripId } = parseTripContext({ tripId: new URL(request.url).searchParams.get("tripId") });
    await writableCapture(getPrisma(), user.id, tripId, captureId);
    const products = await getPrisma().supplierProduct.findMany({ where: { captureId }, include: { images: { select: { id: true } } }, orderBy: { createdAt: "asc" } });
    return Response.json({ products: products.map(productRecord) });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ captureId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { captureId } = await params;
    const body = await request.json();
    const { tripId } = parseTripContext(body);
    const capture = await writableCapture(getPrisma(), user.id, tripId, captureId);
    const data = parseProduct(body);
    const product = await getPrisma().supplierProduct.create({ data: { ...data, status: deriveProductStatus({ ...data, status: "DRAFT" }), captureId, supplierId: capture.supplier?.id ?? null }, include: { images: { select: { id: true } } } });
    return Response.json({ product: productRecord(product) }, { status: 201 });
  } catch (error) { return apiError(error); }
}
