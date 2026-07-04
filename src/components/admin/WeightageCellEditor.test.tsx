import { describe, it, expect } from 'vitest';
import { computeTargetKpiIds } from './WeightageCellEditor';

// Freeze "today" at 2026-07-04.
const today = new Date('2026-07-04T00:00:00Z');

// FY 2026-27: kpiIds for Jul-Dec 2026 (all in future/current).
const fy2627 = {
  kpiIds: {
    July: 'jul26', August: 'aug26', September: 'sep26',
    October: 'oct26', November: 'nov26', December: 'dec26',
  } as Record<string, string>,
  years: {
    July: 2026, August: 2026, September: 2026,
    October: 2026, November: 2026, December: 2026,
  } as Record<string, number>,
};

// FY 2025-26: kpiIds for Sep-Dec 2025 + Jan-Jun 2026 (all in the past).
const fy2526 = {
  kpiIds: {
    September: 'sep25', October: 'oct25', November: 'nov25', December: 'dec25',
    January: 'jan26', February: 'feb26', March: 'mar26', April: 'apr26',
    May: 'may26', June: 'jun26',
  } as Record<string, string>,
  years: {
    September: 2025, October: 2025, November: 2025, December: 2025,
    January: 2026, February: 2026, March: 2026, April: 2026,
    May: 2026, June: 2026,
  } as Record<string, number>,
};

describe('WeightageCellEditor.computeTargetKpiIds — calendar-time gating', () => {
  it('forward, FY 2026-27, click July → Jul-Dec 2026 (6 rows)', () => {
    const ids = computeTargetKpiIds('forward', 'July', fy2627.kpiIds, fy2627.years, today);
    expect(ids).toEqual(['jul26', 'aug26', 'sep26', 'oct26', 'nov26', 'dec26']);
  });

  it('forward, FY 2026-27, click September → Sep-Dec 2026 only', () => {
    const ids = computeTargetKpiIds('forward', 'September', fy2627.kpiIds, fy2627.years, today);
    expect(ids).toEqual(['sep26', 'oct26', 'nov26', 'dec26']);
  });

  it('forward, FY 2025-26, click July → zero rows (all past)', () => {
    const ids = computeTargetKpiIds('forward', 'July', fy2526.kpiIds, fy2526.years, today);
    expect(ids).toEqual([]);
  });

  it('all, FY 2025-26 → zero rows (all past)', () => {
    const ids = computeTargetKpiIds('all', 'July', fy2526.kpiIds, fy2526.years, today);
    expect(ids).toEqual([]);
  });

  it('all, FY 2026-27 → Jul-Dec 2026 (6 rows)', () => {
    const ids = computeTargetKpiIds('all', 'July', fy2627.kpiIds, fy2627.years, today);
    expect(ids).toEqual(['jul26', 'aug26', 'sep26', 'oct26', 'nov26', 'dec26']);
  });

  it('this scope always picks the clicked month, even in the past', () => {
    const ids = computeTargetKpiIds('this', 'January', fy2526.kpiIds, fy2526.years, today);
    expect(ids).toEqual(['jan26']);
  });

  it('regression — Anil Pathak: forward from "July" in FY 2025-26 view no longer sweeps Jan-Jun 2026', () => {
    const ids = computeTargetKpiIds('forward', 'July', fy2526.kpiIds, fy2526.years, today);
    // The past bug produced ["sep25","oct25","nov25","dec25","jan26",…,"jun26"].
    // The fix produces [].
    expect(ids).not.toContain('jan26');
    expect(ids).not.toContain('jun26');
  });
});
