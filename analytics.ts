import { LEVEL_MIN } from "./players";
import type { MatchStat, PlayerData } from "./types";

export type Period = "7d" | "30d" | "90d" | "all";
export const PERIODS: Period[] = ["7d", "30d", "90d", "all"];
export const PERIOD_LABEL: Record<Period, string> = { "7d": "7D", "30d": "30D", "90d": "90D", all: "ALL TIME" };
export const PERIOD_DAYS: Record<Period, number | null> = { "7d": 7, "30d": 30, "90d": 90, all: null };
export const DAY = 86_400_000;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function inPeriod(m: MatchStat, period: Period, now: number): boolean {
  const d = PERIOD_DAYS[period];
  return d === null || m.finishedAt >= now - d * DAY;
}

export interface PStats {
  matches: number | null;
  wins: number | null;
  losses: number | null;
  winRate: number | null;
  kd: number | null;
  hs: number | null;
  adr: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  avgKills: number | null;
  /** matches of the fetched sample inside the period */
  samples: number;
  /** the period reaches further back than the fetched sample */
  truncated: boolean;
  /** where matches / wins / win rate / K/D come from */
  source: "sample" | "lifetime" | "none";
}

export function periodStats(p: PlayerData, period: Period, now: number): PStats {
  const ms = p.matches.filter((m) => inPeriod(m, period, now));
  const samples = ms.length;
  const oldest = p.matches.length ? p.matches[p.matches.length - 1].finishedAt : null;
  const days = PERIOD_DAYS[period];
  const truncated = p.sampleTruncated && (days === null || (oldest !== null && oldest > now - days * DAY));

  const sum = (key: "kills" | "deaths" | "assists") => {
    const v = ms.map((m) => m[key]).filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) : null;
  };
  const kills = sum("kills");
  const deaths = sum("deaths");
  const assists = sum("assists");
  const killVals = ms.map((m) => m.kills).filter((x): x is number => x !== null);
  const avgKills = mean(killVals);
  const adr = mean(ms.map((m) => m.adr).filter((x): x is number => x !== null));

  if (period === "all" && p.lifetime && p.lifetime.matches !== null) {
    const l = p.lifetime;
    const wins = l.wins;
    return {
      matches: l.matches,
      wins,
      losses: wins !== null && l.matches !== null ? l.matches - wins : null,
      winRate: l.winRate ?? (wins !== null && l.matches ? (wins / l.matches) * 100 : null),
      kd: l.kd ?? mean(ms.map((m) => m.kd).filter((x): x is number => x !== null)),
      hs: l.hs ?? mean(ms.map((m) => m.hs).filter((x): x is number => x !== null)),
      adr,
      kills,
      deaths,
      assists,
      avgKills,
      samples,
      truncated,
      source: "lifetime",
    };
  }

  if (samples === 0) {
    return { matches: p.matches.length || p.status === "ok" ? 0 : null, wins: null, losses: null, winRate: null, kd: null, hs: null, adr: null, kills: null, deaths: null, assists: null, avgKills: null, samples, truncated, source: p.status === "ok" ? "sample" : "none" };
  }

  const decided = ms.filter((m) => m.win !== null);
  const wins = decided.filter((m) => m.win === true).length;
  return {
    matches: samples,
    wins: decided.length ? wins : null,
    losses: decided.length ? decided.length - wins : null,
    winRate: decided.length ? (wins / decided.length) * 100 : null,
    kd: mean(ms.map((m) => m.kd).filter((x): x is number => x !== null)),
    hs: mean(ms.map((m) => m.hs).filter((x): x is number => x !== null)),
    adr,
    kills,
    deaths,
    assists,
    avgKills,
    samples,
    truncated,
    source: "sample",
  };
}

export interface EloChange {
  delta: number | null;
  since: number | null;
  /** snapshot history is shorter than the chosen period */
  partial: boolean;
}

export function eloChange(p: PlayerData, period: Period, now: number): EloChange {
  const snaps = [...p.snapshots].sort((a, b) => a.t - b.t);
  if (snaps.length < 2 || p.elo === null) return { delta: null, since: null, partial: false };
  const days = PERIOD_DAYS[period];
  const cutoff = days === null ? -Infinity : now - days * DAY;
  let ref = null as (typeof snaps)[number] | null;
  for (const s of snaps) if (s.t <= cutoff) ref = s;
  let partial = false;
  if (!ref) {
    ref = snaps[0];
    partial = days !== null;
  }
  if (ref.t >= snaps[snaps.length - 1].t) return { delta: null, since: null, partial: false };
  return { delta: p.elo - ref.elo, since: ref.t, partial };
}

export function streak(p: PlayerData): { type: "W" | "L"; n: number } | null {
  let type: "W" | "L" | null = null;
  let n = 0;
  for (const m of p.matches) {
    if (m.win === null) break;
    const t = m.win ? "W" : "L";
    if (type === null) type = t;
    if (t !== type) break;
    n++;
  }
  return type ? { type, n } : null;
}

export function lastMatchAt(p: PlayerData): number | null {
  return p.matches.length ? p.matches[0].finishedAt : null;
}

export function daysSince(ts: number | null, now: number): number | null {
  return ts === null ? null : Math.max(0, (now - ts) / DAY);
}

export function countSince(p: PlayerData, days: number, now: number): number {
  return p.matches.filter((m) => m.finishedAt >= now - days * DAY).length;
}

export function avgInterval(p: PlayerData): number | null {
  if (p.matches.length < 3) return null;
  const ts = p.matches.map((m) => m.finishedAt);
  const gaps: number[] = [];
  for (let i = 0; i < ts.length - 1; i++) gaps.push(ts[i] - ts[i + 1]);
  const m = mean(gaps);
  return m === null ? null : m / DAY;
}

/* ---------- FACEIT level progress (reference thresholds) ---------- */

export function levelProgress(elo: number | null, level: number | null): { pct: number | null; next: number | null; need: number | null } {
  if (elo === null || level === null || level < 1) return { pct: null, next: null, need: null };
  if (level >= 10) return { pct: 100, next: null, need: null };
  const min = LEVEL_MIN[level - 1];
  const nextMin = LEVEL_MIN[level];
  return { pct: clamp01((elo - min) / (nextMin - min)) * 100, next: level + 1, need: Math.max(0, nextMin - elo) };
}

/* ---------- OrdaX Power Index ---------- */

export const OPI_WEIGHTS = { elo: 0.3, wr: 0.25, kd: 0.2, activity: 0.15, form: 0.1 } as const;
export const OPI_MIN_MATCHES = 5;

export interface OpiPart {
  key: keyof typeof OPI_WEIGHTS;
  label: string;
  weight: number;
  /** 0..1 */
  value: number | null;
  /** points contributed to the 0..100 score */
  contrib: number | null;
  detail: string;
}

export interface Opi {
  score: number | null;
  parts: OpiPart[];
  reason?: string;
}

export function computeOpi(players: PlayerData[], period: Period, now: number): Record<string, Opi> {
  const elos = players.map((p) => p.elo).filter((x): x is number => x !== null);
  const min = elos.length ? Math.min(...elos) : 0;
  const max = elos.length ? Math.max(...elos) : 0;
  const out: Record<string, Opi> = {};

  for (const p of players) {
    const st = periodStats(p, period, now);
    const n = st.matches ?? 0;

    const eloVal = p.elo !== null && elos.length >= 2 ? (max === min ? 0.5 : (p.elo - min) / (max - min)) : null;

    let wrVal: number | null = null;
    let wrDetail = "нет данных";
    if (st.wins !== null && n > 0) {
      const K = 20;
      const shrunk = (st.wins + 0.5 * K) / (n + K);
      wrVal = clamp01((shrunk - 0.35) / 0.3);
      wrDetail = `WR ${(st.wins / n * 100).toFixed(0)}% → с поправкой на ${n} матчей: ${(shrunk * 100).toFixed(1)}%`;
    }

    let kdVal: number | null = null;
    let kdDetail = "нет данных";
    if (st.kd !== null) {
      const kdN = st.source === "lifetime" ? n : st.samples;
      const shrunk = (st.kd * kdN + 1.0 * 10) / (kdN + 10);
      kdVal = clamp01((shrunk - 0.7) / 0.8);
      kdDetail = `K/D ${st.kd.toFixed(2)} → с поправкой: ${shrunk.toFixed(2)}`;
    }

    const m30 = countSince(p, 30, now);
    const actVal = p.status === "ok" ? clamp01(m30 / 20) : null;
    const actDetail = `${m30} матчей за 30 дней (потолок 20)`;

    const last10 = p.matches.slice(0, 10).filter((m) => m.win !== null);
    let formVal: number | null = null;
    let formDetail = "нет данных";
    if (last10.length) {
      const w = last10.filter((m) => m.win).length;
      formVal = (w + 0.5 * 5) / (last10.length + 5);
      formDetail = `${w} побед в последних ${last10.length}`;
    }

    const parts: OpiPart[] = [
      { key: "elo", label: "ELO внутри команды", weight: OPI_WEIGHTS.elo, value: eloVal, contrib: null, detail: p.elo !== null ? `ELO ${p.elo}, диапазон команды ${min}–${max}` : "нет данных" },
      { key: "wr", label: "Win Rate (с поправкой на выборку)", weight: OPI_WEIGHTS.wr, value: wrVal, contrib: null, detail: wrDetail },
      { key: "kd", label: "K/D (с поправкой на выборку)", weight: OPI_WEIGHTS.kd, value: kdVal, contrib: null, detail: kdDetail },
      { key: "activity", label: "Активность", weight: OPI_WEIGHTS.activity, value: actVal, contrib: null, detail: actDetail },
      { key: "form", label: "Текущая форма", weight: OPI_WEIGHTS.form, value: formVal, contrib: null, detail: formDetail },
    ];
    for (const part of parts) part.contrib = part.value === null ? null : part.value * part.weight * 100;

    let reason: string | undefined;
    if (p.status !== "ok") reason = "нет данных профиля";
    else if (n < OPI_MIN_MATCHES) reason = `меньше ${OPI_MIN_MATCHES} матчей за выбранный период`;
    else if (parts.some((x) => x.value === null)) reason = "часть показателей недоступна";

    out[p.nickname] = {
      score: reason ? null : Math.round(parts.reduce((a, x) => a + (x.contrib ?? 0), 0) * 10) / 10,
      parts,
      reason,
    };
  }
  return out;
}

/* ---------- Player of the Week ---------- */

export interface PowResult {
  nickname: string;
  score: number;
  matches: number;
  winRate: number;
  kd: number;
}

export const POW_MIN_MATCHES = 3;

/** 50% shrunk win rate, 30% shrunk K/D, 20% volume (matches in 7 days, cap 10). */
export function playerOfWeek(players: PlayerData[], now: number): PowResult | null {
  let best: PowResult | null = null;
  for (const p of players) {
    if (p.status !== "ok") continue;
    const st = periodStats(p, "7d", now);
    if (st.samples < POW_MIN_MATCHES || st.wins === null || st.kd === null || st.matches === null) continue;
    const wr = (st.wins + 0.5 * 5) / (st.matches + 5);
    const kd = (st.kd * st.samples + 1.0 * 3) / (st.samples + 3);
    const score = 100 * (0.5 * wr + 0.3 * clamp01((kd - 0.7) / 0.8) + 0.2 * Math.min(st.matches / 10, 1));
    if (!best || score > best.score) {
      best = { nickname: p.nickname, score: Math.round(score * 10) / 10, matches: st.matches, winRate: (st.wins / st.matches) * 100, kd: st.kd };
    }
  }
  return best;
}

/* ---------- alerts ---------- */

export interface Thresholds {
  inactive7: number;
  inactive14: number;
  eloDrop: number;
  lossStreak: number;
  surge: number;
}
export const DEFAULT_THRESHOLDS: Thresholds = { inactive7: 7, inactive14: 14, eloDrop: 50, lossStreak: 3, surge: 2 };

export interface Alert {
  nickname: string;
  name: string;
  kind: "inactive" | "elo" | "streak" | "surge";
  level: "info" | "warn";
  text: string;
}

export function computeAlerts(players: PlayerData[], th: Thresholds, now: number): Alert[] {
  const out: Alert[] = [];
  for (const p of players) {
    if (p.status !== "ok") continue;
    const base = { nickname: p.nickname, name: p.name };

    const d = daysSince(lastMatchAt(p), now);
    if (d !== null && d > th.inactive14) {
      out.push({ ...base, kind: "inactive", level: "warn", text: `Не играл больше ${th.inactive14} дней (${Math.floor(d)} дн.)` });
    } else if (d !== null && d > th.inactive7) {
      out.push({ ...base, kind: "inactive", level: "info", text: `Не играл больше ${th.inactive7} дней (${Math.floor(d)} дн.)` });
    }

    const ec = eloChange(p, "7d", now);
    if (ec.delta !== null && ec.delta <= -th.eloDrop) {
      out.push({ ...base, kind: "elo", level: "warn", text: `ELO ${ec.delta} за 7 дней${ec.partial ? " (история короче 7 дней)" : ""}` });
    }

    const s = streak(p);
    if (s && s.type === "L" && s.n >= th.lossStreak) {
      out.push({ ...base, kind: "streak", level: "warn", text: `Серия поражений: ${s.n}` });
    }

    const m7 = countSince(p, 7, now);
    const prior = p.matches.filter((m) => m.finishedAt < now - 7 * DAY && m.finishedAt >= now - 30 * DAY).length;
    const weeklyRate = (prior / 23) * 7;
    if (m7 >= 4 && m7 >= th.surge * Math.max(weeklyRate, 1)) {
      out.push({ ...base, kind: "surge", level: "info", text: `Рост активности: ${m7} матчей за 7 дней (раньше около ${weeklyRate.toFixed(1)} в неделю)` });
    }
  }
  return out;
}

/* ---------- team-level numbers ---------- */

export function stdev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

export type SortKey = "elo" | "level" | "wr" | "kd" | "matches" | "last" | "d7" | "d30" | "name";

export interface Row {
  p: PlayerData;
  st: PStats;
  d7: EloChange;
  d30: EloChange;
  dPeriod: EloChange;
  last: number | null;
  opi: Opi | undefined;
}

export function buildRows(players: PlayerData[], period: Period, now: number): Row[] {
  const opi = computeOpi(players, period, now);
  return players.map((p) => ({
    p,
    st: periodStats(p, period, now),
    d7: eloChange(p, "7d", now),
    d30: eloChange(p, "30d", now),
    dPeriod: eloChange(p, period, now),
    last: lastMatchAt(p),
    opi: opi[p.nickname],
  }));
}

export function sortValue(r: Row, key: SortKey): number | string | null {
  switch (key) {
    case "elo": return r.p.elo;
    case "level": return r.p.level;
    case "wr": return r.st.winRate;
    case "kd": return r.st.kd;
    case "matches": return r.st.matches;
    case "last": return r.last;
    case "d7": return r.d7.delta;
    case "d30": return r.d30.delta;
    case "name": return r.p.name.toLowerCase();
  }
}

export function sortRows(rows: Row[], key: SortKey, dir: "asc" | "desc"): Row[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va === null && vb === null) return 0;
    if (va === null) return 1; // missing data always last
    if (vb === null) return -1;
    if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb, "ru") * mul;
    return ((va as number) - (vb as number)) * mul;
  });
}
