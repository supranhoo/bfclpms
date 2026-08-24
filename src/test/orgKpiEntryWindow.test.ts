import { describe, it, expect } from 'vitest';
import { describeEntryWindow } from '@/lib/frequencyUtils';
import { deriveOrgKpiEmptyState } from '@/lib/orgKpiEmptyState';

/**
 * ADR-310 / POLICY §ORG-KPI-ENTRY-WINDOW-VISIBILITY
 *
 * Multi-month org KPIs stay visible in the Org KPI Data Entry list as
 * read-only "not yet due" cards instead of vanishing, so the admin console and
 * the employee scorecard always list the same definitions for a period.
 */
describe('describeEntryWindow', () => {
  it('treats Monthly / Daily / Weekly as always open', () => {
    for (const f of ['Monthly', 'Daily', 'Weekly']) {
      const w = describeEntryWindow(f, 'July', 2026, null);
      expect(w.status).toBe('open');
      expect(w.label).toBeNull();
    }
  });

  it('marks a Bi-Monthly Jul-Aug KPI as not due in July, opening in August', () => {
    const w = describeEntryWindow('Bi-Monthly', 'July', 2026, 'Jul-Aug');
    expect(w.status).toBe('not_due');
    expect(w.dueMonth).toBe('August');
    expect(w.label).toContain('entry opens in August');
  });

  it('opens the same KPI in August', () => {
    expect(describeEntryWindow('Bi-Monthly', 'August', 2026, 'Jul-Aug').status).toBe('open');
  });

  it('marks a Quarterly Jul-Sep KPI as not due in July, opening in September', () => {
    const w = describeEntryWindow('Quarterly', 'July', 2026, 'Jul-Sep');
    expect(w.status).toBe('not_due');
    expect(w.dueMonth).toBe('September');
  });

  it('opens the Quarterly Jul-Sep KPI in September', () => {
    expect(describeEntryWindow('Quarterly', 'September', 2026, 'Jul-Sep').status).toBe('open');
  });

  it('handles a Bi-Monthly Jan-Feb KPI viewed in July (locked, opens in August of its own cycle)', () => {
    const w = describeEntryWindow('Bi-Monthly', 'July', 2026, 'Jan-Feb');
    expect(w.status).toBe('not_due');
    expect(w.dueMonth).toBe('August');
  });

  it('wraps the due month across the year boundary', () => {
    const w = describeEntryWindow('Half-Yearly', 'November', 2026, 'Jul-Dec');
    expect(w.status).toBe('not_due');
    expect(w.dueMonth).toBe('December');
  });

  it('reproduces the July 2026 shape: 166 open, 22 not yet due', () => {
    const defs = [
      ...Array.from({ length: 166 }, () => ({ f: 'Monthly', c: null as string | null })),
      ...Array.from({ length: 20 }, () => ({ f: 'Bi-Monthly', c: 'Jul-Aug' as string | null })),
      ...Array.from({ length: 2 }, () => ({ f: 'Quarterly', c: 'Jul-Sep' as string | null })),
    ];
    const windows = defs.map(d => describeEntryWindow(d.f, 'July', 2026, d.c));
    expect(windows.filter(w => w.status === 'open')).toHaveLength(166);
    expect(windows.filter(w => w.status === 'not_due')).toHaveLength(22);
  });
});

describe('deriveOrgKpiEmptyState — all-not-yet-due', () => {
  const base = {
    isLoading: false,
    totalOrgKpis: 22,
    ownershipFilteredCount: 22,
    frequencyFilteredCount: 22,
    groupedCount: 0,
    isMaskedAdmin: false,
    hasActiveFilters: false,
  };

  it('classifies a period where every definition opens later', () => {
    expect(deriveOrgKpiEmptyState({ ...base, openWindowCount: 0 })).toBe('all-not-yet-due');
  });

  it('still reports filtered-out when some definitions are enterable', () => {
    expect(
      deriveOrgKpiEmptyState({ ...base, openWindowCount: 5, hasActiveFilters: true })
    ).toBe('filtered-out');
  });
});
