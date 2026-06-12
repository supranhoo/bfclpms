import { describe, it, expect } from 'vitest';
import { resolveDateRange } from '@/lib/safetyDateRangePresets';

/** A Friday: 2026-06-12 14:00 local. ISO weekday = 5. */
const NOW = new Date(2026, 5, 12, 14, 0, 0, 0);

describe('safetyDateRangePresets.resolveDateRange', () => {
  it('all → nulls (no filter)', () => {
    expect(resolveDateRange('all', { now: NOW })).toEqual({ from: null, to: null });
  });

  it('today → [00:00, 23:59:59.999] of NOW', () => {
    const r = resolveDateRange('today', { now: NOW });
    expect(r.from).toBe(new Date(2026, 5, 12, 0, 0, 0, 0).toISOString());
    expect(r.to).toBe(new Date(2026, 5, 12, 23, 59, 59, 999).toISOString());
  });

  it('yesterday → previous full day', () => {
    const r = resolveDateRange('yesterday', { now: NOW });
    expect(r.from).toBe(new Date(2026, 5, 11, 0, 0, 0, 0).toISOString());
    expect(r.to).toBe(new Date(2026, 5, 11, 23, 59, 59, 999).toISOString());
  });

  it('this_week → Mon 2026-06-08 .. Sun 2026-06-14', () => {
    const r = resolveDateRange('this_week', { now: NOW });
    expect(r.from).toBe(new Date(2026, 5, 8, 0, 0, 0, 0).toISOString());
    expect(r.to).toBe(new Date(2026, 5, 14, 23, 59, 59, 999).toISOString());
  });

  it('last_week → previous Mon..Sun', () => {
    const r = resolveDateRange('last_week', { now: NOW });
    expect(r.from).toBe(new Date(2026, 5, 1, 0, 0, 0, 0).toISOString());
    expect(r.to).toBe(new Date(2026, 5, 7, 23, 59, 59, 999).toISOString());
  });

  it('this_month → 2026-06-01 .. 2026-06-30', () => {
    const r = resolveDateRange('this_month', { now: NOW });
    expect(r.from).toBe(new Date(2026, 5, 1, 0, 0, 0, 0).toISOString());
    expect(r.to).toBe(new Date(2026, 5, 30, 23, 59, 59, 999).toISOString());
  });

  it('last_month → 2026-05-01 .. 2026-05-31', () => {
    const r = resolveDateRange('last_month', { now: NOW });
    expect(r.from).toBe(new Date(2026, 4, 1, 0, 0, 0, 0).toISOString());
    expect(r.to).toBe(new Date(2026, 4, 31, 23, 59, 59, 999).toISOString());
  });

  it('this_quarter → Q2 2026 (Apr-Jun)', () => {
    const r = resolveDateRange('this_quarter', { now: NOW });
    expect(r.from).toBe(new Date(2026, 3, 1, 0, 0, 0, 0).toISOString());
    expect(r.to).toBe(new Date(2026, 5, 30, 23, 59, 59, 999).toISOString());
  });

  it('last_quarter → Q1 2026 (Jan-Mar)', () => {
    const r = resolveDateRange('last_quarter', { now: NOW });
    expect(r.from).toBe(new Date(2026, 0, 1, 0, 0, 0, 0).toISOString());
    expect(r.to).toBe(new Date(2026, 2, 31, 23, 59, 59, 999).toISOString());
  });

  it('this_year → 2026-01-01 .. 2026-12-31', () => {
    const r = resolveDateRange('this_year', { now: NOW });
    expect(r.from).toBe(new Date(2026, 0, 1, 0, 0, 0, 0).toISOString());
    expect(r.to).toBe(new Date(2026, 11, 31, 23, 59, 59, 999).toISOString());
  });

  it('last_year → 2025-01-01 .. 2025-12-31', () => {
    const r = resolveDateRange('last_year', { now: NOW });
    expect(r.from).toBe(new Date(2025, 0, 1, 0, 0, 0, 0).toISOString());
    expect(r.to).toBe(new Date(2025, 11, 31, 23, 59, 59, 999).toISOString());
  });

  it('custom → uses supplied dates, expanded to whole days', () => {
    const r = resolveDateRange('custom', {
      now: NOW,
      customFrom: '2026-03-15',
      customTo: '2026-03-20',
    });
    expect(r.from).toBe(new Date(2026, 2, 15, 0, 0, 0, 0).toISOString());
    expect(r.to).toBe(new Date(2026, 2, 20, 23, 59, 59, 999).toISOString());
  });

  it('custom with empty bounds → nulls allowed', () => {
    const r = resolveDateRange('custom', { now: NOW });
    expect(r).toEqual({ from: null, to: null });
  });
});