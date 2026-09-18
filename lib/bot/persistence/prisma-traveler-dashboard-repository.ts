import type { PrismaClient, Trip } from "../../../generated/prisma/client.ts";
import { CaptureStatus } from "../../../generated/prisma/client.ts";
import { requireTripMember } from "../authorization.ts";
import type { SupplierRecord, Tier1Field, TravelerDashboardRecord, TripMemberRole, TripRecord, TripStatus } from "../types.ts";
import { PrismaTripAccessRepository } from "./prisma-trip-access-repository.ts";

const RECENT_LIMIT = 5;
const PENDING_LIMIT = 3;

function parseFieldList(value: unknown): Tier1Field[] {
  return Array.isArray(value) ? value.filter((field): field is Tier1Field => typeof field === "string") : [];
}

function toTripRecord(trip: Trip, role: TripMemberRole): TripRecord {
  return { id: trip.id, userId: trip.createdById, name: trip.name, startDate: trip.startDate?.toISOString() ?? null, endDate: trip.endDate?.toISOString() ?? null, status: trip.status as TripStatus, role, createdAt: trip.createdAt.toISOString(), updatedAt: trip.updatedAt.toISOString() };
}

function toSupplierRecord(supplier: Awaited<ReturnType<PrismaClient["supplier"]["findMany"]>>[number]): SupplierRecord {
  const fob = supplier.fobAmount !== null || supplier.fobCurrency !== null || supplier.fobUnit !== null || supplier.fobRawText !== null ? { amount: supplier.fobAmount === null ? null : Number(supplier.fobAmount), currency: supplier.fobCurrency, unit: supplier.fobUnit, rawText: supplier.fobRawText ?? "" } : null;
  const moq = supplier.moqQuantity !== null || supplier.moqUnit !== null || supplier.moqNotes !== null || supplier.moqRawText !== null ? { quantity: supplier.moqQuantity, unit: supplier.moqUnit, notes: supplier.moqNotes, rawText: supplier.moqRawText ?? "" } : null;
  const leadTime = supplier.leadTimeRawText !== null || supplier.leadTimeDays !== null ? { rawText: supplier.leadTimeRawText ?? "", days: supplier.leadTimeDays } : null;
  return { id: supplier.id, userId: supplier.createdById, tripId: supplier.tripId, captureId: supplier.captureId, status: supplier.status, companyName: supplier.companyName, city: supplier.city, province: supplier.province, contact: null, category: supplier.category, supplierType: supplier.supplierType, fob, moq, leadTime, interestScore: supplier.interestScore, pendingFields: parseFieldList(supplier.pendingFields), createdAt: supplier.createdAt.toISOString(), updatedAt: supplier.updatedAt.toISOString() };
}

/**
 * Operational view for one person. It deliberately scopes every query to the
 * session user, including when that person is also an ADMIN in the trip.
 */
export class PrismaTravelerDashboardRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getForTraveler(userId: string, tripId: string, now = new Date()): Promise<TravelerDashboardRecord | null> {
    const membership = await requireTripMember(new PrismaTripAccessRepository(this.prisma), { userId, tripId });
    const todayStartUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const owner = { tripId, createdById: userId };
    const [trip, confirmedCount, pendingCount, todayCount, pending, recent] = await Promise.all([
      this.prisma.trip.findUnique({ where: { id: tripId } }),
      this.prisma.supplier.count({ where: owner }),
      this.prisma.supplierCapture.count({ where: { ...owner, status: CaptureStatus.DRAFT } }),
      this.prisma.supplier.count({ where: { ...owner, createdAt: { gte: todayStartUtc } } }),
      this.prisma.supplierCapture.findMany({ where: { ...owner, status: CaptureStatus.DRAFT }, orderBy: { updatedAt: "desc" }, take: PENDING_LIMIT, select: { id: true, companyName: true, city: true, reviewFields: true, missingFields: true, acknowledgedUnknownFields: true, needsReanalysis: true, updatedAt: true } }),
      this.prisma.supplier.findMany({ where: owner, orderBy: { updatedAt: "desc" }, take: RECENT_LIMIT }),
    ]);
    if (!trip) return null;
    return {
      trip: toTripRecord(trip, membership.role),
      metrics: { confirmedCount, pendingCount, todayCount },
      pending: pending.map((capture) => {
        const acknowledged = new Set(parseFieldList(capture.acknowledgedUnknownFields));
        return { id: capture.id, companyName: capture.companyName, city: capture.city, reviewCount: parseFieldList(capture.reviewFields).length, missingCount: parseFieldList(capture.missingFields).filter((field) => !acknowledged.has(field)).length, needsReanalysis: capture.needsReanalysis, updatedAt: capture.updatedAt.toISOString() };
      }),
      recent: recent.map(toSupplierRecord),
    };
  }
}
