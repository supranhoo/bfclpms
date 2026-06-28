import { describe, it, expect } from 'vitest';
import { planAnchorRepairs, type KpiAnchorRow } from '@/lib/cycleAnchorRepair';

const row = (over: Partial<KpiAnchorRow>): KpiAnchorRow => ({
  id: 'id-default',
  employee_id: 'emp-1',
  kpi_name: 'Achieve production target',
  review_year: 2026,
  frequency: 'Bi-Monthly',
  frequency_cycle_start: 'Feb-Mar',
  created_at: '2026-02-01T00:00:00Z',
  ...over,
});

describe('planAnchorRepairs — ADR-090 oldest-row-wins', () => {
  it('returns no actions when tuple has a single shared anchor', () => {
    const out = planAnchorRepairs([
      row({ id: 'a' }),
      row({ id: 'b', created_at: '2026-03-01T00:00:00Z' }),
    ]);
    expect(out).toEqual([]);
  });

  it('Sajid scenario: April Feb-Mar wins over May/June May-Jun drift', () => {
    const rows = [
      row({ id: 'apr', created_at: '2026-04-01T12:17:51Z', frequency_cycle_start: 'Feb-Mar' }),
      row({ id: 'may', created_at: '2026-05-01T00:00:05Z', frequency_cycle_start: 'May-Jun' }),
      row({ id: 'jun', created_at: '2026-06-01T10:31:13Z', frequency_cycle_start: 'May-Jun' }),
    ];
    const out = planAnchorRepairs(rows);
    expect(out).toEqual([
      { kpi_id: 'may', from_anchor: 'May-Jun', to_anchor: 'Feb-Mar' },
      { kpi_id: 'jun', from_anchor: 'May-Jun', to_anchor: 'Feb-Mar' },
    ]);
  });

  it('breaks created_at ties deterministically by id ASC', () => {
    const rows = [
      row({ id: 'zzz', frequency_cycle_start: 'May-Jun' }),
      row({ id: 'aaa', frequency_cycle_start: 'Feb-Mar' }),
    ];
    const out = planAnchorRepairs(rows);
    expect(out).toEqual([
      { kpi_id: 'zzz', from_anchor: 'May-Jun', to_anchor: 'Feb-Mar' },
    ]);
  });

  it('handles Half-Yearly Apr-Sep drifting to Jan-Jun (Abhas pattern)', () => {
    const rows = [
      row({ id: 'jul', frequency: 'Half-Yearly', frequency_cycle_start: 'Apr-Sep', created_at: '2025-07-01T00:00:00Z' }),
      row({ id: 'oct', frequency: 'Half-Yearly', frequency_cycle_start: 'Jul-Dec', created_at: '2025-10-01T00:00:00Z' }),
    ];
    const out = planAnchorRepairs(rows);
    expect(out).toEqual([{ kpi_id: 'oct', from_anchor: 'Jul-Dec', to_anchor: 'Apr-Sep' }]);
  });

  it('ignores monthly / null-anchor rows', () => {
    const rows = [
      row({ id: 'm1', frequency: 'Monthly', frequency_cycle_start: null }),
      row({ id: 'm2', frequency: 'Monthly', frequency_cycle_start: null }),
    ];
    expect(planAnchorRepairs(rows)).toEqual([]);
  });

  it('isolates tuples by employee + kpi + year + frequency', () => {
    const rows = [
      row({ id: 'e1-feb', employee_id: 'e1', frequency_cycle_start: 'Feb-Mar' }),
      row({ id: 'e2-may', employee_id: 'e2', frequency_cycle_start: 'May-Jun', created_at: '2026-02-01T00:00:00Z' }),
    ];
    expect(planAnchorRepairs(rows)).toEqual([]);
  });
});