/** Trip form dates are calendar dates stored at UTC midnight (and displayed in UTC).
 * Interpret their last day inclusively in the business timezone, not the worker TZ.
 * Explicit timestamps retain instant semantics. Undated trips keep existing policy. */
export const BUSINESS_TIME_ZONE = process.env.WHATSAPP_BUSINESS_TIME_ZONE ?? "America/Argentina/Cordoba";
export function businessDay(now = new Date(), timeZone = BUSINESS_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (key: string) => parts.find(p => p.type === key)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function eligibleTrip(trip: { status?: string; endDate?: Date | string | null }, now = new Date(), timeZone = BUSINESS_TIME_ZONE): boolean {
  if (trip.status && !["ACTIVE", "PLANNED"].includes(trip.status)) return false;
  if (!trip.endDate) return true;
  const end = new Date(trip.endDate);
  if (!Number.isFinite(end.getTime())) return false;
  const iso = end.toISOString();
  return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) >= businessDay(now, timeZone) : end >= now;
}
export function eligibleTripWhere(now = new Date()) {
  return { status: { in: ["ACTIVE", "PLANNED"] as Array<"ACTIVE" | "PLANNED"> }, OR: [{ endDate: null }, { endDate: { gte: new Date(Math.min(now.getTime(), Date.parse(`${businessDay(now)}T00:00:00.000Z`))) } }] };
}
