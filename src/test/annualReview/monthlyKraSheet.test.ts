import { describe, it, expect, vi } from 'vitest';
import {
  buildMonthlyKraRows, foldMatrixRows, monthlyKraHeaders, MONTHLY_KRA_ROW_CAP,
  type MonthlyKraMatrix,
} from '@/services/annualReview/monthlyKraSheet';
import type { ComprehensiveRow } from '@/services/annualReview/comprehensiveReport';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

function row(over: Partial<ComprehensiveRow> = {}): ComprehensiveRow {
  return {
    instance_id: 'i1', employee_id: 'e1', employee_code: '101785', employee_name: 'Ankit C',
    designation: 'Eng', department_id: null, department_name: 'IT',
    business_unit_id: null, business_unit_name: 'CORP', division_id: null, division_name: null,
    grade: null, doj: null, overall_status: 'completed', is_excluded: false, excluded_reason: null,
    enabled_stages: null, self_score: null, manager_score: null, dept_head_score: null,
    bu_head_score: null, hr_score: null, management_score: null, total_score: 91.72,
    final_rating: 'Outstanding', finalized_at: null, updated_at: null, days_pending: null,
    manager_name: null, dept_head_name: null, bu_head_name: null, hr_name: null, management_name: null,
    self_comment: null, manager_comment: null, dept_head_comment: null, bu_head_comment: null,
    hr_comment: null, management_comment: null, hr_stage_enabled: null, hr_response_exists: null,
    hr_response_submitted_at: null, manager_id: null, dept_head_id: null, bu_head_id: null,
    hr_id: null, management_id: null, cycle_default_stages: null,
    template_id: 't-kra', template_name: 'Generic M/W (With KRA)',
    kra_points: 82.5, kra_weight: 90,
    ...over,
  } as ComprehensiveRow;
}

const isKra = (id: string | null | undefined) => id === 't-kra';

describe('ADR-188 — Monthly KRA sheet', () => {
  it('locks the header shape: 24 month columns plus identity and totals', () => {
    const h = monthlyKraHeaders();
    expect(h.slice(0, 6)).toEqual([
      'Employee Code', 'Name', 'Designation', 'Department', 'Business Unit', 'Template',
    ]);
    expect(h[6]).toBe('Jul /5');
    expect(h[7]).toBe('Jul %');
    expect(h[28]).toBe('Jun /5');
    expect(h[29]).toBe('Jun %');
    expect(h.slice(-4)).toEqual(['Months Scored', 'Avg /5', 'KRA Points', 'KRA Weight']);
    expect(h).toHaveLength(6 + 24 + 4);
  });

  it('folds RPC rows into a per-employee month map and ignores unknown months', () => {
    const m = foldMatrixRows([
      { employee_id: 'e1', review_period: 'July', avg_rating: '4.25', pct: '85', kpi_count: 6 },
      { employee_id: 'e1', review_period: 'Smarch', avg_rating: 5, pct: 100, kpi_count: 1 },
    ] as any);
    expect(m.get('e1')).toEqual({ July: { rating: 4.25, pct: 85, kpiCount: 6 } });
  });

  it('emits one row per KRA employee and excludes non-KRA templates', () => {
    const matrix: MonthlyKraMatrix = new Map([
      ['e1', { July: { rating: 4, pct: 80, kpiCount: 5 } }],
    ]);
    const out = buildMonthlyKraRows(
      [row(), row({ employee_id: 'e2', template_id: 't-plain' })],
      matrix, isKra,
    );
    expect(out).toHaveLength(1);
    expect(out[0]['Employee Code']).toBe('101785');
  });

  it('leaves unscored months blank rather than zero and averages only scored months', () => {
    const matrix: MonthlyKraMatrix = new Map([
      ['e1', {
        July: { rating: 4, pct: 80, kpiCount: 5 },
        August: { rating: 5, pct: 100, kpiCount: 5 },
      }],
    ]);
    const [r] = buildMonthlyKraRows([row()], matrix, isKra);
    expect(r['Jul /5']).toBe(4);
    expect(r['Aug %']).toBe(100);
    expect(r['Sep /5']).toBe('');
    expect(r['Sep %']).toBe('');
    expect(r['Months Scored']).toBe(2);
    expect(r['Avg /5']).toBe(4.5);
  });

  it('carries KRA points/weight through and blanks the average with no data', () => {
    const [r] = buildMonthlyKraRows([row()], new Map(), isKra);
    expect(r['Months Scored']).toBe(0);
    expect(r['Avg /5']).toBe('');
    expect(r['KRA Points']).toBe(82.5);
    expect(r['KRA Weight']).toBe(90);
  });

  it('returns no rows when nothing is KRA-based (sheet is then omitted)', () => {
    expect(buildMonthlyKraRows([row({ template_id: 't-plain' })], new Map(), isKra)).toEqual([]);
  });

  it('truncates at the export row cap', () => {
    const many = Array.from({ length: MONTHLY_KRA_ROW_CAP + 10 }, (_, i) =>
      row({ employee_id: `e${i}` }));
    expect(buildMonthlyKraRows(many, new Map(), isKra)).toHaveLength(MONTHLY_KRA_ROW_CAP);
  });
});
