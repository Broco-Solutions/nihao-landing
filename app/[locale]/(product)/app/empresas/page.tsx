import { CompaniesClient } from "@/components/app/CompaniesClient";
import { getPrisma } from "@/lib/auth/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireUserAdmin } from "@/lib/bot/authorization";

export default async function CompaniesPage() {
  const user = await getAuthenticatedUser();
  await requireUserAdmin(getPrisma(), user.id);
  return <CompaniesClient />;
}
