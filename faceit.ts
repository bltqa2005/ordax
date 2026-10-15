import { GAME } from "./players";
import type { Lifetime, MatchStat, RecentMatch } from "./types";

/**
 * Server-side FACEIT Data API v4 client.
 * Auth: "Authorization: Bearer <server side API key>". The key never leaves the server.
 * Field names below follow the Data API v4 swagger (paths, limits) and the documented
 * stat keys ("Kills", "Match Finished At", ...). Every parser is defensive: a missing or
 * differently named field yields null, never an invented number.
 */
const BASE = (process.env.FACEIT_API_BASE || "https://open.faceit.com/data/v4").replace(/\/$/, "");

export const isConfigured = (): boolean => Boolean(process.env.FACEIT_API_KEY);

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const MAX_CONCURRENCY = Math.max(1, Number(process.env.FACEIT_CONCURRENCY) || 3);
let active = 0;
const waiters: Array<() => void> = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENCY) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  active++;
  try {
    return await fn();
  } finally {
    active--;
    const next = waiters.shift();
    if (next) next();
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

async function api(path: string, params: Record<string, string | number> = {}): Promise<Json> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await withSlot(() =>
        fetch(url, {
          headers: { Authorization: `Bearer ${process.env.FACEIT_API_KEY}`, Accept: "application/json" },
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        }),
      );
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("retry-after"));
        lastError = new ApiError(res.status, `FACEIT вернул HTTP ${res.status}`);
        await sleep(retryAfter > 0 ? retryAfter * 1000 : 700 * 2 ** attempt);
        continue;
      }
      if (res.status === 401 || res.status === 403) throw new ApiError(res.status, "FACEIT отклонил API-ключ (401/403)");
      if (res.status === 404) throw new ApiError(404, "Не найдено");
      if (!res.ok) throw new ApiError(res.status, `FACEIT вернул HTTP ${res.status}`);
      const json: unknown = await res.json();
      if (!json || typeof json !== "object") throw new ApiError(502, "Некорректный ответ FACEIT");
      return json as Json;
    } catch (e) {
      if (e instanceof ApiError && e.status < 500 && e.status !== 429) throw e;
      lastError = e;
      await sleep(500 * 2 ** attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Запрос к FACEIT не удался");
}

/* ---------- parsing helpers ---------- */

function num(v: unknown): number | null {
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(",", ".").replace(/[^0-9.\-]/g, ""));
    return isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function pick(o: Json, ...keys: string[]): unknown {
  if (!o || typeof o !== "object") return undefined;
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

export const matchUrl = (id: string) => `https://www.faceit.com/en/cs2/room/${encodeURIComponent(id)}`;

function parseMatch(item: Json): MatchStat | null {
  const s: Json = item && typeof item === "object" && item.stats ? item.stats : item;
  const id = str(pick(s, "Match Id", "match_id"));
  let finished = num(pick(s, "Match Finished At", "Updated At", "Created At"));
  if (!id || finished === null) return null;
  if (finished < 1e12) finished *= 1000; // seconds -> ms

  const result = pick(s, "Result");
  const kills = num(pick(s, "Kills"));
  const deaths = num(pick(s, "Deaths"));
  let kd = num(pick(s, "K/D Ratio"));
  if (kd === null && kills !== null && deaths !== null && deaths > 0) kd = Math.round((kills / deaths) * 100) / 100;

  return {
    id,
    finishedAt: finished,
    map: str(pick(s, "Map")),
    win: result === undefined ? null : String(result) === "1",
    score: str(pick(s, "Score")),
    kills,
    deaths,
    assists: num(pick(s, "Assists")),
    kd,
    hs: num(pick(s, "Headshots %")),
    adr: num(pick(s, "ADR", "Average Damage per Round")),
    url: matchUrl(id),
  };
}

/* ---------- endpoints ---------- */

export interface PlayerProfile {
  playerId: string;
  nickname: string;
  avatar: string | null;
  country: string | null;
  faceitUrl: string;
  elo: number | null;
  level: number | null;
  hasGame: boolean;
}

export function parsePlayer(r: Json): PlayerProfile | null {
  const playerId = str(r?.player_id);
  const nickname = str(r?.nickname);
  if (!playerId || !nickname) return null;
  const g: Json = r?.games?.[GAME];
  const url = str(r?.faceit_url);
  return {
    playerId,
    nickname,
    avatar: str(r?.avatar),
    country: str(r?.country),
    faceitUrl: url ? url.replace("{lang}", "en") : `https://www.faceit.com/en/players/${encodeURIComponent(nickname)}`,
    elo: num(g?.faceit_elo),
    level: num(g?.skill_level),
    hasGame: Boolean(g),
  };
}

/** Exact nickname lookup. Throws ApiError(404) when no such player exists. */
export async function lookupNickname(nickname: string): Promise<PlayerProfile | null> {
  return parsePlayer(await api("/players", { nickname, game: GAME }));
}

export async function getPlayerById(id: string): Promise<PlayerProfile | null> {
  return parsePlayer(await api(`/players/${encodeURIComponent(id)}`));
}

export async function getLifetime(id: string): Promise<Lifetime | null> {
  const r = await api(`/players/${encodeURIComponent(id)}/stats/${GAME}`);
  const l: Json = r?.lifetime;
  if (!l || typeof l !== "object") return null;
  return {
    matches: num(pick(l, "Matches", "Total Matches")),
    wins: num(pick(l, "Wins")),
    winRate: num(pick(l, "Win Rate %")),
    kd: num(pick(l, "Average K/D Ratio", "K/D Ratio")),
    hs: num(pick(l, "Average Headshots %", "Total Headshots %")),
    longestWinStreak: num(pick(l, "Longest Win Streak")),
    currentWinStreak: num(pick(l, "Current Win Streak")),
  };
}

/** Up to 200 newest finished matches (two pages of 100; swagger: limit<=100, offset<=200). */
export async function getMatches(id: string): Promise<{ matches: MatchStat[]; truncated: boolean }> {
  const seen = new Set<string>();
  const out: MatchStat[] = [];
  let truncated = false;
  for (let offset = 0; offset < 200; offset += 100) {
    const r = await api(`/players/${encodeURIComponent(id)}/games/${GAME}/stats`, { limit: 100, offset });
    const items: Json[] = Array.isArray(r?.items) ? r.items : [];
    for (const it of items) {
      const m = parseMatch(it);
      if (m && !seen.has(m.id)) {
        seen.add(m.id);
        out.push(m);
      }
    }
    if (items.length < 100) break;
    if (offset + 100 >= 200) truncated = true;
  }
  out.sort((a, b) => b.finishedAt - a.finishedAt);
  return { matches: out, truncated };
}

/** Enriches the three newest matches with start time / duration / score from match history. */
export async function getLast3(id: string, matches: MatchStat[]): Promise<RecentMatch[]> {
  const top = matches.slice(0, 3);
  if (top.length === 0) return [];
  const byId = new Map<string, Json>();
  try {
    const r = await api(`/players/${encodeURIComponent(id)}/history`, { game: GAME, limit: 5, offset: 0, from: 0 });
    for (const it of Array.isArray(r?.items) ? (r.items as Json[]) : []) {
      const mid = str(it?.match_id);
      if (mid) byId.set(mid, it);
    }
  } catch {
    /* durations are optional */
  }
  return top.map((m) => {
    const h = byId.get(m.id);
    const started = num(h?.started_at);
    const finished = num(h?.finished_at);
    const s1 = num(h?.results?.score?.faction1);
    const s2 = num(h?.results?.score?.faction2);
    return {
      ...m,
      startedAt: started !== null ? started * 1000 : null,
      durationMin: started !== null && finished !== null && finished > started ? Math.round((finished - started) / 60) : null,
      historyScore: s1 !== null && s2 !== null ? `${s1} / ${s2}` : null,
    };
  });
}
