import { describe, it, expect } from 'vitest';
import {
  SAFETY_ASSET_STATUSES,
  SAFETY_ASSET_STATUS_LABEL,
  SAFETY_ASSET_EVIDENCE_KINDS,
  daysUntilExpiry,
  calibrationBucket,
  validateAssetDraft,
  validateCalibrationDraft,
  computeNextDueAt,
} from '@/lib/safetyAssets';

/**
 * Phase 4 logic tests — pure functions only. Database / RPC behaviour is
 * covered by the migration's own constraints and the record_calibration RPC.
 */

describe('safetyAssets enum integrity', () => {
  it('has labels for every status', () => {
    for (const s of SAFETY_ASSET_STATUSES) {
      expect(SAFETY_ASSET_STATUS_LABEL[s]).toBeTruthy();
    }
  });
  it('matches the DB enum exactly', () => {
    expect([...SAFETY_ASSET_STATUSES]).toEqual([
      'active',
      'under_maintenance',
      'retired',
    ]);
  });
  it('exposes all evidence kinds', () => {
    expect([...SAFETY_ASSET_EVIDENCE_KINDS]).toEqual([
      'photo', 'manual', 'certificate', 'other',
    ]);
  });
});

describe('daysUntilExpiry', () => {
  const now = new Date('2026-01-15T00:00:00Z');
  it('returns null when missing', () => {
    expect(daysUntilExpiry(null, now)).toBeNull();
  });
  it('returns positive days for future', () => {
    expect(daysUntilExpiry('2026-01-22T00:00:00Z', now)).toBe(7);
  });
  it('returns 0 or negative for past', () => {
    expect(daysUntilExpiry('2026-01-10T00:00:00Z', now)).toBe(-5);
  });
});

describe('calibrationBucket', () => {
  const now = new Date('2026-01-15T00:00:00Z');
  const mk = (cal: boolean, exp: string | null) => ({
    calibration_required: cal,
    calibration_expires_at: exp,
  });
  it('is ok when calibration not required', () => {
    expect(calibrationBucket(mk(false, '2020-01-01T00:00:00Z'), now)).toBe('ok');
  });
  it('is ok when no expiry set', () => {
    expect(calibrationBucket(mk(true, null), now)).toBe('ok');
  });
  it('is overdue when past', () => {
    expect(calibrationBucket(mk(true, '2026-01-14T00:00:00Z'), now)).toBe('overdue');
  });
  it('is t1 when within 1 day', () => {
    expect(calibrationBucket(mk(true, '2026-01-15T18:00:00Z'), now)).toBe('t1');
  });
  it('is t7 when within 7 days', () => {
    expect(calibrationBucket(mk(true, '2026-01-20T00:00:00Z'), now)).toBe('t7');
  });
  it('is ok when far in future', () => {
    expect(calibrationBucket(mk(true, '2026-06-01T00:00:00Z'), now)).toBe('ok');
  });
});

describe('validateAssetDraft', () => {
  const base = {
    asset_code: 'CR-001',
    name: 'Crane',
    category: 'Lifting Equipment',
    calibration_required: false,
    calibration_interval_days: null as number | null,
  };
  it('passes a minimal valid draft', () => {
    expect(validateAssetDraft(base)).toBeNull();
  });
  it('requires asset_code', () => {
    expect(validateAssetDraft({ ...base, asset_code: '   ' })).toMatch(/code/i);
  });
  it('requires name', () => {
    expect(validateAssetDraft({ ...base, name: '' })).toMatch(/name/i);
  });
  it('requires interval when calibration is required', () => {
    expect(
      validateAssetDraft({ ...base, calibration_required: true, calibration_interval_days: null }),
    ).toMatch(/interval/i);
  });
  it('rejects out-of-range interval', () => {
    expect(
      validateAssetDraft({ ...base, calibration_required: true, calibration_interval_days: 10000 }),
    ).toMatch(/interval/i);
  });
  it('accepts valid calibration draft', () => {
    expect(
      validateAssetDraft({ ...base, calibration_required: true, calibration_interval_days: 365 }),
    ).toBeNull();
  });
});

describe('validateCalibrationDraft', () => {
  const past = '2026-01-01T10:00:00Z';
  const future = '2027-01-01T10:00:00Z';
  it('rejects missing dates', () => {
    expect(validateCalibrationDraft({ performed_at: '', next_due_at: future })).toMatch(/required/i);
  });
  it('rejects next_due_at <= performed_at', () => {
    expect(validateCalibrationDraft({ performed_at: future, next_due_at: past })).toMatch(/after/i);
  });
  it('rejects performed_at in the future', () => {
    expect(
      validateCalibrationDraft({
        performed_at: new Date(Date.now() + 5 * 60_000).toISOString(),
        next_due_at: new Date(Date.now() + 365 * 86_400_000).toISOString(),
      }),
    ).toMatch(/future/i);
  });
  it('accepts a valid draft', () => {
    expect(
      validateCalibrationDraft({
        performed_at: new Date(Date.now() - 60_000).toISOString(),
        next_due_at: new Date(Date.now() + 365 * 86_400_000).toISOString(),
      }),
    ).toBeNull();
  });
});

describe('computeNextDueAt', () => {
  it('adds the interval in days', () => {
    const performed = '2026-01-01T00:00:00.000Z';
    expect(computeNextDueAt(performed, 30)).toBe('2026-01-31T00:00:00.000Z');
  });
});