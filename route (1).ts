import { NextResponse } from "next/server";
import { ROSTER } from "@/lib/players";
import { kvGet, kvSet } from "@/lib/store";
import { loadTeam, resetCache } from "@/lib/team";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Manually confirm which FACEIT profile belongs to a roster nickname. Needs ADMIN_TOKEN. */
export async function POST(req: Request) {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    return NextResponse.json({ error: "ADMIN_TOKEN не настроен на сервере." }, { status: 503 });
  }

  let body: { nickname?: string; playerId?: string; token?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Некорректный JSON." }, { status: 400 });
  }

  if (!body.token || body.token !== adminToken) {
    return NextResponse.json({ error: "Неверный токен." }, { status: 401 });
  }
  const nickname = ROSTER.find((r) => r.nickname === body.nickname)?.nickname;
  if (!nickname) return NextResponse.json({ error: "Такого игрока нет в составе." }, { status: 400 });
  const playerId = (body.playerId ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(playerId)) {
    return NextResponse.json({ error: "Player ID должен быть в формате UUID." }, { status: 400 });
  }

  const overrides = (await kvGet<Record<string, string>>("overrides")) ?? {};
  overrides[nickname] = playerId;
  await kvSet("overrides", overrides);
  resetCache();
  const data = await loadTeam(true);
  return NextResponse.json({ ok: true, status: data.players.find((p) => p.nickname === nickname)?.status });
}
