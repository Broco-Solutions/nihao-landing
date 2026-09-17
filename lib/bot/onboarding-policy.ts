import type { TripMemberRole } from "./types.ts";

export function isTravelerOnboardingRequired(role: TripMemberRole, onboardingCompletedAt: Date | string | null): boolean {
  return role === "TRAVELER" && onboardingCompletedAt === null;
}
