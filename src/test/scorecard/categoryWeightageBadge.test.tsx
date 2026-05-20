import { describe, it, expect } from 'vitest';

/**
 * Pure logic test for the "Performance by Category" weightage badge.
 * The badge displays the rounded sum of ALL ASSIGNED KPI weightages for the
 * period — independent of `is_na`, frequency cycle, and scoring status. It is
 * a structural KRA-mapping integrity check (should equal 100%). Quarterly /
 * annual KPIs auto-N/A'd in a non-cycle-end month still count toward the total.
 * Green at 100%, amber otherwise.
 */

interface KpiLite { weightage: number; isNa?: boolean; scored?: boolean }

function assignedWeight(kpis: KpiLite[]): number {
  return kpis.reduce((sum, k) => sum + k.weightage, 0);
}

function badgeLabel(w: number): string {
  return `(${Math.round(w)}%)`;
}

function badgeTone(w: number): 'green' | 'amber' {
  return Math.round(w) === 100 ? 'green' : 'amber';
}

describe('Performance by Category weightage badge', () => {
  it('shows (100%) green for 3 unscored KPIs (40/30/30)', () => {
    const w = assignedWeight([
      { weightage: 40 },
      { weightage: 30 },
      { weightage: 30 },
    ]);
    expect(badgeLabel(w)).toBe('(100%)');
    expect(badgeTone(w)).toBe('green');
  });

  it('includes quarterly KPI auto-N/A by frequency: 40+30+(N/A 30) -> (100%) green', () => {
    const w = assignedWeight([
      { weightage: 40 },
      { weightage: 30 },
      { weightage: 30, isNa: true }, // e.g. Quarterly KPI in non-cycle-end month
    ]);
    expect(badgeLabel(w)).toBe('(100%)');
    expect(badgeTone(w)).toBe('green');
  });

  it('flags incomplete KRA mapping: 40+30+20 -> (90%) amber', () => {
    const w = assignedWeight([
      { weightage: 40 },
      { weightage: 30 },
      { weightage: 20 },
    ]);
    expect(badgeLabel(w)).toBe('(90%)');
    expect(badgeTone(w)).toBe('amber');
  });

  it('still 100% when scored — scoring status does not affect badge', () => {
    const w = assignedWeight([
      { weightage: 50, scored: true },
      { weightage: 50, scored: true },
    ]);
    expect(badgeLabel(w)).toBe('(100%)');
    expect(badgeTone(w)).toBe('green');
  });

  it('rounds 99.7 to 100 and treats it as green', () => {
    expect(badgeLabel(99.7)).toBe('(100%)');
    expect(badgeTone(99.7)).toBe('green');
  });

  it('uses full KPI list even when status filter hides some KPIs', () => {
    // All KPIs in the period (unfiltered)
    const allKpis: KpiLite[] = [
      { weightage: 40 },
      { weightage: 30 },
      { weightage: 30 },
    ];
    // Filtered subset (e.g. only 2 match the status filter)
    const filteredKpis: KpiLite[] = [
      { weightage: 40 },
      { weightage: 30 },
    ];
    // Badge must use ALL KPIs, not the filtered subset
    expect(badgeLabel(assignedWeight(allKpis))).toBe('(100%)');
    expect(badgeTone(assignedWeight(allKpis))).toBe('green');
    // The filtered subset alone would be 70%, which is wrong for the badge
    expect(badgeLabel(assignedWeight(filteredKpis))).toBe('(70%)');
  });
});