"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildRows, type Period } from "@/lib/analytics";
import { fmtTime } from "@/lib/format";
import { ROSTER } from "@/lib/players";
import type { TeamPayload } from "@/lib/types";
import Analytics from "./Analytics";
import Leaderboard from "./Leaderboard";
import MatchHistory from "./MatchHistory";
import Overview from "./Overview";
import ProfilePanel from "./ProfilePanel";
import Roster from "./Roster";
import { TABS, blankPlayers, type TabId } from "./shared";
import { cx } from "./ui";

const LS_INTERVAL = "ordax.autoRefreshMin";
const LS_PERIOD = "ordax.period";

function readLS(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLS(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export default function Dashboard() {
  const reduce = useReducedMotion();
  const [data, setData] = useState<TeamPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("overview");
  const [selected, setSelected] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("30d");
  const [intervalMin, setIntervalMin] = useState(0);
  const [now, setNow] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const lastFetch = useRef(0);

  /* clock for relative times */
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  /* restore preferences + hash */
  useEffect(() => {
    const p = readLS(LS_PERIOD);
    if (p === "7d" || p === "30d" || p === "90d" || p === "all") setPeriod(p);
    const i = Number(readLS(LS_INTERVAL));
    if ([5, 15, 30].includes(i)) setIntervalMin(i);

    const applyHash = () => {
      const h = decodeURIComponent(location.hash.replace(/^#/, ""));
      if (h.startsWith("player/")) {
        const nick = h.slice(7);
        if (ROSTER.some((r) => r.nickname === nick)) setSelected(nick);
        return;
      }
      const t = TABS.find(([id]) => id === h);
      if (t) setTab(t[0]);
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  const load = useCallback(async (force: boolean) => {
    setRefreshing(true);
    try {
      const res = await fetch(force ? "/api/team?refresh=1" : "/api/team", { cache: "no-store" });
      if (!res.ok) throw new Error(`Сервер ответил HTTP ${res.status}`);
      const json = (await res.json()) as TeamPayload;
      setData(json);
      setError(null);
      lastFetch.current = Date.now();
      if (force) {
        setToast(
          json.configured
            ? `Обновлено профилей: ${json.ok}, ошибок: ${json.failed}${json.notes.length ? ` · ${json.notes[0]}` : ""}`
            : "API не настроен: нечего обновлять",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить данные");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  /* auto refresh: skipped while the tab is hidden */
  useEffect(() => {
    if (!intervalMin) return;
    const ms = intervalMin * 60_000;
    const tick = () => {
      if (document.visibilityState === "visible") void load(false);
    };
    const id = setInterval(tick, ms);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastFetch.current > ms) void load(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMin, load]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(id);
  }, [toast]);

  const players = useMemo(() => data?.players ?? blankPlayers(), [data]);
  const rows = useMemo(() => buildRows(players, period, now || Date.now()), [players, period, now]);

  const changeTab = (t: TabId) => {
    setTab(t);
    setSelected(null);
    history.replaceState(null, "", `#${t}`);
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };
  const open = (nick: string) => {
    setSelected(nick);
    history.replaceState(null, "", `#player/${encodeURIComponent(nick)}`);
  };
  const close = () => {
    setSelected(null);
    history.replaceState(null, "", `#${tab}`);
  };
  const changePeriod = (p: Period) => {
    setPeriod(p);
    writeLS(LS_PERIOD, p);
  };
  const changeInterval = (m: number) => {
    setIntervalMin(m);
    writeLS(LS_INTERVAL, String(m));
  };

  /* connection status: LIVE/ONLINE only when a fetch is confirmed */
  const age = data?.generatedAt && now ? now - data.generatedAt : null;
  let chip: { label: string; tone: "ok" | "warn" | "bad" | "idle" } = { label: "CONNECTING", tone: "idle" };
  if (error && !data) chip = { label: "SERVER ERROR", tone: "bad" };
  else if (data && !data.configured) chip = { label: "API NOT CONFIGURED", tone: "warn" };
  else if (data && data.ok === 0) chip = { label: "NO DATA", tone: "bad" };
  else if (data && age !== null && age < 60 * 60_000) chip = { label: `ONLINE · ${data.ok}/${data.players.length}`, tone: "ok" };
  else if (data) chip = { label: "STALE", tone: "warn" };

  const view = { data, rows, period, now: now || Date.now(), loading, onOpen: open };

  return (
    <div className="min-h-screen bg-bg text-ink" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <header
        className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 sm:px-6">
          <button onClick={() => changeTab("overview")} className="flex items-baseline gap-2 py-1" aria-label="ORDAX, на главную">
            <span className="font-display text-lg font-bold tracking-[0.16em] text-ink">ORDAX</span>
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-mute sm:inline">/ Team Intelligence</span>
          </button>

          <nav className="order-3 -mx-4 w-[calc(100%+2rem)] overflow-x-auto px-4 [scrollbar-width:none] md:order-none md:mx-0 md:w-auto md:flex-1 md:px-0" aria-label="Разделы">
            <ul className="flex min-w-max gap-1">
              {TABS.map(([id, label]) => (
                <li key={id}>
                  <button
                    onClick={() => changeTab(id)}
                    aria-current={tab === id && !selected ? "page" : undefined}
                    className={cx(
                      "relative min-h-[40px] px-3 font-mono text-xs uppercase tracking-wider transition-colors",
                      tab === id ? "text-accent" : "text-mute hover:text-ink",
                    )}
                  >
                    {label}
                    {tab === id && <span className="absolute inset-x-3 bottom-0 h-[2px] bg-accent" />}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span
              className={cx(
                "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 font-mono text-[10px] uppercase tracking-wider",
                chip.tone === "ok" && "border-win/50 text-win",
                chip.tone === "warn" && "border-accent/50 text-accent",
                chip.tone === "bad" && "border-loss/50 text-loss",
                chip.tone === "idle" && "border-line text-mute",
              )}
              title="Статус подключения к FACEIT Data API"
            >
              <span className={cx("h-1.5 w-1.5 rounded-full", chip.tone === "ok" ? "bg-win" : chip.tone === "bad" ? "bg-loss" : chip.tone === "warn" ? "bg-accent" : "bg-mute")} />
              {chip.label}
            </span>
            <span className="hidden font-mono text-[11px] text-mute lg:inline" title="Последняя успешная синхронизация">
              upd {fmtTime(data?.generatedAt)}
            </span>
            <button
              onClick={() => void load(true)}
              disabled={refreshing}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-md border border-line px-3 font-mono text-xs uppercase tracking-wider text-ink transition-colors hover:border-accent/60 hover:text-accent disabled:opacity-50"
              aria-label="Обновить данные"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="mx-auto mt-4 max-w-[1240px] px-4 sm:px-6">
          <div className="rounded-md border border-loss/40 bg-loss/10 px-4 py-3 text-sm text-ink" role="alert">
            Не удалось получить данные: {error}. {data ? "Показаны последние загруженные данные." : "Нажми Refresh, чтобы повторить."}
          </div>
        </div>
      )}

      <main className="mx-auto max-w-[1240px] px-4 pb-24 pt-6 sm:px-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            {tab === "overview" && (
              <Overview {...view} onPeriod={changePeriod} intervalMin={intervalMin} onInterval={changeInterval} />
            )}
            {tab === "roster" && <Roster {...view} onRefresh={() => load(true)} />}
            {tab === "history" && <MatchHistory {...view} />}
            {tab === "analytics" && <Analytics {...view} />}
            {tab === "leaderboard" && <Leaderboard {...view} onPeriod={changePeriod} />}
          </motion.div>
        </AnimatePresence>

        <footer className="mt-16 border-t border-line pt-6 font-mono text-[11px] leading-relaxed text-mute">
          Источник: FACEIT Data API (CS2). OPI и Player of the Week: внутренние метрики OrdaX, не официальные показатели FACEIT.
          Сайт не связан с FACEIT. {data?.generatedAt ? `Данные получены: ${new Date(data.generatedAt).toLocaleString("ru-RU")}.` : ""}
        </footer>
      </main>

      <AnimatePresence>
        {selected && <ProfilePanel key={selected} nickname={selected} {...view} onClose={close} />}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed left-1/2 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-md border border-accent/40 bg-card px-4 py-3 text-center text-sm text-ink shadow-glow"
            style={{ bottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }}
            role="status"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
