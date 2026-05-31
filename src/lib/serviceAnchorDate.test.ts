import { describe, it, expect } from 'vitest';
import {
  resolveServiceAnchor,
  parseAssessmentYear,
  getAyEndDate,
  getAyStartDate,
  validateCustomAnchor,
} from './serviceAnchorDate';

describe('serviceAnchorDate', () => {
  it('parses AY label', () => {
    expect(parseAssessmentYear('2025-26')).toEqual({ start: 2025, end: 2026 });
  });

  it('returns Jul 1 start and Jun 30 end of fiscal cycle', () => {
    expect(getAyStartDate('2025-26').toISOString().slice(0, 10)).toBe('2025-07-01');
    expect(getAyEndDate('2025-26').toISOString().slice(0, 10)).toBe('2026-06-30');
  });

  it('resolves run_date mode to provided runDate', () => {
    const run = new Date('2026-01-15T00:00:00Z');
    expect(resolveServiceAnchor({ mode: 'run_date', assessmentYear: '2025-26', runDate: run }))
      .toEqual(run);
  });

  it('resolves ay_end mode to AY closing date', () => {
    const d = resolveServiceAnchor({ mode: 'ay_end', assessmentYear: '2025-26' });
    expect(d.toISOString().slice(0, 10)).toBe('2026-06-30');
  });

  it('resolves custom mode to provided date', () => {
    const d = resolveServiceAnchor({
      mode: 'custom',
      assessmentYear: '2025-26',
      date: '2026-03-31',
    });
    expect(d.toISOString().slice(0, 10)).toBe('2026-03-31');
  });

  it('throws when custom mode missing a date', () => {
    expect(() =>
      resolveServiceAnchor({ mode: 'custom', assessmentYear: '2025-26', date: null }),
    ).toThrow();
  });

  it('defaults to run_date when mode is null/undefined', () => {
    const before = Date.now();
    const out = resolveServiceAnchor({ mode: null, assessmentYear: '2025-26' });
    expect(out.getTime()).toBeGreaterThanOrEqual(before);
  });

  describe('validateCustomAnchor', () => {
    it('requires a date', () => {
      expect(validateCustomAnchor(null, '2025-26')).toMatch(/Pick/);
    });
    it('accepts a date inside the AY window', () => {
      expect(validateCustomAnchor(new Date('2026-03-31'), '2025-26')).toBeNull();
    });
    it('rejects dates outside the AY window', () => {
      expect(validateCustomAnchor(new Date('2025-06-30'), '2025-26')).toMatch(/within AY/);
      expect(validateCustomAnchor(new Date('2026-07-01'), '2025-26')).toMatch(/within AY/);
    });
  });
});