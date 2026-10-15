import { NextResponse } from "next/server";
import { loadTeam } from "@/lib/team";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Scheduled refresh so ELO snapshots accumulate even when nobody opens the site.
 * Call it from any scheduler: GET /api/cron with "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET не настроен." }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const data = await loadTeam(true);
  return NextResponse.json({ ok: data.ok, failed: data.failed, generatedAt: data.generatedAt });
}
