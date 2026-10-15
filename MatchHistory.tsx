"use client";

import { ExternalLink, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { inPeriod, PERIOD_LABEL } from "@/lib/analytics";
import { ago, fmtDate, mapName } from "@/lib/format";
import type { ViewProps } from "./shared";
import { Btn, Card, Empty, ResultPill, SectionHead, cx, inputCls, selectCls } from "./ui";

interface Entry {
  id: string;
  finishedAt: number;
  map: string | null;
  url: string;
  score: string | null;
  players: Array<{ nickname: string; name: string; win: boolean | null; kills: number | null; deaths: number | null; assists: number | null; kd: number | null; adr: number | null }>;
}

const PAGE = 40;

export default function MatchHistory({ rows, period, now, loading, onOpen }: ViewProps) {
  const [q, setQ] = useState("");
  const [player, setPlayer] = useState("all");
  const [map, setMap] = useState("all");
  const [result, setResult] = useState<"all" | "win" | "loss">("all");
  const [limit, setLimit] = useState(PAGE);

  /* Matches are grouped by FACEIT match ID only; same map or same time never merges entries. */
  const entries = useMemo(() => {
    const byId = new Map<string, Entry>();
    for (const r of rows) {
      for (const m of r.p.matches) {
        if (!inPeriod(m, period, now)) continue;
        let e = byId.get(m.id);
        if (!e) {
          e = { id: m.id, finishedAt: m.finishedAt, map: m.map, url: m.url, score: m.score, players: [] };
          byId.set(m.id, e);
        }
        e.players.push({ nickname: r.p.nickname, name: r.p.name, win: m.win, kills: m.kills, deaths: m.deaths, assists: m.assists, kd: m.kd, adr: m.adr });
      }
    }
    return [...byId.values()].sort((a, b) => b.finishedAt - a.finishedAt);
  }, [rows, period, now]);

  const maps = useMemo(() => [...new Set(entries.map((e) => e.map).filter((x): x is string => !!x))].sort(), [entries]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter((e) => {
      if (map !== "all" && e.map !== map) return false;
      if (player !== "all" && !e.players.some((p) => p.nickname === player)) return false;
      if (needle && !e.players.some((p) => p.nickname.toLowerCase().includes(needle) || p.name.toLowerCase().includes(needle))) return false;
      if (result !== "all") {
        const rel = player !== "all" ? e.players.filter((p) => p.nickname === player) : e.players;
        if (!rel.some((p) => (result === "win" ? p.win === true : p.win === false))) return false;
      }
      return true;
    });
  }, [entries, q, player, map, result]);

  return (
    <div>
      <SectionHead kicker="Match history" title="История матчей OrdaX" />
      <div className="scroll-x mb-3 -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex min-w-max items-center gap-3 sm:min-w-0 sm:flex-wrap">
          <div className="relative w-56">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
            <input className={`${inputCls} pl-9`} placeholder="Ник или имя" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} aria-label="Поиск по нику" />
          </div>
          <select className={selectCls} value={player} onChange={(e) => { setPlayer(e.target.value); setLimit(PAGE); }} aria-label="Игрок">
            <option value="all">Все игроки</option>
            {rows.map((r) => <option key={r.p.nickname} value={r.p.nickname}>{r.p.name} ({r.p.nickname})</option>)}
          </select>
          <select className={selectCls} value={map} onChange={(e) => { setMap(e.target.value); setLimit(PAGE); }} aria-label="Карта">
            <option value="all">Все карты</option>
            {maps.map((m) => <option key={m} value={m}>{mapName(m)}</option>)}
          </select>
          <select className={selectCls} value={result} onChange={(e) => { setResult(e.target.value as typeof result); setLimit(PAGE); }} aria-label="Результат">
            <option value="all">Любой результат</option>
            <option value="win">Победы</option>
            <option value="loss">Поражения</option>
          </select>
          <select className={cx(selectCls, "opacity-60")} disabled aria-label="Диапазон изменения ELO" title="FACEIT Data API не отдаёт изменение ELO по матчам">
            <option>ΔELO: недоступно</option>
          </select>
        </div>
      </div>
      <p className="mb-4 font-mono text-[11px] text-mute">
        Период: {PERIOD_LABEL[period]} (меняется на вкладках Overview и Leaderboard). Фильтр по изменению ELO отключён: официальный API не отдаёт ELO по отдельным матчам. Игроки объединяются в одну запись только при совпадении ID матча FACEIT.
      </p>

      {loading && entries.length === 0 ? (
        <Empty>Загрузка…</Empty>
      ) : filtered.length === 0 ? (
        <Empty>{entries.length === 0 ? "Data unavailable: матчи ещё не загружены или за период их нет." : "Ничего не найдено по этим фильтрам."}</Empty>
      ) : (
        <>
          <div className="mb-2 font-mono text-[11px] text-mute">Найдено матчей: {filtered.length}</div>
          <ul className="space-y-2">
            {filtered.slice(0, limit).map((e) => {
              const shared = e.players.length > 1;
              return (
                <li key={e.id}>
                  <Card className="p-3" hover={false}>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <div className="font-display text-base font-semibold">{mapName(e.map)}</div>
                      {e.score && <span className="num text-sm text-mute">{e.score}</span>}
                      <span className="font-mono text-[11px] text-mute">{fmtDate(e.finishedAt)} · {ago(e.finishedAt, now)}</span>
                      {shared && <span className="rounded-sm border border-accent/40 px-1.5 py-0.5 font-mono text-[10px] text-accent">{e.players.length} игроков OrdaX</span>}
                      <span className="ml-auto"><Btn href={e.url}><ExternalLink size={13} /> Матч</Btn></span>
                    </div>
                    <ul className="mt-2 divide-y divide-line border-t border-line">
                      {e.players.map((p) => (
                        <li key={p.nickname} className="flex items-center gap-3 py-2">
                          <span className={cx("h-6 w-1 flex-none rounded-full", p.win === null ? "bg-line" : p.win ? "bg-win" : "bg-loss")} />
                          <button onClick={() => onOpen(p.nickname)} className="min-w-0 flex-1 truncate text-left text-sm hover:text-accent">
                            {p.name} <span className="font-mono text-xs text-mute">{p.nickname}</span>
                          </button>
                          <ResultPill win={p.win} />
                          <span className="num w-24 text-right text-sm">{p.kills ?? "—"}/{p.deaths ?? "—"}/{p.assists ?? "—"}</span>
                          <span className="num hidden w-14 text-right text-xs text-mute sm:inline">{p.kd !== null ? p.kd.toFixed(2) : "—"}</span>
                          <span className="num hidden w-14 text-right text-xs text-mute sm:inline">{p.adr !== null ? p.adr.toFixed(0) : ""}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                </li>
              );
            })}
          </ul>
          {filtered.length > limit && (
            <div className="mt-4 text-center">
              <Btn onClick={() => setLimit((l) => l + PAGE)}>Показать ещё</Btn>
            </div>
          )}
        </>
      )}
    </div>
  );
}
