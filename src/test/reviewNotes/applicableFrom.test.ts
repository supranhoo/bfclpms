import { describe, it, expect } from 'vitest';
import { normaliseToFirstOfMonth, nextMonthFirstDay } from '@/services/reviewNotes/reviewNotesService';

describe('Applicable From normalisation', () => {
  it('snaps any day in a month to day=1', () => {
    expect(normaliseToFirstOfMonth('2026-07-15')).toBe('2026-07-01');
    expect(normaliseToFirstOfMonth('2026-12-31')).toBe('2026-12-01');
  });

  it('returns null for empty / invalid input', () => {
    expect(normaliseToFirstOfMonth(null)).toBeNull();
    expect(normaliseToFirstOfMonth(undefined as any)).toBeNull();
    expect(normaliseToFirstOfMonth('')).toBeNull();
    expect(normaliseToFirstOfMonth('not-a-date')).toBeNull();
  });

  it('preserves month already at day=1', () => {
    expect(normaliseToFirstOfMonth('2026-07-01')).toBe('2026-07-01');
  });

  it('nextMonthFirstDay returns first of *next* month', () => {
    // Apr 30 2026 -> May 2026
    expect(nextMonthFirstDay(new Date(2026, 3, 30))).toBe('2026-05-01');
    // Dec 15 2026 -> Jan 2027 (year rollover)
    expect(nextMonthFirstDay(new Date(2026, 11, 15))).toBe('2027-01-01');
    // Jan 1 -> Feb of same year
    expect(nextMonthFirstDay(new Date(2026, 0, 1))).toBe('2026-02-01');
  });
});

describe('ListFilters shape', () => {
  it('accepts optional applicable_from bounds and subject_employee_id', () => {
    const f: import('@/services/reviewNotes/reviewNotesService').ListFilters = {
      subject_employee_id: 'emp-uuid',
      applicable_from_gte: '2026-07-01',
      applicable_from_lte: '2026-09-01',
    };
    expect(f.applicable_from_gte).toBe('2026-07-01');
    expect(f.applicable_from_lte).toBe('2026-09-01');
  });
});