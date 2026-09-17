import type { CaptureContext } from "./persistence/repository.ts";

/** Server-only identity for the public commercial demo. It is never accepted from the browser. */
export const DEMO_CAPTURE_CONTEXT: CaptureContext & { tripName: string } = {
  userId: "demo-user",
  tripId: "canton-fair-2026",
  tripName: "Feria de Cantón 2026",
};
