"use client";

import { AlertTriangle, Clock, Crown, KeyRound, TrendingUp, Trophy } from "lucide-react";
import { computeAlerts, daysSince, inPeriod, playerOfWeek, POW_MIN_MATCHES, PERIOD_LABEL } from "@/lib/analytics";
import { ago, fmt, fmtPct, fmtSigned } from "@/lib/format";
import { ROSTER } from "@/lib/players";
import type { ViewProps } from "./shared";
import { useThresholds } from "./thresholds";
import { AnimatedNumber, Avatar, Card, Empty, LevelBadge, Reveal, SectionHead, Segmented, Stat, selectCls } from "./ui";
import type { Period } from "@/lib/analytics";

interface Props extends ViewProps {
  onPeriod: (p: Period) => void;
  intervalMin: number;
  onInterval: (m: number) => void;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export default function Overview({ data, rows, period, now, loading, onOpen, onPeriod, intervalMin, onInterval }: Props) {
  const [th] = useThresholds();
  const players = rows.map((r) => r.p);
  const n = ROSTER.length;
  const withElo = rows.filter((r) => r.p.elo !== null);
  const elos = withElo.map((r) => r.p.elo as number);
  const levels = rows.map((r) => r.p.level).filter((x): x is number => x !== null);

  const matchCounts = rows.map((r) => r.st.matches).filter((x): x is number => x !== null);
  const totalMatches = matchCounts.length ? matchCounts.reduce((a, b) => a + b, 0) : null;
  const uniqueMatches = new Set(players.flatMap((p) => p.matches.filter((m) => inPeriod(m, period, now)).map((m) => m.id))).size;

  const decided = rows.filter((r) => r.st.wins !== null && r.st.losses !== null);
  const wins = decided.reduce((a, r) => a + (r.st.wins ?? 0), 0);
  const games = decided.reduce((a, r) => a + (r.st.wins ?? 0) + (r.st.losses ?? 0), 0);
  const teamWr = games > 0 ? (wins / games) * 100 : null;

  const withMatches = rows.filter((r) => r.last !== null);
  const active7 = withMatches.filter((r) => (daysSince(r.last, now) ?? 99) <= 7).length;

  const pow = playerOfWeek(players, now);
  const powPlayer = pow ? players.find((p) => p.nickname === pow.nickname) : null;

  const gains = rows.filter((r) => r.dPeriod.delta !== null).sort((a, b) => (b.dPeriod.delta as number) - (a.dPeriod.delta as number));
  const bestGain = gains.length && (gains[0].dPeriod.delta as number) > 0 ? gains[0] : null;

  const leader = [...withElo].sort((a, b) => (b.p.elo as number) - (a.p.elo as number))[0] ?? null;

  const radar = [...withMatches].sort((a, b) => (a.last as number) - (b.last as number)).slice(0, 5);
  const alerts = computeAlerts(players, th, now);

  const notConfigured = data !== null && !data.configured;

  return (
    <div className="space-y-10">
      <Reveal>
        <section className="pt-4 sm:pt-8">
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-mute">
            Player performance / Rankings / Match activity
          </div>
          <h1 className="mt-3 font-display text-[34px] font-bold leading-[1.02] tracking-tight text-ink sm:text-6xl lg:text-7xl">
            ORDAX <span className="text-accent">/</span>
            <br className="sm:hidden" /> TEAM INTELLIGENCE
          </h1>
          <p className="mt-4 font-mono text-xs uppercase tracking-[0.16em] text-mute sm:text-sm">
            Counter-Strike 2 · FACEIT Competitive Analytics
          </p>
        </section>
      </Reveal>

      {notConfigured && (
        <Reveal>
          <div className="rounded-md border border-accent/40 bg-accent/5 p-4 sm:p-5">
            <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-accent">
              <KeyRound size={14} /> API NOT CONFIGURED
            </div>
            <p className="mt-2 max-w-3xl text-sm text-ink">
              Сервер не получил ключ FACEIT Data API, поэтому реальных данных нет. Все показатели ниже отображаются как N/A: сайт не подставляет выдуманные числа.
            </p>
            <ol className="mt-3 list-inside list-decimal space-y-1 text-sm text-mute">
              <li>Получи серверный ключ на developers.faceit.com.</li>
              <li>Задай его в переменной окружения FACEIT_API_KEY на сервере (см. .env.example и README).</li>
              <li>Перезапусти приложение и нажми Refresh.</li>
            </ol>
          </div>
        </Reveal>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={period} onChange={onPeriod} />
        <label className="flex items-center gap-2 font-mono text-xs text-mute">
          Auto-refresh
          <select className={selectCls} value={intervalMin} onChange={(e) => onInterval(Number(e.target.value))} aria-label="Автообновление">
            <option value={0}>Off</option>
            <option value={5}>5 min</option>
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
          </select>
        </label>
        {data?.configured && (
          <span className="font-mono text-[11px] text-mute">
            Синхронизация: профилей OK {data.ok}, ошибок {data.failed} · хранилище снимков: {data.storage}
          </span>
        )}
      </div>

      <section aria-label="Общая статистика">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Reveal><Stat label="Total players" hint="Игроков в составе OrdaX." loading={false}>{n}</Stat></Reveal>
          <Reveal delay={0.04}>
            <Stat label="Team ELO" hint={elos.length ? `Сумма ELO, данные по ${elos.length} из ${n} игроков.` : "Сумма ELO всех игроков."} loading={loading}>
              {elos.length ? <AnimatedNumber value={elos.reduce((a, b) => a + b, 0)} /> : "N/A"}
            </Stat>
          </Reveal>
          <Reveal delay={0.08}>
            <Stat label="Avg ELO" hint="Средний ELO по игрокам с доступными данными." loading={loading}>
              {elos.length ? <AnimatedNumber value={mean(elos)} /> : "N/A"}
            </Stat>
          </Reveal>
          <Reveal delay={0.12}>
            <Stat label="Avg level" hint="Средний FACEIT Level (1–10)." loading={loading}>
              {levels.length ? <AnimatedNumber value={mean(levels)} digits={1} /> : "N/A"}
            </Stat>
          </Reveal>
          <Reveal delay={0.16}>
            <Stat
              label="Matches played"
              hint={totalMatches !== null ? `За ${PERIOD_LABEL[period]}, сумма по игрокам. Уникальных матчей в выборке: ${uniqueMatches}.` : "Матчи игроков за выбранный период."}
              loading={loading}
            >
              {totalMatches !== null ? <AnimatedNumber value={totalMatches} /> : "N/A"}
            </Stat>
          </Reveal>
          <Reveal delay={0.2}>
            <Stat label="Team win rate" hint={`Доля побед по всем матчам игроков за ${PERIOD_LABEL[period]}.`} loading={loading}>
              {teamWr !== null ? <AnimatedNumber value={teamWr} digits={1} suffix="%" /> : "N/A"}
            </Stat>
          </Reveal>
          <Reveal delay={0.24}>
            <Stat
              label="Recent activity"
              hint={withMatches.length ? `Игроков с матчем за 7 дней, из ${withMatches.length} с историей.` : "Игроков, игравших за последние 7 дней."}
              loading={loading}
            >
              {withMatches.length ? <AnimatedNumber value={active7} /> : "N/A"}
            </Stat>
          </Reveal>
        </div>
      </section>

      <section aria-label="Главное">
        <SectionHead kicker="Highlights" title="Сейчас в команде" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Reveal>
            <Card className="h-full p-4">
              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-mute">
                <Crown size={14} className="text-accent" /> Сильнейший по ELO
              </div>
              {leader ? (
                <button onClick={() => onOpen(leader.p.nickname)} className="mt-3 flex w-full items-center gap-3 text-left">
                  <Avatar src={leader.p.avatar} name={leader.p.name} size={48} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-lg font-semibold">{leader.p.name}</div>
                    <div className="truncate font-mono text-xs text-mute">{leader.p.nickname}</div>
                  </div>
                  <LevelBadge level={leader.p.level} />
                  <div className="num text-2xl text-ink">{fmt(leader.p.elo)}</div>
                </button>
              ) : (
                <div className="mt-3 text-sm text-mute">Data unavailable</div>
              )}
            </Card>
          </Reveal>

          <Reveal delay={0.05}>
            <Card className="h-full p-4">
              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-mute">
                <Trophy size={14} className="text-accent" /> Player of the week
              </div>
              {pow && powPlayer ? (
                <>
                  <button onClick={() => onOpen(powPlayer.nickname)} className="mt-3 flex w-full items-center gap-3 text-left">
                    <Avatar src={powPlayer.avatar} name={powPlayer.name} size={48} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-lg font-semibold">{powPlayer.name}</div>
                      <div className="truncate font-mono text-xs text-mute">{powPlayer.nickname}</div>
                    </div>
                    <div className="num text-2xl text-accent">{pow.score.toFixed(1)}</div>
                  </button>
                  <div className="mt-2 font-mono text-[11px] text-mute">
                    7D: {pow.matches} матчей · WR {fmtPct(pow.winRate)} · K/D {pow.kd.toFixed(2)}
                  </div>
                </>
              ) : (
                <div className="mt-3 text-sm text-mute">
                  N/A: нужно минимум {POW_MIN_MATCHES} матча за 7 дней у игрока. Формула в Analytics → Methodology.
                </div>
              )}
            </Card>
          </Reveal>

          <Reveal delay={0.1}>
            <Card className="h-full p-4">
              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-mute">
                <TrendingUp size={14} className="text-accent" /> Biggest ELO gain · {PERIOD_LABEL[period]}
              </div>
              {bestGain ? (
                <button onClick={() => onOpen(bestGain.p.nickname)} className="mt-3 flex w-full items-center gap-3 text-left">
                  <Avatar src={bestGain.p.avatar} name={bestGain.p.name} size={48} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-lg font-semibold">{bestGain.p.name}</div>
                    <div className="truncate font-mono text-xs text-mute">{bestGain.p.nickname}</div>
                  </div>
                  <div className="num text-2xl text-win">{fmtSigned(bestGain.dPeriod.delta)}</div>
                </button>
              ) : (
                <div className="mt-3 text-sm text-mute">
                  {gains.length ? "Прироста ELO за период нет." : "N/A: история ELO накапливается снимками при каждом обновлении. Нужно минимум два снимка."}
                </div>
              )}
              {bestGain?.dPeriod.partial && <div className="mt-2 text-[11px] text-mute">* история снимков короче выбранного периода</div>}
            </Card>
          </Reveal>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <Reveal>
            <Card className="h-full p-4">
              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-mute">
                <Clock size={14} className="text-accent" /> Inactivity radar
              </div>
              {radar.length ? (
                <ul className="mt-3 divide-y divide-line">
                  {radar.map((r) => (
                    <li key={r.p.nickname}>
                      <button onClick={() => onOpen(r.p.nickname)} className="flex min-h-[44px] w-full items-center gap-3 py-2 text-left">
                        <Avatar src={r.p.avatar} name={r.p.name} size={32} />
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {r.p.name} <span className="font-mono text-xs text-mute">{r.p.nickname}</span>
                        </span>
                        <span className="text-right">
                          <span className="num block text-sm">{ago(r.last, now)}</span>
                          <span className="block font-mono text-[10px] text-mute">профиль обновлён {ago(r.p.fetchedAt, now)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-3 text-sm text-mute">Data unavailable</div>
              )}
            </Card>
          </Reveal>

          <Reveal delay={0.05}>
            <Card className="h-full p-4">
              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-mute">
                <AlertTriangle size={14} className="text-accent" /> Activity alerts
              </div>
              {alerts.length ? (
                <ul className="mt-3 space-y-2">
                  {alerts.slice(0, 6).map((a, i) => (
                    <li key={`${a.nickname}-${a.kind}-${i}`} className="flex items-start gap-2 text-sm">
                      <span className={a.level === "warn" ? "mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-accent" : "mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-mute"} />
                      <span>
                        <button onClick={() => onOpen(a.nickname)} className="font-medium hover:text-accent">{a.name}</button>
                        <span className="text-mute"> · {a.text}</span>
                      </span>
                    </li>
                  ))}
                  {alerts.length > 6 && <li className="font-mono text-[11px] text-mute">и ещё {alerts.length - 6}: раздел Analytics</li>}
                </ul>
              ) : (
                <div className="mt-3 text-sm text-mute">
                  {withMatches.length ? "Активных предупреждений нет." : "Data unavailable"}
                </div>
              )}
            </Card>
          </Reveal>
        </div>
      </section>

      {!loading && rows.every((r) => r.p.status === "pending") && !notConfigured && <Empty>Данные ещё не получены.</Empty>}
    </div>
  );
}
