import { describe, it, expect } from 'vitest';
import { fyStartFromCycle, fyLabel, KPI_SCALE_MAX } from './fiscalYear';

describe('fiscalYear SSOT', () => {
  it('maps cycle.review_year (= FY end year) to fyStart (= July start year)', () => {
    expect(fyStartFromCycle({ review_year: 2026 })).toBe(2025);
    expect(fyStartFromCycle({ review_year: 2025 })).toBe(2024);
  });

  it('falls back to current FY when cycle is missing', () => {
    const out = fyStartFromCycle(null);
    expect(typeof out).toBe('number');
    expect(out).toBeGreaterThanOrEqual(2024);
  });

  it('renders a human FY label', () => {
    expect(fyLabel(2025)).toBe('FY 2025-26');
    expect(fyLabel(1999)).toBe('FY 1999-00');
  });

  it('pins the KPI scale to 5', () => {
    expect(KPI_SCALE_MAX).toBe(5);
  });
});