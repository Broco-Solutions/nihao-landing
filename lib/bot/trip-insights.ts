import type { PrismaClient } from "../../generated/prisma/client.ts";
import { requireTripMember } from "./authorization.ts";
import { PrismaTripAccessRepository } from "./persistence/prisma-trip-access-repository.ts";
import { accessibleCompanyIds } from "./persistence/company-access.ts";

export async function getTripInsights(prisma: PrismaClient, userId: string, tripId: string) {
  const membership = await requireTripMember(new PrismaTripAccessRepository(prisma), { userId, tripId });
  const allowed = await accessibleCompanyIds(prisma, userId, tripId);
  const companyWhere = { tripId, active: true, ...(allowed ? { id: { in: allowed } } : {}) };
  const dataWhere = { tripId, ...(allowed ? { companyId: { in: allowed } } : {}) };
  const [trip, companies, suppliers, captures, agenda, members, feedback, pendingProducts] = await Promise.all([
    prisma.trip.findUniqueOrThrow({ where: { id: tripId }, select: { id: true, name: true, startDate: true, endDate: true, status: true } }),
    prisma.tripCompany.findMany({ where: companyWhere, select: { id: true, catalogCompany: { select: { name: true } }, members: { select: { userId: true } } }, orderBy: { catalogCompany: { name: "asc" } } }),
    prisma.supplier.findMany({ where: dataWhere, select: { id: true, companyId: true, companyName: true, city: true, province: true, category: true, supplierType: true, website: true, interestScore: true, createdAt: true, updatedAt: true, createdBy: { select: { id: true, name: true } }, contacts: { select: { id: true, type: true, rawText: true } }, products: { where: { status: "CONFIRMED" }, select: { id: true, name: true, fobAmount: true, fobCurrency: true, fobUnit: true, moqQuantity: true, moqUnit: true, leadTimeDays: true, leadTimeRawText: true, images: { select: { id: true } } } } }, orderBy: { updatedAt: "desc" } }),
    prisma.supplierCapture.findMany({ where: dataWhere, select: { id: true, companyId: true, companyName: true, city: true, status: true, sourceType: true, needsReanalysis: true, updatedAt: true, createdBy: { select: { id: true, name: true } }, attachments: { select: { id: true, type: true } } }, orderBy: { updatedAt: "desc" } }),
    prisma.tripAgendaEntry.findMany({ where: { tripId, ...(membership.role === "TRAVELER" ? { userId } : {}) }, select: { id: true, userId: true, date: true, time: true, place: true, address: true, instructions: true, traveler: { select: { user: { select: { name: true } } } } }, orderBy: [{ date: "asc" }, { time: "asc" }, { createdAt: "asc" }] }),
    membership.role === "ADMIN" ? prisma.tripMember.findMany({ where: { tripId, role: "TRAVELER" }, select: { userId: true, user: { select: { name: true, email: true } } } }) : Promise.resolve([]),
    membership.role === "ADMIN" ? prisma.tripFeedback.findMany({ where: { tripId }, select: { id: true, userId: true, rating: true, comment: true, updatedAt: true, user: { select: { name: true } } }, orderBy: { updatedAt: "desc" } }) : prisma.tripFeedback.findMany({ where: { tripId, userId }, select: { id: true, userId: true, rating: true, comment: true, updatedAt: true, user: { select: { name: true } } } }),
    prisma.supplierProduct.findMany({ where: { status: "DRAFT", capture: dataWhere }, select: { id: true, captureId: true, supplierId: true, name: true, fobAmount: true, fobCurrency: true, moqQuantity: true, leadTimeDays: true, capture: { select: { companyId: true, companyName: true } }, supplier: { select: { companyName: true } } }, orderBy: { createdAt: "desc" } }),
  ]);
  const companyNames = new Map(companies.map((company) => [company.id, company.catalogCompany.name]));
  const productCount = suppliers.reduce((sum, supplier) => sum + supplier.products.length, 0);
  const contactCount = suppliers.reduce((sum, supplier) => sum + supplier.contacts.length, 0);
  const cityCounts = new Map<string, number>();
  for (const supplier of suppliers) if (supplier.city?.trim()) cityCounts.set(supplier.city.trim(), (cityCounts.get(supplier.city.trim()) ?? 0) + 1);
  const categoryCounts = new Map<string, number>();
  for (const supplier of suppliers) if (supplier.category?.trim()) categoryCounts.set(supplier.category.trim(), (categoryCounts.get(supplier.category.trim()) ?? 0) + 1);
  return {
    role: membership.role,
    trip: { ...trip, startDate: trip.startDate?.toISOString() ?? null, endDate: trip.endDate?.toISOString() ?? null },
    companies: companies.map((company) => ({ id: company.id, name: company.catalogCompany.name, travelerIds: company.members.map((member) => member.userId) })),
    suppliers: suppliers.map((supplier) => ({ ...supplier, company: companyNames.get(supplier.companyId) ?? "", createdAt: supplier.createdAt.toISOString(), updatedAt: supplier.updatedAt.toISOString(), products: supplier.products.map((product) => ({ ...product, fobAmount: product.fobAmount === null ? null : Number(product.fobAmount) })) })),
    pendingProducts: pendingProducts.map(({ capture, supplier, ...product }) => ({ ...product, company: companyNames.get(capture.companyId) ?? "", supplierName: supplier?.companyName ?? capture.companyName ?? "Proveedor sin nombre", fobAmount: product.fobAmount === null ? null : Number(product.fobAmount) })),
    captures: captures.map((capture) => ({ ...capture, company: companyNames.get(capture.companyId) ?? "", updatedAt: capture.updatedAt.toISOString() })),
    agenda: agenda.map((entry) => ({ id: entry.id, userId: entry.userId, traveler: entry.traveler.user.name, date: entry.date.toISOString().slice(0, 10), time: entry.time, place: entry.place, address: entry.address, instructions: entry.instructions })),
    members: members.map((member) => ({ id: member.userId, name: member.user.name, email: member.user.email, companies: companies.filter((company) => company.members.some((item) => item.userId === member.userId)).map((company) => company.catalogCompany.name) })),
    feedback: feedback.map((item) => ({ ...item, name: item.user.name, updatedAt: item.updatedAt.toISOString() })),
    metrics: { travelerCount: members.length, supplierCount: suppliers.length, productCount, contactCount, cityCount: cityCounts.size, pendingCount: captures.filter((capture) => capture.status === "DRAFT").length, satisfaction: feedback.length ? Number((feedback.reduce((sum, item) => sum + item.rating, 0) / feedback.length).toFixed(1)) : null },
    cities: [...cityCounts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    categories: [...categoryCounts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  };
}

export type TripInsights = Awaited<ReturnType<typeof getTripInsights>>;
