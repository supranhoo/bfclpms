import { describe, it, expect, vi, beforeEach } from 'vitest';

const state: {
  profiles: Array<{ id: string; full_name: string | null; employee_code: string | null; designation: string | null; pms_grade: string | null; level: string | null; department_id: string | null }>;
  instances: Array<{ id: string; employee_id: string; template_id: string | null; template_override_id: string | null }>;
} = { profiles: [], instances: [] };

function makeRangeable(rows: unknown[]) {
  const b: any = {};
  b.select = vi.fn().mockReturnValue(b);
  b.eq = vi.fn().mockReturnValue(b);
  b.order = vi.fn().mockReturnValue(b);
  b.not = vi.fn().mockReturnValue(b);
  b.range = vi.fn().mockImplementation((from: number, to: number) => {
    const slice = rows.slice(from, to + 1);
    return Promise.resolve({ data: slice, error: null });
  });
  b.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
  return b;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((t: string) => {
      if (t === 'profiles') return makeRangeable(state.profiles);
      if (t === 'annual_review_instances') return makeRangeable(state.instances);
      if (t === 'annual_review_assignment_rules') return makeRangeable([]);
      if (t === 'departments') return makeRangeable([]);
      return makeRangeable([]);
    }),
  },
}));

import { checkMappingCoverage, _resetKrasCache } from '@/services/annualReview/formMapping';

beforeEach(() => {
  _resetKrasCache();
  state.profiles = [];
  state.instances = [];
});

describe('checkMappingCoverage — annual_review_instances paging (POLICY §94)', () => {
  it('counts every seeded instance past the 1000-row PostgREST cap', async () => {
    const N = 2579;
    state.profiles = Array.from({ length: N }, (_, i) => ({
      id: `emp-${i.toString().padStart(5, '0')}`,
      full_name: `Emp ${i}`,
      employee_code: `E${i}`,
      designation: null,
      pms_grade: null,
      level: null,
      department_id: null,
    }));
    state.instances = state.profiles.map((p, i) => ({
      id: `inst-${i.toString().padStart(5, '0')}`,
      employee_id: p.id,
      template_id: 'tpl-1',
      template_override_id: null,
    }));

    const report = await checkMappingCoverage('cycle-1');

    expect(report.totalEmployees).toBe(N);
    expect(report.seeded).toBe(N);
    expect(report.willSeed).toBe(0);
    expect(report.unmapped).toBe(0);
  });
});
