import type { Prisma } from "../../../generated/prisma/client.ts";
import { eligibleTrip, eligibleTripWhere } from "../domain/trip-eligibility.ts";

/** Authorized business catalogue, shared without channel or model types. */
export async function userTripCatalog(db: Prisma.TransactionClient, userId: string, includeSuppliers = false) {
  const memberships = await db.tripMember.findMany({ where: { userId, role: "TRAVELER", trip: eligibleTripWhere() }, select: { trip: { select: { id: true, name: true, status: true, endDate: true, companies: { where: { active: true, members: { some: { userId } } }, select: { id: true, catalogCompany: { select: { name: true } } }, orderBy: { catalogCompany: { name: "asc" } } } } } } });
  const trips = memberships.filter(({ trip }) => eligibleTrip(trip)).map(({ trip }) => ({ id: trip.id, name: trip.name, companies: trip.companies.map((c) => ({ id: c.id, name: c.catalogCompany.name })) })).filter((t) => t.companies.length).sort((a, b) => a.name.localeCompare(b.name));
  if (!includeSuppliers) return { trips };
  return { trips: await Promise.all(trips.map(async (trip) => ({ ...trip, suppliers: (await db.supplier.findMany({ where: { tripId: trip.id, companyId: { in: trip.companies.map((c) => c.id) }, status: "CONFIRMED", companyName: { not: null } }, select: { id: true, companyName: true, companyId: true, captureId: true, city: true }, orderBy: [{ companyName: "asc" }, { id: "asc" }] })).map((s) => ({ id: s.id, name: s.companyName!, companyId: s.companyId, captureId: s.captureId, city: s.city })) }))) };
}
