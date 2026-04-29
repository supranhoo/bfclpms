/**
 * Phase 6 — Safety Emergency Response SSOT
 * ----------------------------------------
 * Mirrors:
 *   public.safety_drill_type
 *   public.safety_drill_status
 *   public.safety_emergency_contact_type
 *   public.start_drill / complete_drill / review_drill RPCs
 *
 * Components MUST import labels, tones, and predicates from here.
 */

export const SAFETY_DRILL_TYPES = [
  'fire',
  'evacuation',
  'spill',
  'medical',
  'chemical',
  'security',
  'earthquake',
  'other',
] as const;
export type SafetyDrillType = (typeof SAFETY_DRILL_TYPES)[number];

export const SAFETY_DRILL_TYPE_LABEL: Record<SafetyDrillType, string> = {
  fire: 'Fire',
  evacuation: 'Evacuation',
  spill: 'Chemical Spill',
  medical: 'Medical',
  chemical: 'Chemical Release',
  security: 'Security',
  earthquake: 'Earthquake',
  other: 'Other',
};

export const SAFETY_DRILL_STATUSES = [
  'scheduled',
  'in_progress',
  'completed',
  'reviewed',
  'cancelled',
] as const;
export type SafetyDrillStatus = (typeof SAFETY_DRILL_STATUSES)[number];

export const SAFETY_DRILL_STATUS_LABEL: Record<SafetyDrillStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  reviewed: 'Reviewed',
  cancelled: 'Cancelled',
};

export const SAFETY_DRILL_STATUS_TONE: Record<
  SafetyDrillStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  scheduled: 'outline',
  in_progress: 'secondary',
  completed: 'secondary',
  reviewed: 'default',
  cancelled: 'destructive',
};

export const SAFETY_EMERGENCY_CONTACT_TYPES = [
  'internal',
  'external_agency',
  'hospital',
  'fire_brigade',
  'police',
  'environmental',
  'other',
] as const;
export type SafetyEmergencyContactType =
  (typeof SAFETY_EMERGENCY_CONTACT_TYPES)[number];

export const SAFETY_EMERGENCY_CONTACT_TYPE_LABEL: Record<
  SafetyEmergencyContactType,
  string
> = {
  internal: 'Internal',
  external_agency: 'External Agency',
  hospital: 'Hospital',
  fire_brigade: 'Fire Brigade',
  police: 'Police',
  environmental: 'Environmental',
  other: 'Other',
};

/* ─────────────────────────────── lifecycle predicates ─── */

export function canStartDrill(status: SafetyDrillStatus): boolean {
  return status === 'scheduled';
}

export function canCompleteDrill(status: SafetyDrillStatus): boolean {
  return status === 'in_progress';
}

export function canReviewDrill(status: SafetyDrillStatus): boolean {
  return status === 'completed';
}

export function isTerminalDrillStatus(status: SafetyDrillStatus): boolean {
  return status === 'reviewed' || status === 'cancelled';
}

/* ─────────────────────────────── musters & scoring ─── */

export interface MusterPair {
  accounted_for: boolean;
}

/** Returns a percentage (0-100) of accounted-for participants. */
export function musterRate(pairs: MusterPair[]): number {
  if (pairs.length === 0) return 0;
  const ok = pairs.filter((p) => p.accounted_for).length;
  return Math.round((ok / pairs.length) * 10000) / 100;
}

/** Format evacuation seconds as `m:ss` for UI display. */
export function formatEvacuationDuration(seconds: number | null): string {
  if (seconds === null || seconds < 0 || Number.isNaN(seconds)) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/* ─────────────────────────────── validators ─── */

export interface DrillDraft {
  drill_code: string;
  type: SafetyDrillType;
  scenario: string;
  scheduled_at: string; // ISO
}

export function validateDrillDraft(d: Partial<DrillDraft>): string | null {
  if (!d.drill_code || !d.drill_code.trim()) return 'Drill code is required.';
  if (!d.type) return 'Drill type is required.';
  if (!d.scenario || !d.scenario.trim()) return 'Scenario is required.';
  if (!d.scheduled_at) return 'Schedule date/time is required.';
  return null;
}

export interface ContactDraft {
  name: string;
  phone_primary: string;
  contact_type: SafetyEmergencyContactType;
}

export function validateContactDraft(d: Partial<ContactDraft>): string | null {
  if (!d.name || !d.name.trim()) return 'Name is required.';
  if (!d.phone_primary || !d.phone_primary.trim())
    return 'Primary phone is required.';
  if (!d.contact_type) return 'Contact type is required.';
  return null;
}
