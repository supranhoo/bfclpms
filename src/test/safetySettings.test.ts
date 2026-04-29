import { describe, it, expect } from 'vitest';
import {
  asNumber,
  asIntArray,
  asComplianceThresholds,
  parseSettingJson,
  formatSettingValue,
  isKnownSettingKey,
  SAFETY_SETTING_DEFAULTS,
} from '@/lib/safetySettings';

describe('safetySettings SSOT (Phase X)', () => {
  it('asNumber falls back when value is not numeric', () => {
    expect(asNumber(7, 1)).toBe(7);
    expect(asNumber('5', 1)).toBe(5);
    expect(asNumber('abc', 9)).toBe(9);
    expect(asNumber(null, 3)).toBe(3);
  });

  it('asIntArray drops non-numerics and returns fallback if empty', () => {
    expect(asIntArray([1, '2', 'x'], [9])).toEqual([1, 2]);
    expect(asIntArray([], [7, 1, 0])).toEqual([7, 1, 0]);
    expect(asIntArray('not-array', [4])).toEqual([4]);
    expect(asIntArray([1.7, 2.9], [])).toEqual([1, 2]);
  });

  it('asComplianceThresholds enforces excellent > good > fair', () => {
    expect(asComplianceThresholds({ excellent: 90, good: 75, fair: 60 })).toEqual({
      excellent: 90, good: 75, fair: 60,
    });
    // Non-monotonic snaps back to defaults
    const bad = asComplianceThresholds({ excellent: 50, good: 80, fair: 70 });
    expect(bad).toEqual(SAFETY_SETTING_DEFAULTS.audit_compliance_thresholds);
    // Out-of-range snaps back too
    const oor = asComplianceThresholds({ excellent: 120, good: 75, fair: 60 });
    expect(oor).toEqual(SAFETY_SETTING_DEFAULTS.audit_compliance_thresholds);
    // Garbage falls back
    expect(asComplianceThresholds(null)).toEqual(
      SAFETY_SETTING_DEFAULTS.audit_compliance_thresholds,
    );
  });

  describe('parseSettingJson', () => {
    it('rejects empty input', () => {
      const r = parseSettingJson('   ');
      expect('error' in r).toBe(true);
    });
    it('parses numbers and arrays', () => {
      expect(parseSettingJson('42')).toEqual({ value: 42 });
      expect(parseSettingJson('[7,1,0]')).toEqual({ value: [7, 1, 0] });
    });
    it('returns error for invalid JSON', () => {
      const r = parseSettingJson('{ not: json }');
      expect('error' in r).toBe(true);
    });
  });

  it('formatSettingValue produces a 2-space indented string', () => {
    expect(formatSettingValue({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it('isKnownSettingKey matches seeded defaults', () => {
    expect(isKnownSettingKey('ptw_expiry_warning_hours')).toBe(true);
    expect(isKnownSettingKey('something_random')).toBe(false);
  });
});