import type { PrismaClient } from "../../../generated/prisma/client.ts";
import { AuthorizationError } from "../authorization.ts";
import { ValidationError } from "../validation.ts";

export async function accessibleCompanyIds(prisma: PrismaClient, userId: string, tripId: string): Promise<string[] | null> {
  const member = await prisma.tripMember.findUnique({ where: { tripId_userId: { tripId, userId } }, select: { role: true } });
  if (!member) throw new AuthorizationError("No tenés acceso a este viaje");
  if (member.role === "ADMIN") return null;
  const companies = await prisma.tripCompanyMember.findMany({ where: { userId, company: { tripId } }, select: { companyId: true } });
  return companies.map((company) => company.companyId);
}

export async function resolveCompanyId(prisma: PrismaClient, userId: string, tripId: string, requested?: string, includeInactive = false): Promise<string> {
  const allowed = await accessibleCompanyIds(prisma, userId, tripId);
  if (requested) {
    const exists = await prisma.tripCompany.findFirst({ where: { id: requested, tripId, ...(includeInactive ? {} : { active: true }) }, select: { id: true } });
    if (!exists || (allowed && !allowed.includes(requested))) throw new AuthorizationError("No tenés acceso a esta empresa");
    return requested;
  }
  const companies = allowed
    ? (await prisma.tripCompany.findMany({ where: { id: { in: allowed }, active: true }, select: { id: true } })).map((company) => company.id)
    : (await prisma.tripCompany.findMany({ where: { tripId, active: true }, select: { id: true } })).map((company) => company.id);
  if (companies.length === 1) return companies[0];
  throw new ValidationError("Elegí la empresa para este proveedor");
}

export async function requireCompanyAccess(prisma: PrismaClient, userId: string, tripId: string, companyId: string): Promise<void> {
  await resolveCompanyId(prisma, userId, tripId, companyId, true);
}
