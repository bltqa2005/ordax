"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_THRESHOLDS, type Thresholds } from "@/lib/analytics";

const KEY = "ordax.thresholds";

/** Alert thresholds are a per-device UI preference (stored in localStorage). */
export function useThresholds(): [Thresholds, (t: Thresholds) => void, () => void] {
  const [th, setTh] = useState<Thresholds>(DEFAULT_THRESHOLDS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const o = JSON.parse(raw) as Partial<Thresholds>;
        setTh({ ...DEFAULT_THRESHOLDS, ...o });
      }
    } catch {
      /* ignore */
    }
  }, []);

  const set = useCallback((t: Thresholds) => {
    setTh(t);
    try {
      localStorage.setItem(KEY, JSON.stringify(t));
    } catch {
      /* ignore */
    }
  }, []);

  const reset = useCallback(() => set(DEFAULT_THRESHOLDS), [set]);
  return [th, set, reset];
}
