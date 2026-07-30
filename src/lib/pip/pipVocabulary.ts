/**
 * ADR-205 / POLICY §PIP-LIFECYCLE-GOVERNANCE
 *
 * Single source of truth for PIP status & outcome wording.
 *
 * POLICY §13 names the lifecycle outcomes "Successful / Partially Successful /
 * Unsuccessful" and the closing states "Completed / Cancelled", while the
 * database enums (`pip_outcome`, `pip_status`) predate that wording. Rather
 * than migrate live enums, the drift is closed here at the display layer and
 * recorded in POLICY. No component may hardcode a status or outcome label.
 */

export type PIPStatus =
  | 'draft'
  | 'pending_hr_approval'
  | 'active'
  | 'extended'
  | 'completed'
  | 'terminated';

export type PIPOutcome = 'improved' | 'not_improved' | 'escalated';
export type PIPMilestoneStatus = 'pending' | 'met' | 'partially_met' | 'not_met';

export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

export const PIP_STATUS_LABELS: Record<PIPStatus, string> = {
  draft: 'Draft',
  pending_hr_approval: 'Pending HR Approval',
  active: 'Active',
  extended: 'Extended',
  completed: 'Completed',
  // POLICY §13.1 vocabulary: the enum value `terminated` *is* "Cancelled".
  terminated: 'Cancelled',
};

export const PIP_STATUS_VARIANTS: Record<PIPStatus, BadgeVariant> = {
  draft: 'outline',
  pending_hr_approval: 'secondary',
  active: 'default',
  extended: 'secondary',
  completed: 'outline',
  terminated: 'destructive',
};

export const PIP_OUTCOME_LABELS: Record<PIPOutcome, string> = {
  improved: 'Successful',
  escalated: 'Partially Successful',
  not_improved: 'Unsuccessful',
};

export const PIP_OUTCOME_DESCRIPTIONS: Record<PIPOutcome, string> = {
  improved: 'Performance recovered to the required standard.',
  escalated: 'Some improvement shown; further monitoring or escalation required.',
  not_improved: 'No meaningful improvement against the agreed success criteria.',
};

export const PIP_OUTCOME_VARIANTS: Record<PIPOutcome, BadgeVariant> = {
  improved: 'default',
  escalated: 'secondary',
  not_improved: 'destructive',
};

export const PIP_MILESTONE_LABELS: Record<PIPMilestoneStatus, string> = {
  pending: 'Pending',
  met: 'Met',
  partially_met: 'Partially Met',
  not_met: 'Not Met',
};

export const PIP_MILESTONE_VARIANTS: Record<PIPMilestoneStatus, BadgeVariant> = {
  pending: 'outline',
  met: 'default',
  partially_met: 'secondary',
  not_met: 'destructive',
};

export const PIP_STATUS_ORDER: PIPStatus[] = [
  'draft',
  'pending_hr_approval',
  'active',
  'extended',
  'completed',
  'terminated',
];

export const PIP_OUTCOME_ORDER: PIPOutcome[] = ['improved', 'escalated', 'not_improved'];

export function pipStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  return PIP_STATUS_LABELS[status as PIPStatus] ?? status;
}

export function pipStatusVariant(status: string | null | undefined): BadgeVariant {
  if (!status) return 'outline';
  return PIP_STATUS_VARIANTS[status as PIPStatus] ?? 'outline';
}

export function pipOutcomeLabel(outcome: string | null | undefined): string {
  if (!outcome) return '—';
  return PIP_OUTCOME_LABELS[outcome as PIPOutcome] ?? outcome;
}

export function pipOutcomeVariant(outcome: string | null | undefined): BadgeVariant {
  if (!outcome) return 'outline';
  return PIP_OUTCOME_VARIANTS[outcome as PIPOutcome] ?? 'outline';
}

export function pipMilestoneLabel(status: string | null | undefined): string {
  if (!status) return '—';
  return PIP_MILESTONE_LABELS[status as PIPMilestoneStatus] ?? status;
}

export function pipMilestoneVariant(status: string | null | undefined): BadgeVariant {
  if (!status) return 'outline';
  return PIP_MILESTONE_VARIANTS[status as PIPMilestoneStatus] ?? 'outline';
}

/** A plan that is no longer running (no further actions permitted). */
export function isPipTerminal(status: string | null | undefined): boolean {
  return status === 'completed' || status === 'terminated';
}
