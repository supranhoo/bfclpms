/**
 * ADR-296 / POLICY §CONSOLE-FREQUENCY-DUE — single source of truth for
 * "is this console KPI open for data submission in the selected month?".
 *
 * A console KPI row is an aggregate of many employee KPI rows, so it can carry
 * more than one frequency. The row counts as due when ANY underlying frequency
 * is open for the month — hiding a row that some employee must still submit
 * would silently lose work.
 */
import { isKpiLockedForPeriod, getCycleLabel } from '@/lib/frequencyUtils';

export interface KpiDueState {
  /** Open for data submission in the selected month. */
  due: boolean;
  /** Frequency label to show when not due, e.g. "Quarterly". */
  frequency: string | null;
  /** Cycle window label to show when not due, e.g. "Q2 (Apr-Jun)". */
  cycleLabel: string | null;
}

export function resolveKpiDueState(
  frequencies: string[] | null | undefined,
  cycleStarts: string[] | null | undefined,
  period: string,
  year: number,
): KpiDueState {
  const list = (frequencies ?? []).filter(Boolean);
  // No frequency recorded → treat as monthly / always open.
  if (list.length === 0) return { due: true, frequency: null, cycleLabel: null };

  const cycleStart = (cycleStarts ?? []).filter(Boolean)[0] ?? null;
  const due = list.some(f => !isKpiLockedForPeriod(f, period, year, cycleStart));
  if (due) return { due: true, frequency: null, cycleLabel: null };

  const frequency = list[0];
  return {
    due: false,
    frequency,
    cycleLabel: getCycleLabel(frequency, period, year, cycleStart),
  };
}