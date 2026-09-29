import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { apiError } from "@/lib/bot/http";
import { PrismaSupplierCaptureRepository } from "@/lib/bot/persistence/prisma-repository";
import { parseTripContext } from "@/lib/bot/validation";
import { parseSupplierEdit, writableSupplier } from "@/lib/bot/supplier-edit";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ supplierId: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const { supplierId } = await params;
    const { tripId } = parseTripContext({ tripId: new URL(request.url).searchParams.get("tripId") });
    const supplier = await new PrismaSupplierCaptureRepository(getPrisma()).getSupplier({ userId: user.id, tripId }, supplierId);
    if (!supplier) return Response.json({ error: "Proveedor no encontrado en este viaje" }, { status: 404 });
    return Response.json({ supplier });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ supplierId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { supplierId } = await params;
    const body = await request.json();
    const { tripId } = parseTripContext(body);
    const prisma = getPrisma();
    const existing = await writableSupplier(prisma, user.id, tripId, supplierId);
    const { data, contacts } = parseSupplierEdit(body);
    const pending = new Set(Array.isArray(existing.pendingFields) ? existing.pendingFields.filter((field): field is string => typeof field === "string") : []);
    for (const field of ["companyName", "city", "province", "category", "supplierType", "interestScore"] as const) if (field in data) {
      if (data[field] === null || data[field] === "UNKNOWN") pending.add(field); else pending.delete(field);
    }
    if (contacts) { if (contacts.length) pending.delete("contact"); else pending.add("contact"); }
    await prisma.$transaction(async (transaction) => {
      await transaction.supplier.update({ where: { id: supplierId }, data: { ...data, pendingFields: [...pending] } });
      if (contacts) {
        await transaction.supplierContact.deleteMany({ where: { supplierId } });
        if (contacts.length) await transaction.supplierContact.createMany({ data: contacts.map((contact) => ({ ...contact, supplierId, tripId, createdById: user.id })) });
      }
    });
    const supplier = await new PrismaSupplierCaptureRepository(prisma).getSupplier({ userId: user.id, tripId }, supplierId);
    return Response.json({ supplier });
  } catch (error) { return apiError(error); }
}
