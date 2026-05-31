/**
 * Service-anchor date resolver for General Eligibility.
 * Single source of truth used by both the UI preview and the
 * compute-increment edge function so tenure math is deterministic.
 */

export type ServiceAsOnMode = 'run_date' | 'ay_end' | 'custom';

export interface ResolveServiceAnchorInput {
  mode: ServiceAsOnMode | null | undefined;
  date?: string | Date | null; // required when mode === 'custom'
  assessmentYear: string;      // e.g. "2025-26" (Jul–Jun fiscal cycle)
  runDate?: Date;              // defaults to now
}

/** Parse "YYYY-YY" → { start: YYYY, end: YYYY+1 }. */
export function parseAssessmentYear(ay: string): { start: number; end: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(ay.trim());
  if (!m) throw new Error(`Invalid assessment year: ${ay}`);
  const start = Number(m[1]);
  const end = start + 1;
  return { start, end };
}

/** Last day of the AY (Jun 30 of the closing year). */
export function getAyEndDate(ay: string): Date {
  const { end } = parseAssessmentYear(ay);
  return new Date(Date.UTC(end, 5, 30)); // June = month 5
}

/** First day of the AY (Jul 1 of the starting year). */
export function getAyStartDate(ay: string): Date {
  const { start } = parseAssessmentYear(ay);
  return new Date(Date.UTC(start, 6, 1)); // July = month 6
}

export function resolveServiceAnchor(input: ResolveServiceAnchorInput): Date {
  const mode = input.mode ?? 'run_date';
  if (mode === 'ay_end') return getAyEndDate(input.assessmentYear);
  if (mode === 'custom') {
    if (!input.date) throw new Error('Custom service-anchor mode requires a date');
    return input.date instanceof Date ? input.date : new Date(input.date);
  }
  return input.runDate ?? new Date();
}

/** Returns null if valid, otherwise a human-readable error. */
export function validateCustomAnchor(date: Date | null | undefined, ay: string): string | null {
  if (!date) return 'Pick a custom date';
  const start = getAyStartDate(ay);
  const end = getAyEndDate(ay);
  const t = date.getTime();
  if (Number.isNaN(t)) return 'Invalid date';
  if (t < start.getTime() || t > end.getTime()) {
    return `Date must be within AY ${ay} (${start.toISOString().slice(0,10)} – ${end.toISOString().slice(0,10)})`;
  }
  return null;
}