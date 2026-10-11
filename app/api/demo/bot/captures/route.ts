import { DEMO_SUPPLIERS } from "@/lib/bot/demo-readonly";

export async function GET() { return Response.json({ suppliers: DEMO_SUPPLIERS, demo: true }, { headers: { "Cache-Control": "public, max-age=300" } }); }
