/**
 * Safety Permit-to-Work SSOT
 * --------------------------
 * Labels, ordered statuses, role helpers, and pure validators for the PTW
 * lifecycle. UI MUST import labels from here — never hardcode.
 *
 * Mirrors:
 *  - public.safety_permit_status enum
 *  - public.safety_permit_type   enum
 *  - RPCs: submit_permit / decide_permit_level / activate_permit /
 *          suspend_permit / close_permit / expire_overdue_permits
 */

export const SAFETY_PERMIT_STATUSES = [
  'draft',
  'submitted',
  'in_approval',
  'approved',
  'active',
  'suspended',
  'closed',
  'rejected',
  'expired',
] as const;

export type SafetyPermitStatus = (typeof SAFETY_PERMIT_STATUSES)[number];

export const SAFETY_PERMIT_STATUS_LABEL: Record<SafetyPermitStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  in_approval: 'In Approval',
  approved: 'Approved',
  active: 'Active',
  suspended: 'Suspended',
  closed: 'Closed',
  rejected: 'Rejected',
  expired: 'Expired',
};

/** Tone hint for status badges — driven by Tailwind semantic tokens. */
export const SAFETY_PERMIT_STATUS_TONE: Record<
  SafetyPermitStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  draft: 'outline',
  submitted: 'secondary',
  in_approval: 'secondary',
  approved: 'default',
  active: 'default',
  suspended: 'destructive',
  closed: 'outline',
  rejected: 'destructive',
  expired: 'destructive',
};

export const SAFETY_PERMIT_TYPES = [
  'hot_work',
  'confined_space',
  'work_at_height',
  'electrical',
  'excavation',
  'lifting',
  'general',
] as const;

export type SafetyPermitType = (typeof SAFETY_PERMIT_TYPES)[number];

export const SAFETY_PERMIT_TYPE_LABEL: Record<SafetyPermitType, string> = {
  hot_work: 'Hot Work',
  confined_space: 'Confined Space',
  work_at_height: 'Work at Height',
  electrical: 'Electrical',
  excavation: 'Excavation',
  lifting: 'Lifting',
  general: 'General',
};

/**
 * Permit types that REQUIRE a HIRA + LOTO checklist before submission
 * (mirrors `submit_permit()` server-side check).
 */
export const PERMIT_TYPES_REQUIRING_HIRA: readonly SafetyPermitType[] = [
  'hot_work',
  'confined_space',
  'work_at_height',
  'electrical',
  'excavation',
] as const;

export const PERMIT_TYPES_REQUIRING_LOTO: readonly SafetyPermitType[] = [
  'electrical',
  'confined_space',
  'lifting',
] as const;

export function permitNeedsHira(t: SafetyPermitType) {
  return PERMIT_TYPES_REQUIRING_HIRA.includes(t);
}
export function permitNeedsLoto(t: SafetyPermitType) {
  return PERMIT_TYPES_REQUIRING_LOTO.includes(t);
}

/** Statuses where the requester can still edit / withdraw (UI hint only). */
export function isPermitEditable(status: SafetyPermitStatus): boolean {
  return status === 'draft';
}

/** Terminal statuses — no further lifecycle moves. */
export function isPermitTerminal(status: SafetyPermitStatus): boolean {
  return status === 'closed' || status === 'rejected' || status === 'expired';
}

/** Whether a status badge should pulse (active/in-approval are "live"). */
export function isPermitLive(status: SafetyPermitStatus): boolean {
  return status === 'active' || status === 'in_approval' || status === 'submitted';
}

/** Pure date validator — start must be in the future, end > start, span ≤ 30d. */
export function validatePermitWindow(input: {
  startAt: Date | string;
  endAt: Date | string;
  now?: Date;
}): string | null {
  const start = new Date(input.startAt).getTime();
  const end = new Date(input.endAt).getTime();
  const now = (input.now ?? new Date()).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 'Invalid date';
  if (start < now - 60_000) return 'Start time must be in the future';
  if (end <= start) return 'End time must be after start time';
  const span = end - start;
  const max = 30 * 24 * 60 * 60 * 1000;
  if (span > max) return 'Permit window cannot exceed 30 days';
  if (span < 15 * 60 * 1000) return 'Permit window must be at least 15 minutes';
  return null;
}