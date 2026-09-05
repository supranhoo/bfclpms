import { format, subMonths } from 'date-fns';

/**
 * ADR-362 — Previous-month period default.
 *
 * Data-entry surfaces (Team Reviews, Org KPI Data Entry) default to the
 * PREVIOUS calendar month because teams always enter data for the month
 * just ended. Handles the January → December-of-prior-year rollover.
 *
 * Report/audit surfaces intentionally keep current-month defaults.
 */
export function getPreviousMonthPeriod(date: Date = new Date()): { month: string; year: number } {
  const prev = subMonths(date, 1);
  return { month: format(prev, 'MMMM'), year: prev.getFullYear() };
}
