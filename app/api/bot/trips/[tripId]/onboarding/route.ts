import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { apiError } from "@/lib/bot/http";
import { isTravelerOnboardingRequired } from "@/lib/bot/onboarding-policy";
import { PrismaTripOnboardingRepository } from "@/lib/bot/persistence/prisma-trip-onboarding-repository";

export async function GET(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { tripId } = await params;
    const state = await new PrismaTripOnboardingRepository(getPrisma()).getForMember(user.id, tripId);
    return Response.json({ ...state, onboardingRequired: isTravelerOnboardingRequired(state.role, state.onboardingCompletedAt), onboardingCompletedAt: state.onboardingCompletedAt?.toISOString() ?? null });
  } catch (error) { return apiError(error); }
}

export async function POST(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { tripId } = await params;
    const state = await new PrismaTripOnboardingRepository(getPrisma()).complete(user.id, tripId);
    return Response.json({ ...state, onboardingRequired: false, onboardingCompletedAt: state.onboardingCompletedAt?.toISOString() ?? null });
  } catch (error) { return apiError(error); }
}
