import { SupplierType, type PrismaClient } from "../../../generated/prisma/client.ts";
import { requireTripAdmin } from "../authorization.ts";
import { PrismaTripAccessRepository } from "./prisma-trip-access-repository.ts";

export type SupplierReportFilters = { search?: string; category?: string; companyId?: string; supplierType?: "FACTORY" | "TRADING" | "UNKNOWN"; travelerId?: string; interest?: number; incomplete?: boolean; page: number; limit: number; order: "recent" | "company" | "interest"; compareIds?: string[] };

export class PrismaTripSupplierReportRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getForAdmin(userId: string, tripId: string, filters: SupplierReportFilters) {
    await requireTripAdmin(new PrismaTripAccessRepository(this.prisma), { userId, tripId });
    const where = { tripId, ...(filters.companyId ? { companyId: filters.companyId } : {}), ...(filters.category ? { category: filters.category } : {}), ...(filters.supplierType ? { supplierType: filters.supplierType as SupplierType } : {}), ...(filters.travelerId ? { createdById: filters.travelerId } : {}), ...(filters.interest ? { interestScore: filters.interest } : {}), ...(filters.incomplete ? { NOT: { pendingFields: { equals: [] } } } : {}), ...(filters.search ? { OR: [...["companyName", "city", "province", "category"].map((field) => ({ [field]: { contains: filters.search, mode: "insensitive" as const } })), { contacts: { some: { rawText: { contains: filters.search, mode: "insensitive" as const } } } }] } : {}) };
    const orderBy = filters.order === "company" ? { companyName: "asc" as const } : filters.order === "interest" ? { interestScore: "desc" as const } : { updatedAt: "desc" as const };
    const [total, suppliers, categories, travelers, draftCount, confirmedIncompleteCount, comparison, companies] = await Promise.all([
      this.prisma.supplier.count({ where }),
      this.prisma.supplier.findMany({ where, orderBy, skip: (filters.page - 1) * filters.limit, take: filters.limit, select: { id: true, companyName: true, company: { select: { id: true, name: true } }, city: true, province: true, category: true, supplierType: true, fobAmount: true, fobCurrency: true, fobUnit: true, fobRawText: true, moqQuantity: true, moqUnit: true, moqRawText: true, leadTimeDays: true, leadTimeRawText: true, interestScore: true, createdAt: true, createdBy: { select: { id: true, name: true, email: true } }, contacts: { take: 1, orderBy: { createdAt: "desc" }, select: { rawText: true } } } }),
      this.prisma.supplier.groupBy({ by: ["category"], where: { tripId, ...(filters.companyId ? { companyId: filters.companyId } : {}) }, _count: { _all: true }, orderBy: { _count: { category: "desc" } } }),
      this.prisma.tripMember.findMany({ where: { tripId, role: "TRAVELER" }, select: { userId: true, user: { select: { name: true } } }, orderBy: { user: { name: "asc" } } }),
      this.prisma.supplierCapture.count({ where: { tripId, ...(filters.companyId ? { companyId: filters.companyId } : {}), status: "DRAFT" } }),
      this.prisma.supplier.count({ where: { tripId, ...(filters.companyId ? { companyId: filters.companyId } : {}), NOT: { pendingFields: { equals: [] } } } }),
      filters.compareIds?.length ? this.prisma.supplier.findMany({ where: { tripId, id: { in: filters.compareIds } }, select: { id: true, companyName: true, city: true, province: true, category: true, supplierType: true, fobAmount: true, fobCurrency: true, fobUnit: true, fobRawText: true, moqQuantity: true, moqUnit: true, moqRawText: true, leadTimeDays: true, leadTimeRawText: true, interestScore: true, contacts: { take: 1, orderBy: { createdAt: "desc" }, select: { rawText: true } } } }) : Promise.resolve([]),
      this.prisma.tripCompany.findMany({ where: { tripId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    return { total, page: filters.page, limit: filters.limit, suppliers, companies, categories: categories.map((item) => ({ category: item.category ?? "Sin categoría", count: item._count._all })), travelers: travelers.map((item) => ({ id: item.userId, name: item.user.name })), draftCount, confirmedIncompleteCount, comparison, comparisonComplete: !filters.compareIds?.length || comparison.length === filters.compareIds.length };
  }
}
