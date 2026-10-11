import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { apiError } from "@/lib/bot/http";
import { isTravelerOnboardingRequired } from "@/lib/bot/onboarding-policy";
import { PrismaTripOnboardingRepository } from "@/lib/bot/persistence/prisma-trip-onboarding-repository";
import { PrismaTravelerWelcomeService } from "@/lib/channels/whatsapp/traveler-welcome";

export async function GET(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { tripId } = await params;
    const prisma = getPrisma();
    const state = await new PrismaTripOnboardingRepository(prisma).getForMember(user.id, tripId);
    const whatsapp = await new PrismaTravelerWelcomeService(prisma).state(user.id, tripId);
    return Response.json({ ...state, ...whatsapp, onboardingRequired: isTravelerOnboardingRequired(state.role, state.onboardingCompletedAt), onboardingCompletedAt: state.onboardingCompletedAt?.toISOString() ?? null });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const user = await getAuthenticatedUser();
    const { tripId } = await params;
    const prisma = getPrisma();
    const body = await request.json().catch(() => ({})) as { whatsappConsent?: unknown };
    const state = await new PrismaTripOnboardingRepository(prisma).complete(user.id, tripId);
    const welcome = new PrismaTravelerWelcomeService(prisma);
    let whatsappConsentSaved = body.whatsappConsent !== true;
    try {
      if (body.whatsappConsent === true) { await welcome.setConsent(user.id, tripId, true, "ONBOARDING"); whatsappConsentSaved = true; }
      else await welcome.reevaluate(user.id, tripId);
    } catch (error) { console.error("WhatsApp welcome reevaluation failed after onboarding", { error: error instanceof Error ? error.name : "UnknownError" }); }
    return Response.json({ ...state, whatsappConsentSaved, onboardingRequired: false, onboardingCompletedAt: state.onboardingCompletedAt?.toISOString() ?? null });
  } catch (error) { return apiError(error); }
}
