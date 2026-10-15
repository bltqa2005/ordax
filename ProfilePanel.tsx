"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, ExternalLink, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import {
  PERIOD_DAYS,
  PERIOD_LABEL,
  DAY,
  avgInterval,
  countSince,
  levelProgress,
  periodStats,
  streak,
  type Period,
} from "@/lib/analytics";
import { ago, fmt, fmtDate, fmtPct, fmtShortDate, fmtSigned, mapName } from "@/lib/format";
import type { RecentMatch } from "@/lib/types";
import type { ViewProps } from "./shared";
import { Avatar, Btn, Card, Delta, LevelBadge, ResultPill, cx } from "./ui";

type Range = Exclude<Period, "all">;
const RANGES: Range[] = ["7d", "30d", "90d"];

function EloTip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload as { t: number; elo: number; delta: number | null };
  return (
    <div className="rounded-md border border-line bg-card px-3 py-2 text-xs shadow-glow">
      <div className="text-mute">{fmtDate(d.t)}</div>
      <div className="num mt-1 text-base text-ink">ELO {d.elo}</div>
      <div className="num text-mute">
        к предыдущей точке: <span className={d.delta === null ? "" : d.delta > 0 ? "text-win" : d.delta < 0 ? "text-loss" : ""}>{d.delta === null ? "—" : fmtSigned(d.delta)}</span>
      </div>
    </div>
  );
}

function MatchRow({ m, now }: { m: RecentMatch; now: number }) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const score = m.score ?? m.historyScore;
  return (
    <li className={cx("rounded-md border bg-bg2", m.win === null ? "border-line" : m.win ? "border-win/30" : "border-loss/30")}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[56px] w-full items-center gap-3 px-3 py-2 text-left"
      >
        <span className={cx("h-10 w-1 flex-none rounded-full", m.win === null ? "bg-line" : m.win ? "bg-win" : "bg-loss")} />
        <ResultPill win={m.win} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{mapName(m.map)}</div>
          <div className="truncate font-mono text-[11px] text-mute">{fmtDate(m.finishedAt)} · {ago(m.finishedAt, now)}</div>
        </div>
        <div className="num text-right text-sm">
          {m.kills ?? "—"}/{m.deaths ?? "—"}/{m.assists ?? "—"}
          <div className="text-[11px] text-mute">K/D {m.kd !== null ? m.kd.toFixed(2) : "—"}</div>
        </div>
        <ChevronDown size={16} className={cx("flex-none text-mute transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line px-3 py-3 text-sm sm:grid-cols-3">
              {[
                ["Счёт", score ?? "—"],
                ["Kills", m.kills ?? "—"],
                ["Deaths", m.deaths ?? "—"],
                ["Assists", m.assists ?? "—"],
                ["K/D", m.kd !== null ? m.kd.toFixed(2) : "—"],
                ["ADR", m.adr !== null ? m.adr.toFixed(1) : "—"],
                ["HS %", m.hs !== null ? fmtPct(m.hs, 0) : "—"],
                ["Длительность", m.durationMin !== null ? `${m.durationMin} мин` : "—"],
                ["Изменение ELO", "N/A"],
              ].map(([k, v]) => (
                <div key={String(k)}>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-mute">{k}</div>
                  <div className="num">{v}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-line px-3 py-2.5">
              <Btn href={m.url}><ExternalLink size={13} /> Матч на FACEIT</Btn>
              <span className="text-[11px] text-mute">ELO после матча и ADR показываются только если их отдаёт FACEIT API; длительность считается по меткам начала и конца матча.</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

export default function ProfilePanel({ nickname, rows, period, now, onClose }: ViewProps & { nickname: string; onClose: () => void }) {
  const reduce = useReducedMotion();
  const [range, setRange] = useState<Range>("30d");

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const row = rows.find((r) => r.p.nickname === nickname);
  const p = row?.p;

  const rank = useMemo(() => {
    const sorted = rows.filter((r) => r.p.elo !== null).sort((a, b) => (b.p.elo as number) - (a.p.elo as number));
    const i = sorted.findIndex((r) => r.p.nickname === nickname);
    return i >= 0 ? { pos: i + 1, of: sorted.length } : null;
  }, [rows, nickname]);

  const series = useMemo(() => {
    if (!p) return [];
    const days = PERIOD_DAYS[range] as number;
    const pts = [...p.snapshots].filter((s) => s.t >= now - days * DAY).sort((a, b) => a.t - b.t);
    return pts.map((s, i) => ({ t: s.t, elo: s.elo, delta: i === 0 ? null : s.elo - pts[i - 1].elo }));
  }, [p, range, now]);

  if (!row || !p) return null;
  const st = periodStats(p, period, now);
  const lp = levelProgress(p.elo, p.level);
  const strk = streak(p);
  const m7 = countSince(p, 7, now);
  const m30 = countSince(p, 30, now);
  const interval = avgInterval(p);
  const sampleNote = p.matches.length ? `по загруженной выборке: ${p.matches.length} посл. матчей${p.sampleTruncated ? " (это максимум, более старые не загружены)" : ""}` : "";

  const tiles: Array<[string, string | null]> = [
    ["Matches", st.matches !== null ? fmt(st.matches) : null],
    ["Wins", st.wins !== null ? fmt(st.wins) : null],
    ["Losses", st.losses !== null ? fmt(st.losses) : null],
    ["Win rate", st.winRate !== null ? fmtPct(st.winRate, 1) : null],
    ["Avg K/D", st.kd !== null ? st.kd.toFixed(2) : null],
    ["Kills", st.kills !== null ? fmt(st.kills) : null],
    ["Deaths", st.deaths !== null ? fmt(st.deaths) : null],
    ["Assists", st.assists !== null ? fmt(st.assists) : null],
    ["Headshots %", st.hs !== null ? fmtPct(st.hs, 1) : null],
    ["Avg kills / match", st.avgKills !== null ? st.avgKills.toFixed(1) : null],
    ["ADR", st.adr !== null ? st.adr.toFixed(1) : null],
  ];

  /* timeline: ELO changes between snapshots + matches, newest first */
  const events: Array<{ t: number; kind: "match" | "elo"; text: string; tone: "win" | "loss" | "mute" }> = [];
  for (const m of p.matches.slice(0, 25)) {
    events.push({ t: m.finishedAt, kind: "match", text: `${m.win === null ? "Матч" : m.win ? "WIN" : "LOSS"} · ${mapName(m.map)}${m.kills !== null ? ` · ${m.kills}/${m.deaths ?? "—"}/${m.assists ?? "—"}` : ""}`, tone: m.win === null ? "mute" : m.win ? "win" : "loss" });
  }
  const snaps = [...p.snapshots].sort((a, b) => a.t - b.t);
  for (let i = 1; i < snaps.length; i++) {
    const d = snaps[i].elo - snaps[i - 1].elo;
    if (d !== 0) events.push({ t: snaps[i].t, kind: "elo", text: `ELO ${snaps[i - 1].elo} → ${snaps[i].elo} (${fmtSigned(d)})`, tone: d > 0 ? "win" : "loss" });
  }
  events.sort((a, b) => b.t - a.t);

  return (
    <motion.div
      className="fixed inset-0 z-50 overflow-y-auto bg-bg/95 backdrop-blur-sm"
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduce ? undefined : { opacity: 0 }}
      transition={{ duration: 0.18 }}
      role="dialog"
      aria-modal="true"
      aria-label={`Профиль ${p.name}`}
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <motion.div
        className="mx-auto max-w-5xl px-4 py-5 sm:px-6"
        initial={reduce ? false : { y: 24 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.25, ease: [0.2, 0.7, 0.2, 1] }}
      >
        <div className="flex items-center justify-between gap-3">
          <button onClick={onClose} className="inline-flex min-h-[44px] items-center gap-2 font-mono text-xs uppercase tracking-wider text-mute hover:text-accent">
            <X size={16} /> Закрыть
          </button>
          <Btn href={p.faceitUrl}><ExternalLink size={13} /> Профиль FACEIT</Btn>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Avatar src={p.avatar} name={p.name} size={72} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-3xl font-bold tracking-tight">{p.name}</h2>
            <div className="truncate font-mono text-sm text-mute">{p.nickname}{p.country ? ` · ${p.country.toUpperCase()}` : ""}</div>
          </div>
        </div>

        {p.message && <div className="mt-4 rounded-md border border-accent/40 bg-accent/5 px-3 py-2 text-sm">{p.message}</div>}

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <Card className="p-4 md:col-span-2">
            <div className="flex flex-wrap items-center gap-5">
              <LevelBadge level={p.level} size={64} />
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">Current ELO</div>
                <div className="num text-5xl leading-none">{p.elo !== null ? fmt(p.elo) : <span className="text-mute">N/A</span>}</div>
              </div>
              <div className="ml-auto text-right">
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">Позиция в OrdaX</div>
                <div className="num text-3xl">{rank ? `#${rank.pos}` : "—"}<span className="text-base text-mute">{rank ? ` / ${rank.of}` : ""}</span></div>
              </div>
            </div>
            <div className="mt-5">
              <div className="mb-1.5 flex justify-between font-mono text-[11px] text-mute">
                <span>{lp.next ? `До Level ${lp.next}` : p.level === 10 ? "Максимальный уровень" : "Прогресс уровня"}</span>
                <span>{lp.need !== null ? `ещё ${fmt(lp.need)} ELO` : lp.pct === null ? "N/A" : ""}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-steel">
                <motion.div className="h-full bg-accent" initial={reduce ? false : { width: 0 }} animate={{ width: `${lp.pct ?? 0}%` }} transition={{ duration: 0.7 }} />
              </div>
              <div className="mt-1.5 text-[11px] text-mute">Пороги уровней FACEIT справочные: актуальные границы может менять FACEIT.</div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">Последняя активность</div>
            <div className="num mt-2 text-xl">{ago(row.last, now)}</div>
            <div className="mt-0.5 text-xs text-mute">{fmtDate(row.last)}</div>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-mute">Матчей за 7 дней</dt><dd className="num">{p.matches.length ? m7 : "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-mute">Матчей за 30 дней</dt><dd className="num">{p.matches.length ? m30 : "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-mute">Средний интервал</dt><dd className="num">{interval !== null ? `${interval.toFixed(1)} дн.` : "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-mute">Серия</dt><dd className="num">{strk ? `${strk.n}${strk.type}` : "—"}</dd></div>
            </dl>
          </Card>
        </div>

        <section className="mt-8">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <h3 className="font-display text-xl font-semibold">Игровая статистика · {PERIOD_LABEL[period]}</h3>
            {sampleNote && <span className="text-[11px] text-mute">Kills/Deaths/Assists и средние {st.source === "lifetime" ? "считаются " : "считаются "}{sampleNote}</span>}
          </div>
          {tiles.some(([, v]) => v !== null) ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {tiles.filter(([, v]) => v !== null).map(([k, v]) => (
                <Card key={k} className="p-3" hover={false}>
                  <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-mute">{k}</div>
                  <div className="num mt-1 text-xl">{v}</div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-line p-6 text-center text-sm text-mute">Data unavailable</div>
          )}
          {st.truncated && <div className="mt-2 text-[11px] text-mute">Период длиннее загруженной выборки: часть старых матчей не учтена.</div>}
        </section>

        <section className="mt-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-xl font-semibold">ELO progression</h3>
            <div role="tablist" className="inline-flex rounded-md border border-line bg-bg2 p-0.5">
              {RANGES.map((r) => (
                <button key={r} role="tab" aria-selected={range === r} onClick={() => setRange(r)} className={cx("min-h-[34px] rounded-[5px] px-3 font-mono text-xs", range === r ? "bg-accent text-bg" : "text-mute hover:text-ink")}>
                  {PERIOD_LABEL[r]}
                </button>
              ))}
            </div>
          </div>
          <Card className="p-3 sm:p-4" hover={false}>
            {series.length >= 2 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                    <CartesianGrid stroke="#252B33" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(t: number) => fmtShortDate(t)} stroke="#8B949E" tick={{ fontSize: 11 }} />
                    <YAxis domain={["dataMin - 10", "dataMax + 10"]} stroke="#8B949E" tick={{ fontSize: 11 }} width={48} allowDecimals={false} />
                    <Tooltip content={<EloTip />} cursor={{ stroke: "#FF5500", strokeOpacity: 0.4 }} />
                    <Line type="monotone" dataKey="elo" stroke="#FF5500" strokeWidth={2} dot={{ r: 2.5, fill: "#FF5500" }} activeDot={{ r: 5 }} isAnimationActive={!reduce} animationDuration={800} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="px-2 py-10 text-center text-sm text-mute">
                Истории ELO пока недостаточно. FACEIT Data API не отдаёт прошлые значения ELO, поэтому сайт накапливает снимки при каждом обновлении данных. Для графика нужно минимум две точки за выбранный период ({series.length} из 2).
              </div>
            )}
          </Card>
        </section>

        <section className="mt-8">
          <h3 className="mb-3 font-display text-xl font-semibold">Последние 3 матча</h3>
          {p.last3.length ? (
            <ul className="space-y-2">
              {p.last3.map((m) => <MatchRow key={m.id} m={m} now={now} />)}
            </ul>
          ) : (
            <div className="rounded-md border border-dashed border-line p-6 text-center text-sm text-mute">Подтверждённых завершённых матчей нет.</div>
          )}
          {p.last3.length > 0 && p.last3.length < 3 && <div className="mt-2 text-[11px] text-mute">Показаны только подтверждённые матчи ({p.last3.length} из 3).</div>}
        </section>

        <section className="mt-8 pb-10">
          <h3 className="mb-3 font-display text-xl font-semibold">Player timeline</h3>
          {events.length ? (
            <ol className="relative space-y-3 border-l border-line pl-5">
              {events.slice(0, 30).map((e, i) => (
                <li key={`${e.t}-${e.kind}-${i}`} className="relative">
                  <span className={cx("absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full", e.tone === "win" ? "bg-win" : e.tone === "loss" ? "bg-loss" : "bg-mute")} />
                  <div className="text-sm">{e.text}</div>
                  <div className="font-mono text-[11px] text-mute">{fmtDate(e.t)} · {e.kind === "elo" ? "снимок ELO" : "матч"}</div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="rounded-md border border-dashed border-line p-6 text-center text-sm text-mute">Data unavailable</div>
          )}
        </section>
      </motion.div>
    </motion.div>
  );
}
