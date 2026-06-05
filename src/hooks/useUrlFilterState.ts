import { useCallback } from 'react';
import { useSearchParams, type SetURLSearchParams } from 'react-router-dom';

/**
 * URL-write coalescer (module-scoped).
 * ------------------------------------
 * Why this exists: iOS Safari throttles `history.replaceState()` at
 * 100 calls / 10 s and throws once exceeded. Our dashboard has 10+
 * `useUrlFilterState*` hooks plus several effects that all write the
 * URL; on iPhone this could exceed the cap and crash the page.
 *
 * Two protections, both 100% behaviour-preserving:
 *  1. No-op guard at each call site — skip the write if the resulting
 *     URLSearchParams string is byte-identical to the current one.
 *  2. Microtask coalescer — multiple synchronous setter calls in the
 *     same tick are composed into a single `setSearchParams` (one
 *     `replaceState`). A rolling 60-writes / 10 s rate-limit defers
 *     further flushes to the next animation frame as a hard safety net.
 *
 * Public API of useUrlFilterState / useUrlFilterStateNullable /
 * useClearAllFilters is UNCHANGED.
 */
type Mutator = (prev: URLSearchParams) => URLSearchParams;

const pendingMutators: Mutator[] = [];
let flushScheduled = false;
let latestSetSearchParams: SetURLSearchParams | null = null;
const writeTimestamps: number[] = [];
const MAX_WRITES_PER_WINDOW = 60;
const WINDOW_MS = 10_000;

function pruneWindow(now: number) {
  while (writeTimestamps.length && now - writeTimestamps[0] > WINDOW_MS) {
    writeTimestamps.shift();
  }
}

function performFlush() {
  flushScheduled = false;
  if (!latestSetSearchParams || pendingMutators.length === 0) {
    pendingMutators.length = 0;
    return;
  }
  const now = Date.now();
  pruneWindow(now);
  if (writeTimestamps.length >= MAX_WRITES_PER_WINDOW) {
    // iOS safety net: defer to next frame and re-merge any new arrivals.
    flushScheduled = true;
    const raf =
      typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame
        : (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16) as unknown as number;
    raf(() => performFlush());
    return;
  }
  const batch = pendingMutators.splice(0, pendingMutators.length);
  const composed: Mutator = (prev) => batch.reduce((acc, m) => m(acc), prev);
  const setter = latestSetSearchParams;
  writeTimestamps.push(now);
  setter(composed, { replace: true });
}

function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(performFlush);
  } else {
    Promise.resolve().then(performFlush);
  }
}

function enqueueUrlWrite(setter: SetURLSearchParams, mutator: Mutator) {
  latestSetSearchParams = setter;
  pendingMutators.push(mutator);
  scheduleFlush();
}

/** Test-only: reset internal queue between tests. */
export function __resetUrlWriteCoalescerForTests() {
  pendingMutators.length = 0;
  writeTimestamps.length = 0;
  flushScheduled = false;
  latestSetSearchParams = null;
}

/**
 * A useState-like hook that syncs a filter value with a URL search parameter.
 * Returns [value, setValue] matching the useState API.
 * When value is null/empty, the param is removed from the URL.
 */
export function useUrlFilterState(
  paramName: string,
  defaultValue: string = ''
): [string, (val: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const value = searchParams.get(paramName) ?? defaultValue;

  const setValue = useCallback(
    (newValue: string) => {
      // No-op guard: compare against the current URL value to avoid an
      // unnecessary replaceState (the dominant source of iOS spam).
      const currentRaw = searchParams.get(paramName);
      const wantDelete = !newValue || newValue === defaultValue;
      if (wantDelete && currentRaw === null) return;
      if (!wantDelete && currentRaw === newValue) return;
      enqueueUrlWrite(setSearchParams, (prev) => {
        const next = new URLSearchParams(prev);
        if (wantDelete) {
          next.delete(paramName);
        } else {
          next.set(paramName, newValue);
        }
        return next;
      });
    },
    [paramName, defaultValue, setSearchParams, searchParams]
  );

  return [value, setValue];
}

/**
 * Nullable variant for filters that use string | null.
 */
export function useUrlFilterStateNullable(
  paramName: string
): [string | null, (val: string | null) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const value = searchParams.get(paramName);

  const setValue = useCallback(
    (newValue: string | null) => {
      const currentRaw = searchParams.get(paramName);
      const wantDelete = newValue === null || newValue === '';
      if (wantDelete && currentRaw === null) return;
      if (!wantDelete && currentRaw === newValue) return;
      enqueueUrlWrite(setSearchParams, (prev) => {
        const next = new URLSearchParams(prev);
        if (wantDelete) {
          next.delete(paramName);
        } else {
          next.set(paramName, newValue as string);
        }
        return next;
      });
    },
    [paramName, setSearchParams, searchParams]
  );

  return [value, setValue];
}

/**
 * Clear all filter-related URL params at once (used by "Clear All" buttons).
 */
export const FILTER_PARAM_NAMES = ['q', 'dept', 'desig', 'grade', 'mgr', 'status', 'auditor', 'page', 'size', 'emp_status'] as const;

export function useClearAllFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  return useCallback(() => {
    // No-op guard: skip if none of the filter params are currently set.
    const hasAny = FILTER_PARAM_NAMES.some((p) => searchParams.get(p) !== null);
    if (!hasAny) return;
    enqueueUrlWrite(setSearchParams, (prev) => {
      const next = new URLSearchParams(prev);
      FILTER_PARAM_NAMES.forEach((p) => next.delete(p));
      return next;
    });
  }, [setSearchParams, searchParams]);
}
