/**
 * Safety Assets & Calibration — SSOT
 * ----------------------------------
 * Mirrors:
 *   public.safety_asset_status enum
 *   public.record_calibration RPC
 *   public.mark_overdue_assets RPC
 *
 * UI MUST import labels and helpers from here — never hardcode.
 */

export const SAFETY_ASSET_STATUSES = [
  'active',
  'under_maintenance',
  'retired',
] as const;
export type SafetyAssetStatus = (typeof SAFETY_ASSET_STATUSES)[number];

export const SAFETY_ASSET_STATUS_LABEL: Record<SafetyAssetStatus, string> = {
  active: 'Active',
  under_maintenance: 'Under Maintenance',
  retired: 'Retired',
};

export const SAFETY_ASSET_STATUS_TONE: Record<
  SafetyAssetStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  active: 'default',
  under_maintenance: 'secondary',
  retired: 'outline',
};

/** Default categories — admin can free-type any other string. */
export const SAFETY_ASSET_CATEGORY_SUGGESTIONS = [
  'Lifting Equipment',
  'Pressure Vessel',
  'Gas Detector',
  'Fire Extinguisher',
  'Electrical Tool',
  'PPE — Calibrated',
  'Lab Instrument',
  'Safety Harness',
  'Other',
] as const;

export const SAFETY_ASSET_EVIDENCE_KINDS = ['photo', 'manual', 'certificate', 'other'] as const;
export type SafetyAssetEvidenceKind = (typeof SAFETY_ASSET_EVIDENCE_KINDS)[number];

export const SAFETY_ASSET_EVIDENCE_LABEL: Record<SafetyAssetEvidenceKind, string> = {
  photo: 'Photo',
  manual: 'Manual',
  certificate: 'Certificate',
  other: 'Other',
};

/* ─────────────────────────────────────────────────── helpers ─── */

/** Days remaining until calibration expires. Negative = overdue. */
export function daysUntilExpiry(
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - now.getTime();
  return Math.ceil(ms / 86_400_000);
}

/** Calibration urgency bucket used by sweep & UI badges. */
export type CalibrationBucket = 'ok' | 't7' | 't1' | 'overdue';

export function calibrationBucket(
  asset: { calibration_required: boolean; calibration_expires_at: string | null },
  now: Date = new Date(),
): CalibrationBucket {
  if (!asset.calibration_required || !asset.calibration_expires_at) return 'ok';
  const days = daysUntilExpiry(asset.calibration_expires_at, now);
  if (days === null) return 'ok';
  if (days <= 0) return 'overdue';
  if (days <= 1) return 't1';
  if (days <= 7) return 't7';
  return 'ok';
}

export const CALIBRATION_BUCKET_LABEL: Record<CalibrationBucket, string> = {
  ok: 'On track',
  t7: 'Due in 7 days',
  t1: 'Due tomorrow',
  overdue: 'Overdue',
};

export const CALIBRATION_BUCKET_TONE: Record<
  CalibrationBucket,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  ok: 'outline',
  t7: 'secondary',
  t1: 'destructive',
  overdue: 'destructive',
};

/** Pure validator for the new-asset form. Returns null when valid. */
export function validateAssetDraft(input: {
  asset_code: string;
  name: string;
  category: string;
  calibration_required: boolean;
  calibration_interval_days: number | null;
}): string | null {
  if (!input.asset_code.trim()) return 'Asset code is required.';
  if (input.asset_code.trim().length > 64) return 'Asset code is too long (max 64).';
  if (!input.name.trim()) return 'Name is required.';
  if (!input.category.trim()) return 'Category is required.';
  if (input.calibration_required) {
    const days = input.calibration_interval_days;
    if (!days || days <= 0 || days > 3650) {
      return 'Calibration interval must be 1–3650 days when calibration is required.';
    }
  }
  return null;
}

/** Pure validator for record_calibration RPC payload. */
export function validateCalibrationDraft(input: {
  performed_at: string;
  next_due_at: string;
}): string | null {
  if (!input.performed_at) return 'Performed-at date is required.';
  if (!input.next_due_at) return 'Next due date is required.';
  const performed = new Date(input.performed_at).getTime();
  const next = new Date(input.next_due_at).getTime();
  if (Number.isNaN(performed) || Number.isNaN(next)) return 'Invalid dates.';
  if (next <= performed) return 'Next due date must be after the performed-at date.';
  if (performed > Date.now() + 60_000) return 'Performed-at date cannot be in the future.';
  return null;
}

/** Compute next_due_at from performed_at + interval. */
export function computeNextDueAt(performedAtIso: string, intervalDays: number): string {
  const t = new Date(performedAtIso).getTime() + intervalDays * 86_400_000;
  return new Date(t).toISOString();
}