"use client";

import { ExternalLink, Search, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { PERIOD_LABEL, sortRows, type Row, type SortKey } from "@/lib/analytics";
import { ago, fmt, fmtPct } from "@/lib/format";
import type { ViewProps } from "./shared";
import { Avatar, Btn, Card, Delta, LevelBadge, Reveal, SectionHead, Skel, inputCls, selectCls } from "./ui";

function ResolveForm({ nickname, onDone }: { nickname: string; onDone: () => void }) {
  const [id, setId] = useState("");
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname, playerId: id, token }),
      });
      const j = (await res.json()) as { error?: string; status?: string };
      if (!res.ok) setMsg(j.error ?? `Ошибка ${res.status}`);
      else {
        setMsg(j.status === "ok" ? "Профиль подтверждён." : `Статус после подтверждения: ${j.status}`);
        onDone();
      }
    } catch {
      setMsg("Не удалось связаться с сервером.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 space-y-2 rounded-md border border-line bg-bg2 p-3">
      <div className="font-mono text-[11px] uppercase tracking-wider text-mute">Подтвердить профиль вручную</div>
      <input className={inputCls} placeholder="FACEIT Player ID (UUID)" value={id} onChange={(e) => setId(e.target.value)} aria-label="FACEIT Player ID" />
      <input className={inputCls} type="password" placeholder="ADMIN_TOKEN" value={token} onChange={(e) => setToken(e.target.value)} aria-label="Админ-токен" autoComplete="off" />
      <div className="flex items-center gap-3">
        <Btn onClick={() => void submit()} disabled={busy || !id || !token}>
          {busy ? "Проверяю…" : "Подтвердить"}
        </Btn>
        {msg && <span className="text-xs text-mute">{msg}</span>}
      </div>
    </div>
  );
}

function Form3({ p, now }: { p: Row["p"]; now: number }) {
  const last = p.matches.slice(0, 3);
  if (!last.length) return <span className="font-mono text-xs text-mute">нет матчей</span>;
  return (
    <span className="inline-flex gap-1">
      {last.map((m) => (
        <span
          key={m.id}
          title={`${m.win === null ? "—" : m.win ? "WIN" : "LOSS"} · ${m.map ?? "map n/a"} · ${ago(m.finishedAt, now)}`}
          className={
            "inline-flex h-6 w-6 items-center justify-center rounded-sm border font-mono text-[11px] font-bold " +
            (m.win === null ? "border-line text-mute" : m.win ? "border-win/50 bg-win/10 text-win" : "border-loss/50 bg-loss/10 text-loss")
          }
        >
          {m.win === null ? "?" : m.win ? "W" : "L"}
        </span>
      ))}
    </span>
  );
}

export default function Roster({ rows, period, now, loading, onOpen, onRefresh }: ViewProps & { onRefresh: () => Promise<void> }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("elo");

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const f = needle ? rows.filter((r) => r.p.name.toLowerCase().includes(needle) || r.p.nickname.toLowerCase().includes(needle)) : rows;
    return sortRows(f, sort, sort === "name" ? "asc" : "desc");
  }, [rows, q, sort]);

  return (
    <div>
      <SectionHead kicker="Roster" title="Состав OrdaX" />
      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
          <input className={`${inputCls} pl-9`} placeholder="Поиск по имени или нику" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск игрока" />
        </div>
        <select className={selectCls} value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Сортировка">
          <option value="elo">Сортировка: ELO</option>
          <option value="level">Сортировка: Level</option>
          <option value="wr">Сортировка: Win Rate</option>
          <option value="kd">Сортировка: K/D</option>
          <option value="matches">Сортировка: матчи</option>
          <option value="last">Сортировка: активность</option>
          <option value="d7">Сортировка: ΔELO 7D</option>
          <option value="name">Сортировка: имя</option>
        </select>
        <span className="self-center font-mono text-[11px] text-mute">Статистика за {PERIOD_LABEL[period]}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((r, i) => {
          const { p, st } = r;
          const pending = p.status === "pending";
          const problem = p.status === "not_found" || p.status === "mismatch" || p.status === "error";
          const strk = p.matches.length ? r : null;
          let streakLabel = "—";
          if (strk) {
            let t: boolean | null = null;
            let n = 0;
            for (const m of p.matches) {
              if (m.win === null) break;
              if (t === null) t = m.win;
              if (m.win !== t) break;
              n++;
            }
            if (t !== null) streakLabel = `${n}${t ? "W" : "L"}`;
          }
          return (
            <Reveal key={p.nickname} delay={Math.min(i, 5) * 0.04}>
              <Card className="flex h-full flex-col p-4">
                <div className="flex items-center gap-3">
                  {pending && loading ? <Skel className="h-12 w-12" /> : <Avatar src={p.avatar} name={p.name} size={48} />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-lg font-semibold leading-tight">{p.name}</div>
                    <div className="truncate font-mono text-xs text-mute">{p.nickname}</div>
                  </div>
                  <LevelBadge level={p.level} size={40} />
                </div>

                <div className="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">ELO</div>
                    <div className="num text-4xl leading-none text-ink">
                      {pending && loading ? <Skel className="h-9 w-24" /> : p.elo !== null ? fmt(p.elo) : <span className="text-mute">N/A</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">ΔELO {PERIOD_LABEL[period]}</div>
                    <div className="text-lg"><Delta v={r.dPeriod.delta} partial={r.dPeriod.partial} /></div>
                  </div>
                </div>

                <dl className="mt-4 grid grid-cols-4 gap-2 border-t border-line pt-3 text-center">
                  {[
                    ["MATCHES", st.matches !== null ? fmt(st.matches) : "—"],
                    ["W–L", st.wins !== null && st.losses !== null ? `${st.wins}–${st.losses}` : "—"],
                    ["WIN %", fmtPct(st.winRate, 0)],
                    ["K/D", st.kd !== null ? st.kd.toFixed(2) : "—"],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="font-mono text-[9px] tracking-[0.12em] text-mute">{k}</dt>
                      <dd className="num mt-0.5 text-sm text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="text-mute">Последний матч</div>
                    <div className="num text-ink">{ago(r.last, now)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-mute">Серия</div>
                    <div className="num text-ink">{streakLabel}</div>
                  </div>
                  <div className="text-right">
                    <div className="mb-1 text-mute">Последние 3</div>
                    <Form3 p={p} now={now} />
                  </div>
                </div>

                {p.message && (
                  <div className={"mt-3 flex items-start gap-2 text-xs " + (problem ? "text-accent" : "text-mute")}>
                    {problem && <TriangleAlert size={14} className="mt-0.5 flex-none" />}
                    <span>{p.message}</span>
                  </div>
                )}
                {(p.status === "not_found" || p.status === "mismatch") && <ResolveForm nickname={p.nickname} onDone={() => void onRefresh()} />}

                <div className="mt-auto flex gap-2 pt-4">
                  <Btn variant="solid" onClick={() => onOpen(p.nickname)} className="flex-1" disabled={pending}>
                    View Profile
                  </Btn>
                  <Btn href={p.faceitUrl} title="Открыть профиль на FACEIT">
                    <ExternalLink size={14} /> FACEIT
                  </Btn>
                </div>
              </Card>
            </Reveal>
          );
        })}
      </div>
    </div>
  );
}
