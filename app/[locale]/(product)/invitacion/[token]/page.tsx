import { InvitationPage } from "@/components/app/InvitationPage";

export default async function InvitationRoute({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InvitationPage token={token} />;
}
