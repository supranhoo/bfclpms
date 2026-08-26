/**
 * ADR-291 — a group definition edit may be applied to the selected month only,
 * or repeated forward into future months of the same fiscal cycle.
 *
 * The console RPC handles exactly ONE period per call, so the span is resolved
 * here into an explicit, ordered month list and the RPC is invoked once per
 * month. Past months are never touched, whatever the mode
 * (POLICY §CONSOLE-GROUP-EDIT-SPAN).
 */
import {
  resolveRolloutTargets, describeTargets, monthIdx, MAX_ROLLOUT_PERIODS,
  type RolloverTarget, type RolloverMonth,
} from '@/lib/rolloverTargets';

export type EditSpanMode = 'this' | 'forward' | 'next_n';

export const EDIT_SPAN_LABELS: Record<EditSpanMode, string> = {
  this: 'This month only',
  forward: 'This and all future months',
  next_n: 'Next N months',
};

export { MAX_ROLLOUT_PERIODS, describeTargets };
export type { RolloverTarget };

/** True when (month, year) is strictly before the calendar month of `today`. */
export function isPastPeriod(target: RolloverTarget, today: Date = new Date()): boolean {
  const nowOrdinal = today.getFullYear() * 12 + today.getMonth();
  return target.year * 12 + monthIdx(target.month) < nowOrdinal;
}

/**
 * ADR-321 — every mode is offered, including from a past anchor. The invariant
 * is not "never write a past month" but "never write a past month the admin did
 * not explicitly select": the anchor is always honoured, implicitly added months
 * are filtered to the current month onwards.
 */
export function spanModesAvailable(_first: RolloverTarget, _today: Date = new Date()): EditSpanMode[] {
  return ['this', 'forward', 'next_n'];
}

/** True when the span will silently skip past months between anchor and today. */
export function spanSkipsPastMonths(
  first: RolloverTarget,
  mode: EditSpanMode,
  today: Date = new Date(),
): boolean {
  return mode !== 'this' && isPastPeriod(first, today);
}

/**
 * Ordered target list for the chosen span: the selected month always, plus the
 * implicit months of the mode with past months removed and the 12-period cap
 * applied.
 */
export function resolveEditSpan(
  first: RolloverTarget,
  mode: EditSpanMode,
  count = 2,
  today: Date = new Date(),
): RolloverTarget[] {
  if (mode === 'this') return [first];
  const targets = mode === 'forward'
    ? resolveRolloutTargets(first, 'rest_of_fy')
    : resolveRolloutTargets(first, 'next_n', count);
  const key = (t: RolloverTarget) => `${t.month}-${t.year}`;
  const kept = targets.filter((t) => key(t) === key(first) || !isPastPeriod(t, today));
  if (!kept.length) return [first];
  const withAnchor = kept.some((t) => key(t) === key(first)) ? kept : [first, ...kept];
  return withAnchor.slice(0, MAX_ROLLOUT_PERIODS);
}


export function describeSpan(targets: RolloverTarget[]): string {
  if (targets.length <= 1) return describeTargets(targets);
  return `${describeTargets(targets)} — ${targets.length} periods`;
}

/* ------------------------------------------------------------------ */
/* Per-month result aggregation                                        */
/* ------------------------------------------------------------------ */

export interface SpanEntry<R> {
  target: { month: string; year: number };
  result: R | null;
  error?: string | null;
}

export interface SpanTotals {
  willWrite: number;
  willSkip: number;
  updated: number;
  monthsWithWork: number;
  monthsFailed: number;
}

interface CountableResult {
  will_write?: number | null;
  will_skip?: number | null;
  updated?: number | null;
}

export function aggregateSpan<R extends CountableResult>(entries: SpanEntry<R>[]): SpanTotals {
  let willWrite = 0, willSkip = 0, updated = 0, monthsWithWork = 0, monthsFailed = 0;
  for (const e of entries) {
    if (e.error) { monthsFailed += 1; continue; }
    const w = Number(e.result?.will_write ?? 0);
    const s = Number(e.result?.will_skip ?? 0);
    const u = Number(e.result?.updated ?? 0);
    willWrite += w; willSkip += s; updated += u;
    if (w > 0 || u > 0) monthsWithWork += 1;
  }
  return { willWrite, willSkip, updated, monthsWithWork, monthsFailed };
}

/** Label shown per row of the preview table. */
export function periodLabel(t: { month: string; year: number }): string {
  return `${t.month} ${t.year}`;
}

export function toTarget(period: string, year: number): RolloverTarget {
  return { month: period as RolloverMonth, year };
}
