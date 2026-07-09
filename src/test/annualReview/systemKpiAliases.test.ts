import { describe, it, expect } from 'vitest';
import { normalizeSlotName, resolveLibraryKeyByName, SYSTEM_KPI_ALIASES } from '@/lib/annualReview/systemKpiAliases';

describe('systemKpiAliases', () => {
  it('normalizes whitespace and case', () => {
    expect(normalizeSlotName('  Lost   Time  Injury  ')).toBe('lost time injury');
  });

  it('resolves exact Library names to their keys (idempotent aliases)', () => {
    expect(resolveLibraryKeyByName('Lost Time Injury (LTI) Rate')).toBe('lti_rate');
    expect(resolveLibraryKeyByName('Short Time Injury (STI) Rate')).toBe('sti_rate');
    expect(resolveLibraryKeyByName('Departmental Status of 5S')).toBe('s5');
    expect(resolveLibraryKeyByName('Trainings Attended')).toBe('training_attended');
    expect(resolveLibraryKeyByName('Annual Production Target vs Actual')).toBe('annual_production');
    expect(resolveLibraryKeyByName('Annual Preventive Maintenance Target vs Actual')).toBe('annual_pm');
  });

  it('resolves each of the 6 historical template drift names to the correct library key', () => {
    expect(resolveLibraryKeyByName('Short Time Injury(STI) Rate')).toBe('sti_rate');
    expect(resolveLibraryKeyByName('Departmental Status of 5S in AY 25-26   ')).toBe('s5');
    expect(resolveLibraryKeyByName('Traiining Attended in AY 25-26  ')).toBe('training_attended');
    expect(resolveLibraryKeyByName('Unsafe Act Unsafe Condition Near Miss - Reported by self')).toBe('ua_uc_nm');
    expect(resolveLibraryKeyByName('Fugitive PM10/AQI Non Compliance days')).toBe('fugitive_pm10');
    expect(resolveLibraryKeyByName('Annual Maintenance Preventive Maintenance Target vs. Actual')).toBe('annual_pm');
  });

  it('returns null for unknown slot names (does not accidentally over-match)', () => {
    expect(resolveLibraryKeyByName('Some completely unrelated KPI')).toBeNull();
    expect(resolveLibraryKeyByName('')).toBeNull();
  });

  it('alias table has no duplicate right-hand keys that would ambiguously collide on the same normalized left', () => {
    // Left-hand keys are unique by Object semantics; verify no whitespace/casing sneaks past normalizeSlotName.
    for (const k of Object.keys(SYSTEM_KPI_ALIASES)) {
      expect(k).toBe(normalizeSlotName(k));
    }
  });
});