import Link from "next/link";
import { AgendaEditor } from "@/components/app/AgendaEditor";

export default async function TravelerAgendaPage({ params }: { params: Promise<{ userId: string; tripId: string }> }) {
  const { userId, tripId } = await params;
  return <main className="app-page max-w-3xl pb-12"><Link href="/app/viajeros" className="text-sm font-semibold text-ink-mute">← Administrar viajeros</Link><AgendaEditor tripId={tripId} userId={userId} /></main>;
}
