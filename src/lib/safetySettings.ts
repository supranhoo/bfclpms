/**
 * safetySettings SSOT — Cross-cutting Phase X
 * -------------------------------------------
 * Pure helpers that parse/validate values stored in `safety_settings`.
 * Every business variable in the Safety Module should be sourced through
 * here — keep the rest of the codebase free of hardcoded thresholds.
 */

export type SettingValue = unknown;

/** Known setting keys with their defaults (mirror of DB seeds). */
export const SAFETY_SETTING_DEFAULTS = {
  ptw_expiry_warning_hours: 2,
  training_overdue_escalation_days: 3,
  audit_compliance_thresholds: { excellent: 90, good: 75, fair: 60 },
  emergency_ack_window_minutes: 5,
  drill_required_per_year: 4,
  asset_calibration_alert_days: [7, 1, 0],
} as const;

export type SafetySettingKey = keyof typeof SAFETY_SETTING_DEFAULTS;

export function isKnownSettingKey(key: string): key is SafetySettingKey {
  return key in SAFETY_SETTING_DEFAULTS;
}

/** Coerce a raw jsonb value to a number with default fallback. */
export function asNumber(value: SettingValue, fallback: number): number {
  if (value == null) return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Coerce a raw value to an integer array, dropping non-numerics. */
export function asIntArray(value: SettingValue, fallback: number[]): number[] {
  if (!Array.isArray(value)) return fallback;
  const arr = value
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n))
    .map((n) => Math.trunc(n));
  return arr.length ? arr : fallback;
}

/** Audit compliance thresholds with monotonic validation. */
export function asComplianceThresholds(
  value: SettingValue,
): { excellent: number; good: number; fair: number } {
  const fallback = SAFETY_SETTING_DEFAULTS.audit_compliance_thresholds;
  if (!value || typeof value !== 'object') return { ...fallback };
  const v = value as Record<string, unknown>;
  const e = asNumber(v.excellent, fallback.excellent);
  const g = asNumber(v.good, fallback.good);
  const f = asNumber(v.fair, fallback.fair);
  // Enforce excellent > good > fair, else snap back to defaults.
  if (!(e > g && g > f && e <= 100 && f >= 0)) return { ...fallback };
  return { excellent: e, good: g, fair: f };
}

/**
 * Validate a JSON string before saving — returns parsed value or
 * { error } for the UI to surface.
 */
export function parseSettingJson(input: string): { value: unknown } | { error: string } {
  const trimmed = input.trim();
  if (!trimmed) return { error: 'Value cannot be empty.' };
  try {
    return { value: JSON.parse(trimmed) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Format a stored value back to a pretty JSON string for editing. */
export function formatSettingValue(value: unknown): string {
  return JSON.stringify(value, null, 2);
}