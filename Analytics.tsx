"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useReducedMotion } from "framer-motion";
import {
  DEFAULT_THRESHOLDS,
  OPI_MIN_MATCHES,
  OPI_WEIGHTS,
  PERIOD_LABEL,
  POW_MIN_MATCHES,
  computeAlerts,
  countSince,
  daysSince,
  stdev,
  type Thresholds,
} from "@/lib/analytics";
import { ago, fmt, fmtDate, fmtPct, fmtShortDate, fmtSigned } from "@/lib/format";
import type { ViewProps } from "./shared";
import { useThresholds } from "./thresholds";
import { Btn, Card, Delta, Empty, Reveal, SectionHead, cx, inputCls, selectCls } from "./ui";

const AXIS = { stroke: "#8B949E", fontSize: 11 } as const;
const GRID = "#252B33";
const ACCENT = "#FF5500";
const MUTED_BAR = "#4A5560";

const tipStyle = {
  contentStyle: { background: "#171C22", border: "1px solid #252B33", borderRadius: 6, fontSize: 12, color: "#F3F4F6" },
  labelStyle: { color: "#8B949E" },
  itemStyle: { color: "#F3F4F6" },
  cursor: { fill: "rgba(255,85,0,0.06)" },
} as const;

function Panel({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <Reveal>
      <Card className="h-full p-4" hover={false}>
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        {note && <p className="mt-1 text-xs text-mute">{note}</p>}
        <div className="mt-3">{children}</div>
      </Card>
    </Reveal>
  );
}

export default function Analytics({ rows, period, now, onOpen }: ViewProps) {
  const reduce = useReducedMotion();
  const [th, setTh, resetTh] = useThresholds();
  const [aNick, setA] = useState<string>("");
  const [bNick, setB] = useState<string>("");

  const players = useMemo(() => rows.map((r) => r.p), [rows]);
  const ok = rows.filter((r) => r.p.status === "ok");
  const withElo = rows.filter((r) => r.p.elo !== null);
  const hasData = ok.length > 0;

  /* ELO distribution */
  const eloData = [...withElo].sort((a, b) => (b.p.elo as number) - (a.p.elo as number)).map((r) => ({ name: r.p.name, nick: r.p.nickname, elo: r.p.elo as number }));
  const eloMin = eloData.length ? Math.min(...eloData.map((d) => d.elo)) : 0;

  /* Level distribution */
  const levelData = Array.from({ length: 10 }, (_, i) => ({ level: `L${i + 1}`, count: rows.filter((r) => r.p.level === i + 1).length }));

  /* Activity monitor */
  const actData = rows
    .filter((r) => r.last !== null)
    .map((r) => ({ name: r.p.name, days: Math.round((daysSince(r.last, now) ?? 0) * 10) / 10, m7: countSince(r.p, 7, now), m30: countSince(r.p, 30, now) }))
    .sort((a, b) => a.days - b.days);

  /* Win rate comparison */
  const wrData = rows
    .filter((r) => r.st.winRate !== null && r.st.matches)
    .map((r) => ({ name: r.p.name, wr: Math.round((r.st.winRate as number) * 10) / 10, matches: r.st.matches as number }))
    .sort((a, b) => b.wr - a.wr);

  /* Consistency */
  const elos = withElo.map((r) => r.p.elo as number);
  const sortedElos = [...elos].sort((a, b) => a - b);
  const median = sortedElos.length ? (sortedElos.length % 2 ? sortedElos[(sortedElos.length - 1) / 2] : (sortedElos[sortedElos.length / 2 - 1] + sortedElos[sortedElos.length / 2]) / 2) : null;
  const sd = stdev(elos);
  const levels = rows.map((r) => r.p.level).filter((x): x is number => x !== null);
  const avgLevel = levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : null;

  const alerts = computeAlerts(players, th, now);

  /* Head-to-head */
  const defaultA = withElo[0]?.p.nickname ?? rows[0]?.p.nickname ?? "";
  const defaultB = withElo[1]?.p.nickname ?? rows[1]?.p.nickname ?? "";
  const ra = rows.find((r) => r.p.nickname === (aNick || defaultA));
  const rb = rows.find((r) => r.p.nickname === (bNick || defaultB));

  const h2hSeries = useMemo(() => {
    if (!ra || !rb) return [];
    const ts = new Set<number>([...ra.p.snapshots.map((s) => s.t), ...rb.p.snapshots.map((s) => s.t)]);
    const sa = new Map(ra.p.snapshots.map((s) => [s.t, s.elo]));
    const sb = new Map(rb.p.snapshots.map((s) => [s.t, s.elo]));
    return [...ts].sort((x, y) => x - y).map((t) => ({ t, a: sa.get(t) ?? null, b: sb.get(t) ?? null }));
  }, [ra, rb]);

  const setNum = (k: keyof Thresholds, v: string) => {
    const n = Number(v);
    if (isFinite(n) && n >= 0) setTh({ ...th, [k]: n });
  };

  if (!hasData) {
    return (
      <div>
        <SectionHead kicker="Team analytics" title="Аналитика команды" />
        <Empty>Data unavailable: аналитика строится только по реальным данным FACEIT. Подключи API и обнови данные.</Empty>
        <Methodology rows={rows} period={period} />
      </div>
    );
  }

  const h2hRows: Array<[string, (r: NonNullable<typeof ra>) => string, (r: NonNullable<typeof ra>) => number | null, boolean]> = [
    ["ELO", (r) => fmt(r.p.elo), (r) => r.p.elo, true],
    ["Level", (r) => fmt(r.p.level), (r) => r.p.level, true],
    [`Win rate ${PERIOD_LABEL[period]}`, (r) => fmtPct(r.st.winRate, 1), (r) => r.st.winRate, true],
    [`Avg K/D ${PERIOD_LABEL[period]}`, (r) => (r.st.kd !== null ? r.st.kd.toFixed(2) : "—"), (r) => r.st.kd, true],
    ["Headshots %", (r) => fmtPct(r.st.hs, 1), (r) => r.st.hs, true],
    [`Матчей ${PERIOD_LABEL[period]}`, (r) => fmt(r.st.matches), (r) => r.st.matches, true],
    ["ΔELO 30D", (r) => fmtSigned(r.d30.delta), (r) => r.d30.delta, true],
    ["OPI", (r) => (r.opi?.score != null ? r.opi.score.toFixed(1) : "N/A"), (r) => r.opi?.score ?? null, true],
  ];

  return (
    <div>
      <SectionHead kicker="Team analytics" title="Аналитика команды" />
      <p className="mb-5 max-w-3xl text-sm text-mute">
        Показатели описывают факты и не оценивают игроков. Низкий ELO или малое число матчей не означают «слабого» игрока. Период расчётов: {PERIOD_LABEL[period]} (переключается на Overview и Leaderboard).
      </p>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="ELO distribution" note="ELO каждого игрока команды.">
          {eloData.length ? (
            <div style={{ height: Math.max(180, eloData.length * 34 + 30) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={eloData} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={GRID} horizontal={false} />
                  <XAxis type="number" domain={[Math.max(0, Math.floor((eloMin - 100) / 100) * 100), "dataMax + 50"]} {...AXIS} />
                  <YAxis type="category" dataKey="name" width={92} {...AXIS} />
                  <Tooltip {...tipStyle} formatter={(v: number) => [fmt(v), "ELO"]} />
                  <Bar dataKey="elo" fill={ACCENT} radius={[0, 3, 3, 0]} isAnimationActive={!reduce} animationDuration={700} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty>Data unavailable</Empty>}
        </Panel>

        <Panel title="Level distribution" note="Сколько игроков на каждом FACEIT Level.">
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={levelData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="level" {...AXIS} />
                <YAxis allowDecimals={false} {...AXIS} />
                <Tooltip {...tipStyle} formatter={(v: number) => [v, "игроков"]} />
                <Bar dataKey="count" fill={ACCENT} radius={[3, 3, 0, 0]} isAnimationActive={!reduce} animationDuration={700} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Activity monitor" note="Дней с последнего матча. Светлее: давно не играл. В подсказке число матчей за 7 и 30 дней.">
          {actData.length ? (
            <div style={{ height: Math.max(180, actData.length * 34 + 30) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={actData} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={GRID} horizontal={false} />
                  <XAxis type="number" {...AXIS} />
                  <YAxis type="category" dataKey="name" width={92} {...AXIS} />
                  <Tooltip
                    {...tipStyle}
                    formatter={(v: number, _n: string, item: { payload?: { m7: number; m30: number } }) => [`${v} дн. · 7D: ${item.payload?.m7 ?? "—"} · 30D: ${item.payload?.m30 ?? "—"}`, "с последнего матча"]}
                  />
                  <Bar dataKey="days" radius={[0, 3, 3, 0]} isAnimationActive={!reduce} animationDuration={700}>
                    {actData.map((d) => (
                      <Cell key={d.name} fill={d.days > th.inactive14 ? ACCENT : d.days > th.inactive7 ? "#B8501F" : MUTED_BAR} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty>Data unavailable</Empty>}
        </Panel>

        <Panel title="Win rate comparison" note={`За ${PERIOD_LABEL[period]}. Бледные столбцы: меньше 10 матчей, сравнение ненадёжно.`}>
          {wrData.length ? (
            <div style={{ height: Math.max(180, wrData.length * 34 + 30) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={wrData} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={GRID} horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} unit="%" {...AXIS} />
                  <YAxis type="category" dataKey="name" width={92} {...AXIS} />
                  <ReferenceLine x={50} stroke="#8B949E" strokeDasharray="4 4" />
                  <Tooltip {...tipStyle} formatter={(v: number, _n: string, item: { payload?: { matches: number } }) => [`${v}% · ${item.payload?.matches ?? "—"} матчей`, "Win rate"]} />
                  <Bar dataKey="wr" radius={[0, 3, 3, 0]} isAnimationActive={!reduce} animationDuration={700}>
                    {wrData.map((d) => <Cell key={d.name} fill={ACCENT} fillOpacity={d.matches < 10 ? 0.4 : 1} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty>Data unavailable за выбранный период</Empty>}
        </Panel>
      </div>

      <section className="mt-8">
        <h3 className="mb-3 font-display text-xl font-semibold">Performance overview</h3>
        <Reveal>
          <div className="overflow-x-auto rounded-md border border-line bg-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line bg-bg2 text-left font-mono text-[11px] uppercase tracking-wider text-mute">
                  <th className="px-3 py-2.5">Игрок</th>
                  <th className="px-3 py-2.5 text-right">Matches</th>
                  <th className="px-3 py-2.5 text-right">Win %</th>
                  <th className="px-3 py-2.5 text-right">Avg K/D</th>
                  <th className="px-3 py-2.5 text-right">HS %</th>
                  <th className="px-3 py-2.5 text-right">ADR</th>
                  <th className="px-3 py-2.5 text-right">Avg kills</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.p.nickname} className="border-b border-line last:border-0 hover:bg-bg2">
                    <td className="px-3 py-2.5"><button onClick={() => onOpen(r.p.nickname)} className="hover:text-accent">{r.p.name} <span className="font-mono text-xs text-mute">{r.p.nickname}</span></button></td>
                    <td className="num px-3 py-2.5 text-right">{fmt(r.st.matches)}</td>
                    <td className="num px-3 py-2.5 text-right">{fmtPct(r.st.winRate, 1)}</td>
                    <td className="num px-3 py-2.5 text-right">{r.st.kd !== null ? r.st.kd.toFixed(2) : "—"}</td>
                    <td className="num px-3 py-2.5 text-right">{fmtPct(r.st.hs, 1)}</td>
                    <td className="num px-3 py-2.5 text-right">{r.st.adr !== null ? r.st.adr.toFixed(1) : "—"}</td>
                    <td className="num px-3 py-2.5 text-right">{r.st.avgKills !== null ? r.st.avgKills.toFixed(1) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
        <p className="mt-2 text-[11px] text-mute">Прочерк означает, что поле недоступно в ответе FACEIT API. HS %, ADR и средние убийства считаются по загруженной выборке последних матчей.</p>
      </section>

      <section className="mt-8">
        <h3 className="mb-3 font-display text-xl font-semibold">Team consistency</h3>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
          {[
            ["Max ELO", elos.length ? fmt(Math.max(...elos)) : "N/A"],
            ["Min ELO", elos.length ? fmt(Math.min(...elos)) : "N/A"],
            ["Spread", elos.length ? fmt(Math.max(...elos) - Math.min(...elos)) : "N/A"],
            ["Std dev", sd !== null ? fmt(sd, 0) : "N/A"],
            ["Median ELO", median !== null ? fmt(median, 0) : "N/A"],
            ["Avg level", avgLevel !== null ? avgLevel.toFixed(1) : "N/A"],
          ].map(([k, v]) => (
            <Reveal key={k}>
              <Card className="p-3" hover={false}>
                <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-mute">{k}</div>
                <div className="num mt-1 text-xl">{v}</div>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h3 className="font-display text-xl font-semibold">Activity alerts</h3>
          <Btn onClick={resetTh}>Сбросить пороги</Btn>
        </div>
        <Card className="p-4" hover={false}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {([
              ["inactive7", "Не играл, дней (info)"],
              ["inactive14", "Не играл, дней (warn)"],
              ["eloDrop", "Падение ELO за 7 дней"],
              ["lossStreak", "Серия поражений"],
              ["surge", "Рост активности, ×"],
            ] as Array<[keyof Thresholds, string]>).map(([k, label]) => (
              <label key={k} className="block text-xs text-mute">
                {label}
                <input className={cx(inputCls, "mt-1")} type="number" min={0} step={k === "surge" ? 0.5 : 1} value={th[k]} onChange={(e) => setNum(k, e.target.value)} />
              </label>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-mute">Пороги хранятся в этом браузере. По умолчанию: {Object.entries(DEFAULT_THRESHOLDS).map(([k, v]) => `${k}=${v}`).join(", ")}.</p>
          {alerts.length ? (
            <ul className="mt-4 divide-y divide-line border-t border-line">
              {alerts.map((a, i) => (
                <li key={`${a.nickname}-${a.kind}-${i}`} className="flex items-start gap-3 py-2.5 text-sm">
                  <span className={cx("mt-1.5 h-2 w-2 flex-none rounded-full", a.level === "warn" ? "bg-accent" : "bg-mute")} />
                  <span><button onClick={() => onOpen(a.nickname)} className="font-medium hover:text-accent">{a.name}</button> <span className="text-mute">· {a.text}</span></span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-4 border-t border-line pt-3 text-sm text-mute">Предупреждений нет при текущих порогах.</div>
          )}
        </Card>
      </section>

      <section className="mt-8">
        <h3 className="mb-3 font-display text-xl font-semibold">Head-to-head</h3>
        <Card className="p-4" hover={false}>
          <div className="grid gap-3 sm:grid-cols-2">
            <select className={selectCls} value={aNick || defaultA} onChange={(e) => setA(e.target.value)} aria-label="Игрок A">
              {rows.map((r) => <option key={r.p.nickname} value={r.p.nickname}>{r.p.name} ({r.p.nickname})</option>)}
            </select>
            <select className={selectCls} value={bNick || defaultB} onChange={(e) => setB(e.target.value)} aria-label="Игрок B">
              {rows.map((r) => <option key={r.p.nickname} value={r.p.nickname}>{r.p.name} ({r.p.nickname})</option>)}
            </select>
          </div>
          {ra && rb ? (
            <>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="border-b border-line font-mono text-[11px] uppercase tracking-wider text-mute">
                      <th className="px-2 py-2 text-left">Показатель</th>
                      <th className="px-2 py-2 text-right text-accent">{ra.p.name}</th>
                      <th className="px-2 py-2 text-right">{rb.p.name}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {h2hRows.map(([label, show, val]) => {
                      const va = val(ra);
                      const vb = val(rb);
                      const aBetter = va !== null && vb !== null && va > vb;
                      const bBetter = va !== null && vb !== null && vb > va;
                      return (
                        <tr key={label} className="border-b border-line last:border-0">
                          <td className="px-2 py-2 text-mute">{label}</td>
                          <td className={cx("num px-2 py-2 text-right", aBetter && "text-accent")}>{show(ra)}</td>
                          <td className={cx("num px-2 py-2 text-right", bBetter && "text-accent")}>{show(rb)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-4">
                {h2hSeries.length >= 2 ? (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={h2hSeries} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(t: number) => fmtShortDate(t)} {...AXIS} />
                        <YAxis domain={["dataMin - 10", "dataMax + 10"]} width={48} allowDecimals={false} {...AXIS} />
                        <Tooltip {...tipStyle} labelFormatter={(t: number) => fmtDate(t)} />
                        <Line type="monotone" name={ra.p.name} dataKey="a" stroke={ACCENT} strokeWidth={2} dot={false} connectNulls isAnimationActive={!reduce} />
                        <Line type="monotone" name={rb.p.name} dataKey="b" stroke="#C9D1D9" strokeWidth={2} dot={false} connectNulls isAnimationActive={!reduce} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-line p-5 text-center text-sm text-mute">График ELO появится, когда накопится минимум два снимка.</div>
                )}
              </div>
            </>
          ) : <Empty>Data unavailable</Empty>}
        </Card>
      </section>

      <Methodology rows={rows} period={period} />
    </div>
  );
}

function Methodology({ rows, period }: Pick<ViewProps, "rows" | "period">) {
  const [open, setOpen] = useState<string | null>(null);
  const sorted = [...rows].sort((a, b) => (b.opi?.score ?? -1) - (a.opi?.score ?? -1));
  return (
    <section className="mt-10" id="methodology">
      <SectionHead kicker="Methodology" title="OrdaX Power Index (OPI)" />
      <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-mute">
        <p>
          OPI от 0 до 100 помогает сравнивать игроков по нескольким доступным показателям сразу. Это внутренняя аналитическая метрика OrdaX, а не официальный показатель FACEIT, и она не оценивает игрока как человека.
        </p>
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full min-w-[520px] text-sm text-ink">
            <thead>
              <tr className="border-b border-line bg-bg2 text-left font-mono text-[11px] uppercase tracking-wider text-mute">
                <th className="px-3 py-2">Компонент</th><th className="px-3 py-2 text-right">Вес</th><th className="px-3 py-2">Как считается (0–1)</th>
              </tr>
            </thead>
            <tbody className="text-mute">
              <tr className="border-b border-line"><td className="px-3 py-2 text-ink">ELO в команде</td><td className="num px-3 py-2 text-right">{OPI_WEIGHTS.elo * 100}%</td><td className="px-3 py-2">(ELO − мин. по команде) / (макс. − мин.)</td></tr>
              <tr className="border-b border-line"><td className="px-3 py-2 text-ink">Win Rate</td><td className="num px-3 py-2 text-right">{OPI_WEIGHTS.wr * 100}%</td><td className="px-3 py-2">Побед с поправкой на выборку: (победы + 10) / (матчи + 20), шкала 35%–65% → 0–1</td></tr>
              <tr className="border-b border-line"><td className="px-3 py-2 text-ink">K/D</td><td className="num px-3 py-2 text-right">{OPI_WEIGHTS.kd * 100}%</td><td className="px-3 py-2">(K/D × n + 1.0 × 10) / (n + 10), шкала 0.7–1.5 → 0–1</td></tr>
              <tr className="border-b border-line"><td className="px-3 py-2 text-ink">Активность</td><td className="num px-3 py-2 text-right">{OPI_WEIGHTS.activity * 100}%</td><td className="px-3 py-2">Матчи за 30 дней / 20, максимум 1</td></tr>
              <tr><td className="px-3 py-2 text-ink">Форма</td><td className="num px-3 py-2 text-right">{OPI_WEIGHTS.form * 100}%</td><td className="px-3 py-2">Победы в последних 10 матчах с поправкой: (победы + 2.5) / (матчи + 5)</td></tr>
            </tbody>
          </table>
        </div>
        <p>
          Поправки к Win Rate и K/D подтягивают результат к среднему значению при малом числе матчей, поэтому игрок с двумя матчами не обгоняет игрока со ста только за счёт удачной серии. Если за период меньше {OPI_MIN_MATCHES} матчей или не хватает данных, OPI показывается как N/A.
        </p>
        <p>
          Player of the Week: среди игроков минимум с {POW_MIN_MATCHES} матчами за 7 дней берётся максимум из 50% × Win Rate с поправкой + 30% × K/D с поправкой (шкала 0.7–1.5) + 20% × объём матчей за неделю (до 10).
        </p>
      </div>

      <h3 className="mb-2 mt-6 font-display text-lg font-semibold">Вклад компонентов · {PERIOD_LABEL[period]}</h3>
      <ul className="space-y-2">
        {sorted.map((r) => {
          const opi = r.opi;
          const isOpen = open === r.p.nickname;
          return (
            <li key={r.p.nickname} className="rounded-md border border-line bg-card">
              <button onClick={() => setOpen(isOpen ? null : r.p.nickname)} aria-expanded={isOpen} className="flex min-h-[48px] w-full items-center gap-3 px-3 py-2 text-left">
                <span className="min-w-0 flex-1 truncate text-sm">{r.p.name} <span className="font-mono text-xs text-mute">{r.p.nickname}</span></span>
                <span className="num text-lg">{opi?.score != null ? opi.score.toFixed(1) : <span className="text-mute">N/A</span>}</span>
              </button>
              {isOpen && opi && (
                <div className="border-t border-line px-3 py-3 text-sm">
                  {opi.reason && <div className="mb-2 text-xs text-accent">N/A: {opi.reason}</div>}
                  <ul className="space-y-2">
                    {opi.parts.map((part) => (
                      <li key={part.key}>
                        <div className="flex justify-between gap-2 text-xs">
                          <span>{part.label} <span className="text-mute">· вес {Math.round(part.weight * 100)}%</span></span>
                          <span className="num">{part.contrib !== null ? `${part.contrib.toFixed(1)} / ${(part.weight * 100).toFixed(0)}` : "—"}</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-steel">
                          <div className="h-full bg-accent" style={{ width: `${(part.value ?? 0) * 100}%` }} />
                        </div>
                        <div className="mt-0.5 text-[11px] text-mute">{part.detail}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
