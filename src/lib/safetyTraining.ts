/**
 * Safety Training & SOP — SSOT
 * ----------------------------
 * Statuses, labels, tone hints, and pure helpers for the Phase 3 Training
 * lifecycle. UI MUST import labels from here — never hardcode.
 *
 * Mirrors:
 *  - public.safety_training_status enum
 *  - RPCs: assign_sop_to_role / start_training_attempt /
 *          submit_training_attempt / mark_overdue_training_assignments
 */

export const SAFETY_TRAINING_STATUSES = [
  'pending',
  'in_progress',
  'passed',
  'failed',
  'overdue',
] as const;

export type SafetyTrainingStatus = (typeof SAFETY_TRAINING_STATUSES)[number];

export const SAFETY_TRAINING_STATUS_LABEL: Record<SafetyTrainingStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  passed: 'Passed',
  failed: 'Failed',
  overdue: 'Overdue',
};

export const SAFETY_TRAINING_STATUS_TONE: Record<
  SafetyTrainingStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending: 'outline',
  in_progress: 'secondary',
  passed: 'default',
  failed: 'destructive',
  overdue: 'destructive',
};

/** Terminal statuses — no further attempts allowed. */
export function isTrainingTerminal(s: SafetyTrainingStatus): boolean {
  return s === 'passed' || s === 'overdue';
}

/** Whether the worker can still launch an attempt for this assignment. */
export function canStartAttempt(
  status: SafetyTrainingStatus,
  attemptsCount: number,
  maxAttempts: number,
): boolean {
  if (status === 'passed' || status === 'overdue') return false;
  return attemptsCount < maxAttempts;
}

/** Format remaining time-to-due for a UI badge. */
export function formatDueIn(dueAt: string | null, now: Date = new Date()): string {
  if (!dueAt) return '—';
  const ms = new Date(dueAt).getTime() - now.getTime();
  if (Number.isNaN(ms)) return '—';
  if (ms <= 0) return 'Overdue';
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return `${days}d left`;
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours >= 1) return `${hours}h left`;
  const mins = Math.max(1, Math.floor(ms / (60 * 1000)));
  return `${mins}m left`;
}

/** Pass-mark validator (1–100). */
export function isValidPassThreshold(n: number): boolean {
  return Number.isFinite(n) && n >= 1 && n <= 100 && Math.floor(n) === n;
}

/** Min-read seconds validator (>= 10s, <= 2h). */
export function isValidMinReadSeconds(n: number): boolean {
  return Number.isFinite(n) && n >= 10 && n <= 7200 && Math.floor(n) === n;
}