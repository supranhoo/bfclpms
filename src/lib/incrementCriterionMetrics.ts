/**
 * Canonical metric keys understood by the increment-calculation engine.
 * Every `increment_eligibility_criteria.criterion_key` MUST resolve to one
 * of these. The admin UI binds the key via a typed dropdown (see
 * IncrementEligibilitySection > CriterionDialog); the edge function also
 * resolves legacy / aliased keys defensively via CRITERION_KEY_ALIASES.
 *
 * Adding a new metric is a 3-step change:
 *   1) add it to CANONICAL_METRIC_KEYS + METRIC_LABELS here,
 *   2) populate the value in compute-increment/index.ts `metrics` map,
 *   3) add it as a column or dynamic_metrics key on `increment_inputs`.
 */
export const CANONICAL_METRIC_KEYS = [
  'absent_days',
  'lwp_days',
  'disciplinary_actions',
  'training_compliance',
] as const;

export type CanonicalMetricKey = (typeof CANONICAL_METRIC_KEYS)[number];

export const METRIC_LABELS: Record<CanonicalMetricKey, string> = {
  absent_days: 'Absent Days',
  lwp_days: 'Leave Without Pay (LWP) Days',
  disciplinary_actions: 'Disciplinary Actions',
  training_compliance: 'Training Compliance',
};

/**
 * Legacy / admin-edited keys that the engine maps to canonical keys.
 * Kept lowercase. Mirror in supabase/functions/compute-increment/index.ts.
 */
export const CRITERION_KEY_ALIASES: Record<string, CanonicalMetricKey> = {
  absent: 'absent_days',
  absent_day: 'absent_days',
  absence: 'absent_days',
  absences: 'absent_days',
  absent_days: 'absent_days',

  lwp: 'lwp_days',
  lwp_day: 'lwp_days',
  leave_without_pay: 'lwp_days',
  lwp_days: 'lwp_days',

  discipline: 'disciplinary_actions',
  discipline_action: 'disciplinary_actions',
  disciplinary: 'disciplinary_actions',
  disciplinary_action: 'disciplinary_actions',
  disciplinary_actions: 'disciplinary_actions',

  training: 'training_compliance',
  training_program: 'training_compliance',
  training_programs: 'training_compliance',
  training_compliance: 'training_compliance',
};

export function resolveCanonicalMetricKey(
  rawKey: string | null | undefined,
): CanonicalMetricKey | null {
  if (!rawKey) return null;
  const k = String(rawKey).trim().toLowerCase();
  return CRITERION_KEY_ALIASES[k] ?? null;
}