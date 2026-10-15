"use client";

import { ArrowDown, ArrowUp, Download, Link2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { PERIOD_LABEL, sortRows, type Period, type Row, type SortKey } from "@/lib/analytics";
import { ago, fmt, fmtPct } from "@/lib/format";
import type { ViewProps } from "./shared";
import { Avatar, Btn, Card, Delta, LevelBadge, Reveal, SectionHead, Segmented, cx, inputCls, selectCls } from "./ui";

const COLS: Array<{ key: SortKey; label: string; align?: "right" }> = [
  { key: "level", label: "Lvl" },
  { key: "elo", label: "ELO", align: "right" },
  { key: "wr", label: "Win %", align: "right" },
  { key: "kd", label: "K/D", align: "right" },
  { key: "matches", label: "Matches", align: "right" },
  { key: "last", label: "Last activity" },
  { key: "d7", label: "ΔELO 7D", align: "right" },
  { key: "d30", label: "ΔELO 30D", align: "right" },
];

function csvCell(v: string | number | null): string {
  if (v === null) return "";
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv(list: Row[], period: Period) {
  const head = ["rank", "name", "nickname", "level", "elo", `win_rate_${period}`, `kd_${period}`, `matches_${period}`, "last_match_iso", "elo_change_7d", "elo_change_30d", `elo_change_${period}`, `opi_${period}`];
  const lines = [head.join(",")];
  list.forEach((r, i) => {
    lines.push(
      [
        i + 1,
        r.p.name,
        r.p.nickname,
        r.p.level,
        r.p.elo,
        r.st.winRate !== null ? r.st.winRate.toFixed(1) : null,
        r.st.kd !== null ? r.st.kd.toFixed(2) : null,
        r.st.matches,
        r.last ? new Date(r.last).toISOString() : null,
        r.d7.delta,
        r.d30.delta,
        r.dPeriod.delta,
        r.opi?.score ?? null,
      ]
        .map(csvCell)
        .join(","),
    );
  });
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ordax-leaderboard-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Leaderboard({ rows, period, now, onOpen, onPeriod }: ViewProps & { onPeriod: (p: Period) => void }) {
  const [q, setQ] = useState("");
  const [level, setLevel] = useState("all");
  const [sort, setSort] = useState<SortKey>("elo");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [copied, setCopied] = useState<string | null>(null);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let f = rows;
    if (needle) f = f.filter((r) => r.p.name.toLowerCase().includes(needle) || r.p.nickname.toLowerCase().includes(needle));
    if (level !== "all") f = f.filter((r) => r.p.level === Number(level));
    return sortRows(f, sort, dir);
  }, [rows, q, level, sort, dir]);

  const toggle = (k: SortKey) => {
    if (k === sort) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSort(k);
      setDir("desc");
    }
  };

  const copyLink = async () => {
    const url = `${location.origin}${location.pathname}#leaderboard`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied("Ссылка скопирована");
    } catch {
      setCopied(url);
    }
    setTimeout(() => setCopied(null), 3500);
  };

  const SortIcon = dir === "desc" ? ArrowDown : ArrowUp;

  return (
    <div>
      <SectionHead
        kicker="Leaderboard"
        title="Рейтинг игроков"
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Btn onClick={() => void copyLink()} title="Скопировать ссылку на рейтинг"><Link2 size={14} /> Share</Btn>
            <Btn onClick={() => exportCsv(list, period)}><Download size={14} /> CSV</Btn>
          </div>
        }
      />
      {copied && <div className="mb-3 break-all font-mono text-xs text-accent" role="status">{copied}</div>}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented value={period} onChange={onPeriod} />
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
          <input className={`${inputCls} pl-9`} placeholder="Имя или никнейм" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск" />
        </div>
        <select className={selectCls} value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Фильтр по FACEIT Level">
          <option value="all">Все Level</option>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((l) => (
            <option key={l} value={l}>Level {l}</option>
          ))}
        </select>
        <select className={cx(selectCls, "md:hidden")} value={sort} onChange={(e) => { setSort(e.target.value as SortKey); setDir("desc"); }} aria-label="Сортировка">
          {COLS.map((c) => <option key={c.key} value={c.key}>Сортировка: {c.label}</option>)}
        </select>
      </div>
      <p className="mb-3 font-mono text-[11px] text-mute">
        Win %, K/D, Matches за {PERIOD_LABEL[period]}. ΔELO считается по снимкам ELO, которые копятся при обновлениях; «N/A» значит истории пока мало, «*» значит история короче периода.
      </p>

      {/* desktop table */}
      <Reveal className="hidden md:block">
        <div className="overflow-x-auto rounded-md border border-line bg-card">
          <table className="w-full min-w-[920px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-bg2 text-left font-mono text-[11px] uppercase tracking-wider text-mute">
                <th className="w-12 px-3 py-3">#</th>
                <th className="px-3 py-3">Игрок</th>
                {COLS.map((c) => (
                  <th key={c.key} className={cx("px-3 py-3", c.align === "right" && "text-right")} aria-sort={sort === c.key ? (dir === "desc" ? "descending" : "ascending") : "none"}>
                    <button onClick={() => toggle(c.key)} className={cx("inline-flex items-center gap-1 hover:text-ink", sort === c.key && "text-accent")}>
                      {c.label}
                      {sort === c.key && <SortIcon size={12} />}
                    </button>
                  </th>
                ))}
                <th className="px-3 py-3 text-right" title="OrdaX Power Index (внутренняя метрика)">OPI</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r, i) => (
                <tr
                  key={r.p.nickname}
                  onClick={() => onOpen(r.p.nickname)}
                  className={cx("cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-bg2", i === 0 && sort === "elo" && "bg-accent/[0.05]")}
                >
                  <td className={cx("num px-3 py-3", i === 0 ? "text-accent" : "text-mute")}>{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <Avatar src={r.p.avatar} name={r.p.name} size={36} />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{r.p.name}</div>
                        <div className="truncate font-mono text-xs text-mute">{r.p.nickname}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5"><LevelBadge level={r.p.level} size={30} /></td>
                  <td className="num px-3 py-3 text-right text-base">{r.p.elo !== null ? fmt(r.p.elo) : <span className="text-mute">N/A</span>}</td>
                  <td className="num px-3 py-3 text-right">{fmtPct(r.st.winRate, 1)}</td>
                  <td className="num px-3 py-3 text-right">{r.st.kd !== null ? r.st.kd.toFixed(2) : "—"}</td>
                  <td className="num px-3 py-3 text-right">{r.st.matches !== null ? fmt(r.st.matches) : "—"}</td>
                  <td className="px-3 py-3 text-mute">{ago(r.last, now)}</td>
                  <td className="px-3 py-3 text-right"><Delta v={r.d7.delta} partial={r.d7.partial} /></td>
                  <td className="px-3 py-3 text-right"><Delta v={r.d30.delta} partial={r.d30.partial} /></td>
                  <td className="num px-3 py-3 text-right" title={r.opi?.reason}>{r.opi?.score !== null && r.opi?.score !== undefined ? r.opi.score.toFixed(1) : <span className="text-mute">N/A</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Reveal>

      {/* mobile cards */}
      <div className="space-y-2 md:hidden">
        {list.map((r, i) => (
          <Reveal key={r.p.nickname} delay={Math.min(i, 4) * 0.03}>
            <Card className={cx("p-3", i === 0 && sort === "elo" && "border-accent/40")} hover={false}>
              <button onClick={() => onOpen(r.p.nickname)} className="block w-full text-left">
                <div className="flex items-center gap-3">
                  <span className={cx("num w-6 text-center text-lg", i === 0 ? "text-accent" : "text-mute")}>{i + 1}</span>
                  <Avatar src={r.p.avatar} name={r.p.name} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{r.p.name}</div>
                    <div className="truncate font-mono text-xs text-mute">{r.p.nickname}</div>
                  </div>
                  <LevelBadge level={r.p.level} size={34} />
                  <div className="num text-right text-xl">{r.p.elo !== null ? fmt(r.p.elo) : <span className="text-mute">N/A</span>}</div>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 border-t border-line pt-2.5 text-center">
                  {[
                    ["WIN %", fmtPct(r.st.winRate, 0)],
                    ["K/D", r.st.kd !== null ? r.st.kd.toFixed(2) : "—"],
                    ["MATCHES", r.st.matches !== null ? fmt(r.st.matches) : "—"],
                    ["OPI", r.opi?.score !== null && r.opi?.score !== undefined ? r.opi.score.toFixed(1) : "N/A"],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div className="font-mono text-[9px] tracking-wider text-mute">{k}</div>
                      <div className="num text-sm">{v}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-mute">
                  <span>{ago(r.last, now)}</span>
                  <span className="flex gap-3">
                    <span>7D <Delta v={r.d7.delta} partial={r.d7.partial} /></span>
                    <span>30D <Delta v={r.d30.delta} partial={r.d30.partial} /></span>
                  </span>
                </div>
              </button>
            </Card>
          </Reveal>
        ))}
      </div>

      {list.length === 0 && <div className="rounded-md border border-dashed border-line p-8 text-center text-sm text-mute">Никого не найдено по этим фильтрам.</div>}
    </div>
  );
}
