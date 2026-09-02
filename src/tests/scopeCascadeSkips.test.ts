import { describe, it, expect } from 'vitest';
import {
  groupSkips,
  periodList,
  skipSummaryText,
  scopeChangeSummary,
} from '@/lib/orgKpi/scopeCascadeSkips';

// ADR-344 — a skipped period must never be reported as "locked" unless it is.
const mockSkips = [
  { period: 'September', year: 2026, reason: 'no_org_kpi_rows' },
  { period: 'October', year: 2026, reason: 'no_org_kpi_rows' },
  { period: 'July', year: 2026, reason: 'period_locked' },
  { period: 'August', year: 2026, reason: 'okv_conflict' },
];

describe('scopeCascadeSkips', () => {
  it('groups skips by their real reason', () => {
    const g = groupSkips(mockSkips);
    expect(g.missing).toHaveLength(2);
    expect(g.locked).toHaveLength(1);
    expect(g.other).toHaveLength(1);
    expect(g.total).toBe(4);
  });

  it('tolerates null / empty input', () => {
    expect(groupSkips(null).total).toBe(0);
    expect(skipSummaryText(undefined)).toBe('');
  });

  it('truncates long period lists', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      period: 'March', year: 2020 + i, reason: 'period_locked',
    }));
    expect(periodList(many)).toContain('+2 more');
  });

  it('never labels missing-row periods as locked', () => {
    const text = skipSummaryText(mockSkips);
    expect(text).toContain('2 have no rows for this KPI yet');
    expect(text).toContain('1 locked');
    expect(text).toContain('okv_conflict');
    expect(text.startsWith('4 period(s) skipped')).toBe(true);
  });

  it('reports seeded periods in the success summary', () => {
    expect(scopeChangeSummary('Department', 5, [], 3)).toBe(
      'Changed to "Department" across 5 period(s) · created in 3 new period(s).',
    );
    expect(scopeChangeSummary('Department', 5, [])).toBe(
      'Changed to "Department" across 5 period(s).',
    );
  });
});
