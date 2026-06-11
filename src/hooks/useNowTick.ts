import { useEffect, useState } from 'react';

/**
 * useNowTick
 * ----------
 * Returns a `Date` that updates every `intervalMs` (default 30 s) so
 * time-based readouts (SLA countdowns, "X minutes ago") refresh without
 * touching React Query caches or the network.
 *
 * Auto-pauses while `document.hidden` (tab in background) and immediately
 * tightens to current time when the tab becomes visible again — saves
 * CPU/battery and avoids "stale on resume" UI.
 */
export function useNowTick(intervalMs: number = 30_000): Date {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    if (intervalMs <= 0) return; // disabled — caller doesn't need live updates
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer != null) return;
      timer = setInterval(() => setNow(new Date()), intervalMs);
    };
    const stop = () => {
      if (timer != null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (typeof document === 'undefined') return;
      if (document.hidden) {
        stop();
      } else {
        setNow(new Date());
        start();
      }
    };

    if (typeof document === 'undefined' || !document.hidden) start();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }
    return () => {
      stop();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, [intervalMs]);

  return now;
}