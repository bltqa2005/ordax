"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { fmtSigned } from "@/lib/format";
import { PERIODS, PERIOD_LABEL, type Period } from "@/lib/analytics";

export const cx = (...a: Array<string | false | null | undefined>) => a.filter(Boolean).join(" ");

export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.4, delay, ease: [0.2, 0.7, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function Card({ children, className, hover = true }: { children: ReactNode; className?: string; hover?: boolean }) {
  return (
    <div
      className={cx(
        "rounded-md border border-line bg-card transition-[border-color,box-shadow] duration-200",
        hover && "hover:border-accent/40 hover:shadow-glow",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionHead({ kicker, title, right }: { kicker?: string; title: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        {kicker && <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.18em] text-accent">{kicker}</div>}
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h2>
      </div>
      {right}
    </div>
  );
}

export function AnimatedNumber({ value, digits = 0, suffix = "" }: { value: number | null; digits?: number; suffix?: string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState<number | null>(value);
  const from = useRef<number | null>(value);

  useEffect(() => {
    if (value === null || reduce || from.current === null) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 600);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(start + (value - start) * e);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, reduce]);

  if (shown === null) return <span className="num">—</span>;
  return (
    <span className="num">
      {shown.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}
      {suffix}
    </span>
  );
}

export function Skel({ className }: { className?: string }) {
  return <div className={cx("skel", className)} aria-hidden="true" />;
}

export function Stat({
  label,
  hint,
  children,
  loading,
}: {
  label: string;
  hint: string;
  children: ReactNode;
  loading?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-mute">{label}</div>
      <div className="mt-2 font-mono text-3xl font-medium text-ink sm:text-[32px]">
        {loading ? <Skel className="h-8 w-24" /> : children}
      </div>
      <div className="mt-2 text-xs leading-snug text-mute">{hint}</div>
    </Card>
  );
}

export function LevelBadge({ level, size = 36 }: { level: number | null; size?: number }) {
  if (level === null) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full border border-line font-mono text-xs text-mute"
        style={{ width: size, height: size }}
        title="Level недоступен"
      >
        —
      </span>
    );
  }
  const top = level >= 10;
  return (
    <span
      className={cx(
        "inline-flex flex-none items-center justify-center rounded-full border-2 font-mono font-bold",
        top ? "border-accent bg-accent text-bg" : "border-accent/70 text-accent",
      )}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      title={`FACEIT Level ${level}`}
    >
      {level}
    </span>
  );
}

export function Avatar({ src, name, size = 44 }: { src: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initial = name.trim().charAt(0).toUpperCase();
  if (!src || failed) {
    return (
      <span
        className="inline-flex flex-none items-center justify-center rounded-md bg-steel font-display font-semibold text-mute"
        style={{ width: size, height: size }}
        aria-hidden="true"
        title="Аватар FACEIT недоступен"
      >
        {initial}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="flex-none rounded-md bg-steel object-cover"
      style={{ width: size, height: size }}
    />
  );
}

export function Delta({ v, partial }: { v: number | null; partial?: boolean }) {
  if (v === null) return <span className="num text-mute" title="Нет достаточной истории снимков">N/A</span>;
  return (
    <span
      className={cx("num", v > 0 ? "text-win" : v < 0 ? "text-loss" : "text-mute")}
      title={partial ? "История снимков короче выбранного периода" : undefined}
    >
      {fmtSigned(v)}
      {partial && <span className="text-mute">*</span>}
    </span>
  );
}

export function ResultPill({ win }: { win: boolean | null }) {
  if (win === null) return <span className="rounded-sm border border-line px-1.5 py-0.5 font-mono text-[11px] text-mute">—</span>;
  return (
    <span
      className={cx(
        "rounded-sm border px-1.5 py-0.5 font-mono text-[11px] font-bold",
        win ? "border-win/50 text-win" : "border-loss/50 text-loss",
      )}
    >
      {win ? "WIN" : "LOSS"}
    </span>
  );
}

export function Segmented({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div role="tablist" aria-label="Период" className="inline-flex rounded-md border border-line bg-bg2 p-0.5">
      {PERIODS.map((p) => (
        <button
          key={p}
          role="tab"
          aria-selected={value === p}
          onClick={() => onChange(p)}
          className={cx(
            "min-h-[36px] rounded-[5px] px-3 font-mono text-xs transition-colors",
            value === p ? "bg-accent text-bg" : "text-mute hover:text-ink",
          )}
        >
          {PERIOD_LABEL[p]}
        </button>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed border-line px-4 py-8 text-center text-sm text-mute">{children}</div>;
}

export function Btn({
  children,
  onClick,
  href,
  variant = "ghost",
  disabled,
  title,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  variant?: "solid" | "ghost";
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  const cls = cx(
    "inline-flex min-h-[40px] items-center justify-center gap-2 rounded-md border px-3.5 font-mono text-xs uppercase tracking-wider transition-all duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-40",
    variant === "solid"
      ? "border-accent bg-accent text-bg hover:shadow-glow"
      : "border-line text-ink hover:border-accent/60 hover:text-accent",
    className,
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} title={title}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls} title={title}>
      {children}
    </button>
  );
}

export const selectCls =
  "min-h-[40px] rounded-md border border-line bg-bg2 px-3 font-mono text-xs text-ink outline-none focus:border-accent";
export const inputCls =
  "min-h-[40px] w-full rounded-md border border-line bg-bg2 px-3 text-sm text-ink outline-none placeholder:text-mute focus:border-accent";
