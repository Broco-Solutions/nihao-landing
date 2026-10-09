import { captureProducts } from "@/lib/nihao/operations/read-records";
import { createProduct } from "@/lib/nihao/operations/create-product";
import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { apiError } from "@/lib/bot/http";
import { productRecord } from "@/lib/bot/supplier-edit";
import { parseTripContext } from "@/lib/bot/validation";

export async function GET(request: Request, { params }: { params: Promise<{ captureId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { captureId } = await params;
    const { tripId } = parseTripContext({ tripId: new URL(request.url).searchParams.get("tripId") });
    const products = await captureProducts(getPrisma(), { userId: user.id, tripId }, captureId);
    return Response.json({ products: products.map(productRecord) });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ captureId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { captureId } = await params;
    const body = await request.json();
    const { tripId } = parseTripContext(body);
    const product = await getPrisma().$transaction(tx => createProduct(tx, { userId: user.id, tripId }, { captureId, fields: body }, { access: "web", confirmation: "immediate" }));
    return Response.json({ product: productRecord(product) }, { status: 201 });
  } catch (error) { return apiError(error); }
}
