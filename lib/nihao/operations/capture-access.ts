import type { Prisma } from "../../../generated/prisma/client.ts";
import { AuthorizationError } from "../../bot/authorization.ts";
import { accessibleCompanyIds } from "../../bot/persistence/company-access.ts";
import { CaptureConflictError } from "../../bot/persistence/repository.ts";

/** Identity and capabilities come from authenticated server code, never a body/tool. */
export type OperationContext = { userId: string; tripId: string; companyId?: string };
export type OperationAccess = "web" | "automation";

export async function authorizedOperationCompanies(tx: Prisma.TransactionClient, context: OperationContext, access: OperationAccess) {
  let companies: string[] | null;
  if (access === "automation") {
    const trip = await tx.trip.findFirst({
      where: { id: context.tripId, status: { in: ["ACTIVE", "PLANNED"] }, members: { some: { userId: context.userId, role: "TRAVELER" } } },
      select: { id: true },
    });
    const memberships = await tx.tripCompany.findMany({
      where: { tripId: context.tripId, active: true, members: { some: { userId: context.userId } } }, select: { id: true },
    });
    companies = memberships.map(c => c.id);
    if (!trip || !companies.length) throw new AuthorizationError("Contexto no autorizado");
  } else {
    companies = await accessibleCompanyIds(tx, context.userId, context.tripId);
  }
  if (context.companyId && companies && !companies.includes(context.companyId)) throw new AuthorizationError("Contexto no autorizado");
  return companies;
}

export async function writableCaptureForOperation(tx: Prisma.TransactionClient, context: OperationContext, captureId: string, access: OperationAccess) {
  const companies = await authorizedOperationCompanies(tx, context, access);
  const capture = await tx.supplierCapture.findFirst({
    where: { id: captureId, tripId: context.tripId, ...(context.companyId ? { companyId: context.companyId } : companies ? { companyId: { in: companies } } : {}) },
    include: { supplier: true },
  });
  if (!capture) throw new AuthorizationError("Captura no encontrada en este viaje");
  if (capture.deletedAt) throw new CaptureConflictError("El proveedor fue eliminado. Esta captura conserva las evidencias originales y no admite cambios.");
  return capture;
}
