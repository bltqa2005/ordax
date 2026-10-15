import { ApiError, getLast3, getLifetime, getMatches, getPlayerById, isConfigured, lookupNickname, type PlayerProfile } from "./faceit";
import { ROSTER } from "./players";
import { kvGet, kvSet, storageKind } from "./store";
import type { PlayerData, Snapshot, TeamPayload } from "./types";

type IdMap = Record<string, string>;
type SnapMap = Record<string, Snapshot[]>;

interface Runtime {
  cache: TeamPayload | null;
  inflight: Promise<TeamPayload> | null;
  lastForced: number;
}

const g = globalThis as unknown as { __ordax?: Runtime };
const rt: Runtime = (g.__ordax ??= { cache: null, inflight: null, lastForced: 0 });

const TTL_MS = (Number(process.env.CACHE_TTL_SECONDS) || 300) * 1000;
const MIN_FORCE_GAP_MS = 30_000;
const SNAPSHOT_GAP_MS = 30 * 60 * 1000;

function blank(entry: { nickname: string; name: string }): PlayerData {
  return {
    nickname: entry.nickname,
    name: entry.name,
    status: "pending",
    playerId: null,
    avatar: null,
    country: null,
    faceitUrl: `https://www.faceit.com/en/players/${encodeURIComponent(entry.nickname)}`,
    elo: null,
    level: null,
    lifetime: null,
    matches: [],
    sampleTruncated: false,
    last3: [],
    snapshots: [],
    fetchedAt: null,
  };
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Неизвестная ошибка";
}

async function buildPlayer(
  entry: { nickname: string; name: string },
  ids: IdMap,
  overrides: IdMap,
  previous: PlayerData | undefined,
): Promise<PlayerData> {
  const base = blank(entry);
  const manual = overrides[entry.nickname];
  try {
    let profile: PlayerProfile | null = null;
    const knownId = manual || ids[entry.nickname];

    if (knownId) {
      profile = await getPlayerById(knownId);
    } else {
      try {
        profile = await lookupNickname(entry.nickname);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          return {
            ...base,
            status: "not_found",
            message: `Профиль «${entry.nickname}» не найден в CS2 на FACEIT. Укажи Player ID вручную.`,
          };
        }
        throw e;
      }
    }

    if (!profile) return { ...base, status: "mismatch", message: "FACEIT вернул профиль без player_id или ника." };

    if (!manual && profile.nickname.toLowerCase() !== entry.nickname.toLowerCase()) {
      return {
        ...base,
        status: "mismatch",
        message: `FACEIT вернул ник «${profile.nickname}» вместо «${entry.nickname}». Подтверди профиль вручную.`,
      };
    }
    if (!profile.hasGame) {
      return { ...base, status: "mismatch", message: "У профиля нет данных по CS2." };
    }

    const [lifetime, sample] = await Promise.all([
      getLifetime(profile.playerId).catch(() => null),
      getMatches(profile.playerId),
    ]);
    const last3 = await getLast3(profile.playerId, sample.matches);

    return {
      ...base,
      status: "ok",
      message: manual ? "Профиль подтверждён вручную." : undefined,
      playerId: profile.playerId,
      avatar: profile.avatar,
      country: profile.country,
      faceitUrl: profile.faceitUrl,
      elo: profile.elo,
      level: profile.level,
      lifetime,
      matches: sample.matches,
      sampleTruncated: sample.truncated,
      last3,
      fetchedAt: Date.now(),
    };
  } catch (e) {
    if (previous && previous.status === "ok") {
      return { ...previous, stale: true, message: `Обновление не удалось (${errMessage(e)}). Показаны данные предыдущего успешного запроса.` };
    }
    return { ...base, status: "error", message: errMessage(e) };
  }
}

async function appendSnapshots(players: PlayerData[], now: number): Promise<void> {
  const snaps = (await kvGet<SnapMap>("snapshots")) ?? {};
  for (const p of players) {
    if (p.status !== "ok" || p.stale || p.elo === null) continue;
    const arr = snaps[p.nickname] ?? [];
    const last = arr[arr.length - 1];
    if (!last || last.elo !== p.elo || now - last.t > SNAPSHOT_GAP_MS) {
      arr.push({ t: now, elo: p.elo, level: p.level });
    }
    snaps[p.nickname] = arr.slice(-4000);
  }
  await kvSet("snapshots", snaps);
}

async function refresh(): Promise<TeamPayload> {
  const [ids, overrides] = await Promise.all([
    kvGet<IdMap>("ids").then((v) => v ?? {}),
    kvGet<IdMap>("overrides").then((v) => v ?? {}),
  ]);
  const prev = rt.cache;
  const players = await Promise.all(
    ROSTER.map((e) => buildPlayer(e, ids, overrides, prev?.players.find((p) => p.nickname === e.nickname))),
  );
  const now = Date.now();

  const newIds: IdMap = { ...ids };
  for (const p of players) if (p.status === "ok" && p.playerId && !p.stale) newIds[p.nickname] = p.playerId;
  await kvSet("ids", newIds);
  await appendSnapshots(players, now);

  const ok = players.filter((p) => p.status === "ok" && !p.stale).length;
  const payload: TeamPayload = {
    configured: true,
    generatedAt: now,
    ok,
    failed: players.length - ok,
    players,
    notes: [],
    storage: storageKind(),
  };
  rt.cache = payload;
  await kvSet("payload", payload);
  return payload;
}

async function withSnapshots(payload: TeamPayload): Promise<TeamPayload> {
  const snaps = (await kvGet<SnapMap>("snapshots")) ?? {};
  return {
    ...payload,
    storage: storageKind(),
    players: payload.players.map((p) => ({ ...p, snapshots: snaps[p.nickname] ?? [] })),
  };
}

export function resetCache(): void {
  rt.cache = null;
  rt.lastForced = 0;
}

export async function loadTeam(force = false): Promise<TeamPayload> {
  if (!isConfigured()) {
    const snaps = (await kvGet<SnapMap>("snapshots")) ?? {};
    return {
      configured: false,
      generatedAt: null,
      ok: 0,
      failed: 0,
      players: ROSTER.map((e) => ({ ...blank(e), snapshots: snaps[e.nickname] ?? [] })),
      notes: ["API NOT CONFIGURED: задай FACEIT_API_KEY в серверных переменных окружения."],
      storage: storageKind(),
    };
  }

  const now = Date.now();
  if (!rt.cache) rt.cache = await kvGet<TeamPayload>("payload");

  let doForce = force;
  const notes: string[] = [];
  if (doForce && now - rt.lastForced < MIN_FORCE_GAP_MS) {
    doForce = false;
    notes.push("Ручное обновление ограничено: не чаще одного раза в 30 секунд. Показаны свежие данные из кэша.");
  }

  const fresh = rt.cache && rt.cache.generatedAt !== null && now - rt.cache.generatedAt < TTL_MS;
  if (rt.cache && fresh && !doForce) {
    const out = await withSnapshots(rt.cache);
    return { ...out, notes: [...out.notes, ...notes] };
  }

  if (!rt.inflight) {
    if (doForce) rt.lastForced = now;
    rt.inflight = refresh().finally(() => {
      rt.inflight = null;
    });
  }
  const payload = await rt.inflight;
  const out = await withSnapshots(payload);
  return { ...out, notes: [...out.notes, ...notes] };
}
