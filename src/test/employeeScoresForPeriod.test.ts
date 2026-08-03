import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEmployeeScoresForPeriod } from '@/hooks/useEmployeeScoresForPeriod';
import type { KPI } from '@/hooks/useKpis';

const sub = (o: Partial<Record<string, unknown>> = {}) => ({
  final_score: null, management_score: null, auditor_score: null,
  hr_pms_score: null, skip_level_score: null, manager_score: null,
  self_score: null, is_na: false, ...o,
}) as never;

const kpi = (id: string, employee_id: string, weightage: number) =>
  ({ id, employee_id, weightage }) as unknown as KPI;

function run(kpis: KPI[], map: Map<string, never>) {
  return renderHook(() => useEmployeeScoresForPeriod(kpis, map as never)).result.current;
}

describe('useEmployeeScoresForPeriod — POLICY §UI-SCORE-PRECISION', () => {
  it('keeps two decimals (4.55 must not become 4.6)', () => {
    const kpis = [kpi('k1', 'e1', 50), kpi('k2', 'e1', 50)];
    const m = new Map([['k1', sub({ final_score: 4.3 })], ['k2', sub({ final_score: 4.8 })]]);
    expect(run(kpis, m as never).get('e1')).toBe(4.55);
  });

  it('excludes N/A and unscored KPIs', () => {
    const kpis = [kpi('k1', 'e1', 50), kpi('k2', 'e1', 50), kpi('k3', 'e1', 50)];
    const m = new Map([
      ['k1', sub({ final_score: 4 })],
      ['k2', sub({ final_score: 1, is_na: true })],
      ['k3', sub()],
    ]);
    expect(run(kpis, m as never).get('e1')).toBe(4);
  });

  it('ignores zero-weight KPIs', () => {
    const kpis = [kpi('k1', 'e1', 0), kpi('k2', 'e1', 20)];
    const m = new Map([['k1', sub({ final_score: 1 })], ['k2', sub({ final_score: 3.333 })]]);
    expect(run(kpis, m as never).get('e1')).toBe(3.33);
  });

  it('returns null when no scores exist', () => {
    const kpis = [kpi('k1', 'e1', 50)];
    const m = new Map([['k1', sub()]]);
    expect(run(kpis, m as never).get('e1')).toBeNull();
  });

  it('uses the 8-stage fallback chain', () => {
    const kpis = [kpi('k1', 'e1', 10)];
    const m = new Map([['k1', sub({ self_score: 2, manager_score: 4.25 })]]);
    expect(run(kpis, m as never).get('e1')).toBe(4.25);
  });
});
