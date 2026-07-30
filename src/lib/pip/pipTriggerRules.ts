/**
 * ADR-207 / POLICY §PIP-TRIGGER-SUGGESTIONS
 *
 * Single source of truth for the *objective* PIP triggers described in the
 * BFCL PMS Policy §15, plus the duration / cadence guardrails of §15.7.
 *
 * Nothing in this module writes data — the triggers are advisory. A human
 * always initiates the plan (§15.5).
 */
import { isPipCandidate } from './pipCandidateRule';

/** POLICY §15.2 / §15.3 reference value on the 5-point rating scale. */
export const POLICY_PIP_RATING = 2;

/** POLICY §15.2 — "continues below 2 into the third consecutive month". */
export const POLICY_CONSECUTIVE_MONTHS = 3;

export type PIPTriggerSource = 'monthly_trend' | 'annual_rating' | 'manual';

export interface MonthlyTriggerInput {
  monthlyScores: Record<string, number | null | undefined>;
}

export interface MonthlyTriggerResult {
  qualifies: boolean;
  /** Per-month evidence in range order (null when the month has no score). */
  months: { key: string; score: number | null }[];
  worstScore: number | null;
  /** True when the range is shorter than the policy's consecutive-month rule. */
  shortWindow: boolean;
}

/**
 * POLICY §15.2 — strictly below the threshold in EVERY month of the window.
 * A missing month disqualifies (an incomplete picture is never failure).
 */
export function evaluateMonthlyTrigger(
  employee: MonthlyTriggerInput,
  monthKeys: string[],
  threshold: number | null | undefined,
): MonthlyTriggerResult {
  const months = (monthKeys ?? []).map(key => {
    const raw = employee.monthlyScores?.[key];
    return { key, score: typeof raw === 'number' && Number.isFinite(raw) ? raw : null };
  });
  const present = months.filter(m => m.score != null).map(m => m.score as number);
  return {
    qualifies: isPipCandidate(employee, monthKeys ?? [], threshold),
    months,
    worstScore: present.length ? Math.min(...present) : null,
    shortWindow: (monthKeys?.length ?? 0) < POLICY_CONSECUTIVE_MONTHS,
  };
}

export interface AnnualTriggerResult {
  qualifies: boolean;
  rating: number | null;
}

/**
 * POLICY §15.3 — an annual rating **at or below** the threshold qualifies.
 * Note the deliberate `<=` here versus the strict `<` of the monthly rule;
 * the policy wording differs ("is 2 (Needs Improvement) or below").
 */
export function evaluateAnnualTrigger(
  rating: number | null | undefined,
  threshold: number | null | undefined,
): AnnualTriggerResult {
  if (rating == null || !Number.isFinite(rating)) return { qualifies: false, rating: null };
  if (threshold == null || !Number.isFinite(threshold)) return { qualifies: false, rating };
  return { qualifies: rating <= threshold, rating };
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

/** Policy-worded reason text used to prefill the PIP form (§15.6 evidence). */
export function resolveTriggerReason(input: {
  threshold: number;
  monthly?: MonthlyTriggerResult | null;
  annual?: AnnualTriggerResult | null;
  monthLabels?: Record<string, string>;
}): string {
  const parts: string[] = [];
  if (input.monthly?.qualifies) {
    const detail = input.monthly.months
      .map(m => `${input.monthLabels?.[m.key] ?? m.key} ${m.score == null ? '—' : fmt(m.score)}`)
      .join(', ');
    parts.push(
      `Monthly performance rating below ${fmt(input.threshold)} for ${input.monthly.months.length} consecutive month(s) (${detail}) — POLICY §15.2.`,
    );
  }
  if (input.annual?.qualifies && input.annual.rating != null) {
    parts.push(
      `Final annual rating ${fmt(input.annual.rating)} is at or below ${fmt(input.threshold)} — POLICY §15.3.`,
    );
  }
  return parts.join(' ');
}

/** Statuses that mean a plan is still running (§15.7 — no overlapping PIPs). */
export const LIVE_PIP_STATUSES = ['draft', 'pending_hr_approval', 'active', 'extended'] as const;

export type CandidateState = 'eligible' | 'live_pip' | 'relapse_window';

export interface ExistingPipLike {
  id: string;
  employee_id: string;
  status: string;
  end_date: string;
  extended_end_date?: string | null;
  monitoring_until?: string | null;
}

export interface CandidateClassification {
  state: CandidateState;
  pipId?: string;
  /** Human-readable explanation shown in the suggestions grid. */
  note?: string;
}

function addMonths(iso: string, months: number): Date {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * POLICY §15.7 (no overlap) and §15.12 (3-month sustain window).
 * `monitorMonths` is configurable — never hardcode it at a call site.
 */
export function classifyCandidate(
  employeeId: string,
  existingPips: ExistingPipLike[],
  monitorMonths: number,
  today: Date = new Date(),
): CandidateClassification {
  const mine = (existingPips ?? []).filter(p => p.employee_id === employeeId);

  const live = mine.find(p => (LIVE_PIP_STATUSES as readonly string[]).includes(p.status));
  if (live) {
    return { state: 'live_pip', pipId: live.id, note: 'A live plan already exists for this employee.' };
  }

  const relapse = mine.find(p => {
    if (p.status !== 'completed') return false;
    const until = p.monitoring_until
      ? new Date(p.monitoring_until)
      : addMonths(p.extended_end_date || p.end_date, monitorMonths);
    return until.getTime() >= today.getTime();
  });
  if (relapse) {
    return {
      state: 'relapse_window',
      pipId: relapse.id,
      note: 'Inside the post-PIP sustain window — review for reopen or escalation (POLICY §15.12).',
    };
  }

  return { state: 'eligible' };
}

// ---------------------------------------------------------------------------
// POLICY §15.7 — duration and checkpoint cadence guardrails
// ---------------------------------------------------------------------------

export const DAY_MS = 24 * 60 * 60 * 1000;

export function durationInDays(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

export interface DurationBounds {
  minDays: number;
  maxDays: number;
}

export function validatePipDuration(
  start: Date,
  end: Date,
  bounds: DurationBounds,
): { valid: boolean; days: number; message?: string } {
  const days = durationInDays(start, end);
  if (days < bounds.minDays) {
    return { valid: false, days, message: `A PIP must run for at least ${bounds.minDays} days (POLICY §15.7).` };
  }
  if (days > bounds.maxDays) {
    return { valid: false, days, message: `A PIP may not exceed ${bounds.maxDays} days (POLICY §15.7).` };
  }
  return { valid: true, days };
}

/**
 * POLICY §15.7 — checkpoints at least fortnightly or monthly, and no
 * checkpoint may fall outside the plan window.
 */
export function validateMilestoneCadence(
  dates: Date[],
  start: Date,
  end: Date,
  maxGapDays = 31,
): { valid: boolean; message?: string } {
  if (!dates || dates.length === 0) {
    return { valid: false, message: 'Add at least one review checkpoint (POLICY §15.7).' };
  }
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  if (sorted[0].getTime() < start.getTime()) {
    return { valid: false, message: 'A checkpoint cannot fall before the plan start date.' };
  }
  if (sorted[sorted.length - 1].getTime() > end.getTime()) {
    return { valid: false, message: 'The final checkpoint must fall on or before the plan end date.' };
  }
  let prev = start;
  for (const d of sorted) {
    if (durationInDays(prev, d) > maxGapDays) {
      return {
        valid: false,
        message: `Checkpoints must be at most ${maxGapDays} days apart (POLICY §15.7).`,
      };
    }
    prev = d;
  }
  if (durationInDays(prev, end) > maxGapDays) {
    return { valid: false, message: `Add a checkpoint within ${maxGapDays} days of the end date (POLICY §15.7).` };
  }
  return { valid: true };
}