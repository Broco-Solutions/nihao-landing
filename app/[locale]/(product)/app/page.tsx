import type { Metadata } from "next";
import { TripsClient } from "@/components/app/TripsClient";

export const metadata: Metadata = { title: "Mis viajes · Nihao Bot", robots: { index: false } };

export default function ProductHomePage() {
  return <TripsClient />;
}
