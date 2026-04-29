import { describe, it, expect } from 'vitest';
import { buildCycleScopeLabel } from '@/lib/frequencyUtils';

describe('buildCycleScopeLabel', () => {
  it('Quarterly Apr 2026 → cycle [Apr, May, Jun] anchor Jun 2026', () => {
    const r = buildCycleScopeLabel('Quarterly', 'April', 2026, null);
    expect(r.isMultiMonth).toBe(true);
    expect(r.cycleMonths).toEqual(['April', 'May', 'June']);
    expect(r.anchorMonth).toBe('June');
    expect(r.anchorYear).toBe(2026);
    expect(r.wrapsYear).toBe(false);
  });

  it('Bi-Monthly March 2026 → pair [Mar, Apr] anchor Apr', () => {
    const r = buildCycleScopeLabel('Bi-Monthly', 'March', 2026, null);
    expect(r.isMultiMonth).toBe(true);
    expect(r.cycleMonths).toEqual(['March', 'April']);
    expect(r.anchorMonth).toBe('April');
    expect(r.wrapsYear).toBe(false);
  });

  it('Half-Yearly September 2026 → Jul–Dec anchor December', () => {
    const r = buildCycleScopeLabel('Half-Yearly', 'September', 2026, null);
    expect(r.cycleMonths).toEqual(['July', 'August', 'September', 'October', 'November', 'December']);
    expect(r.anchorMonth).toBe('December');
    expect(r.anchorYear).toBe(2026);
  });

  it('Yearly Sep 2026 with Jul-Jun cycle start → anchor June (next FY)', () => {
    const r = buildCycleScopeLabel('Yearly', 'September', 2026, 'Jul-Jun');
    expect(r.isMultiMonth).toBe(true);
    expect(r.anchorMonth).toBe('June');
  });

  it('Monthly is NOT multi-month', () => {
    const r = buildCycleScopeLabel('Monthly', 'April', 2026, null);
    expect(r.isMultiMonth).toBe(false);
    expect(r.cycleMonths).toEqual(['April']);
    expect(r.anchorMonth).toBe('April');
    expect(r.wrapsYear).toBe(false);
  });

  it('Daily is NOT multi-month', () => {
    const r = buildCycleScopeLabel('Daily', 'April', 2026, null);
    expect(r.isMultiMonth).toBe(false);
  });

  it('Returns valid output for null frequency (defensive)', () => {
    const r = buildCycleScopeLabel(null, 'April', 2026, null);
    expect(r.isMultiMonth).toBe(false);
    expect(r.anchorMonth).toBe('April');
  });
});
