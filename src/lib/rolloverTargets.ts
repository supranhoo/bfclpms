/**
 * ADR-248 — SSOT for resolving a multi-month KRA rollout target list.
 *
 * The rollover edge function only ever handles ONE target period per call.
 * The UI orchestrates repeats by resolving a "repeat mode" into an explicit,
 * ordered list of (month, year) targets and invoking the function once per
 * target. Keeping the resolution pure makes it testable and prevents ad-hoc
 * month arithmetic (POLICY §KRA-MULTI-MONTH-ROLLOUT).
 */

export const ROLLOVER_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export type RolloverMonth = typeof ROLLOVER_MONTHS[number];

export interface RolloverTarget {
  month: RolloverMonth;
  year: number;
}

export type RepeatMode = 'single' | 'next_n' | 'rest_of_fy' | 'full_fy';

/** Hard cap on how many periods a single rollout run may create. */
export const MAX_ROLLOUT_PERIODS = 12;

/** Fiscal cycle is July → June (project standard). */
export const FISCAL_START_MONTH_IDX = 6; // July

export function monthIdx(month: string): number {
  const i = (ROLLOVER_MONTHS as readonly string[]).indexOf(month);
  if (i < 0) throw new Error(`Unknown month: ${month}`);
  return i;
}

function fromOrdinal(ordinal: number): RolloverTarget {
  return { month: ROLLOVER_MONTHS[((ordinal % 12) + 12) % 12], year: Math.floor(ordinal / 12) };
}

function toOrdinal(t: RolloverTarget): number {
  return t.year * 12 + monthIdx(t.month);
}

/** July-start fiscal year containing the given target (e.g. Feb 2027 → 2026). */
export function fiscalYearStartOf(target: RolloverTarget): number {
  return monthIdx(target.month) >= FISCAL_START_MONTH_IDX ? target.year : target.year - 1;
}

/**
 * Resolves the repeat mode into an ordered, de-duplicated list of targets,
 * always starting at `first`. Never returns more than MAX_ROLLOUT_PERIODS.
 */
export function resolveRolloutTargets(
  first: RolloverTarget,
  mode: RepeatMode,
  count = 1,
): RolloverTarget[] {
  const start = toOrdinal(first);
  let end: number;

  switch (mode) {
    case 'single':
      end = start;
      break;
    case 'next_n': {
      const n = Math.max(1, Math.min(MAX_ROLLOUT_PERIODS, Math.floor(count) || 1));
      end = start + n - 1;
      break;
    }
    case 'rest_of_fy': {
      const fyStart = fiscalYearStartOf(first);
      end = (fyStart + 1) * 12 + 5; // June of fyStart + 1
      break;
    }
    case 'full_fy': {
      const fyStart = fiscalYearStartOf(first);
      const fyFirst = fyStart * 12 + FISCAL_START_MONTH_IDX;
      const fyLast = (fyStart + 1) * 12 + 5;
      // Never roll backwards into periods before the chosen target.
      return enumerate(Math.max(start, fyFirst), fyLast);
    }
  }

  return enumerate(start, end);
}

function enumerate(startOrdinal: number, endOrdinal: number): RolloverTarget[] {
  if (endOrdinal < startOrdinal) return [];
  const capped = Math.min(endOrdinal, startOrdinal + MAX_ROLLOUT_PERIODS - 1);
  const out: RolloverTarget[] = [];
  for (let o = startOrdinal; o <= capped; o++) out.push(fromOrdinal(o));
  return out;
}

/** "Aug, Sep, Oct 2026" style compact label (groups by year). */
export function describeTargets(targets: RolloverTarget[]): string {
  if (targets.length === 0) return 'No periods';
  const byYear = new Map<number, string[]>();
  for (const t of targets) {
    const list = byYear.get(t.year) ?? [];
    list.push(t.month.slice(0, 3));
    byYear.set(t.year, list);
  }
  return Array.from(byYear.entries())
    .map(([year, months]) => `${months.join(', ')} ${year}`)
    .join(' · ');
}
