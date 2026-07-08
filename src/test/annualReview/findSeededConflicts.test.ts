import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * findSeededConflicts — surfaces employees who already have a seeded
 * instance on a template DIFFERENT to the one a new Form Mapping rule
 * targets. Effective template respects `template_override_id`.
 * Eligibility for reassignment matches the server-side rule inside
 * `set_annual_review_template_override` (not_started | pending_self).
 */

vi.mock('@/lib/fetchAll', () => ({
  fetchAllPaged: async (fetcher: any) => {
    const { data, error } = await fetcher(0, 999);
    if (error) throw error;
    return data ?? [];
  },
}));

type Row = {
  id: string;
  employee_id: string;
  template_id: string | null;
  template_override_id: string | null;
  overall_status: string | null;
};

function buildSupabase(rows: Row[]) {
  return {
    from(table: string) {
      if (table === 'annual_review_instances') {
        return {
          select: () => ({
            eq: () => ({
              range: async () => ({ data: rows, error: null }),
            }),
          }),
        };
      }
      if (table === 'annual_review_templates') {
        return {
          select: () => ({
            in: async (_col: string, ids: string[]) => ({
              data: ids.map((id) => ({ id, name: `Template ${id.slice(-1).toUpperCase()}` })),
              error: null,
            }),
          }),
        };
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            in: async (_col: string, ids: string[]) => ({
              data: ids.map((id) => ({
                id,
                full_name: `Emp ${id}`,
                employee_code: `E-${id}`,
              })),
              error: null,
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe('findSeededConflicts', () => {
  beforeEach(() => vi.resetModules());

  it('returns [] when inputs are empty', async () => {
    vi.doMock('@/integrations/supabase/client', () => ({ supabase: buildSupabase([]) }));
    const { findSeededConflicts } = await import('@/services/annualReview/formMapping');
    expect(await findSeededConflicts('', ['e1'], 't-a')).toEqual([]);
    expect(await findSeededConflicts('c1', [], 't-a')).toEqual([]);
    expect(await findSeededConflicts('c1', ['e1'], '')).toEqual([]);
  });

  it('ignores employees already on the target template', async () => {
    const rows: Row[] = [
      { id: 'i1', employee_id: 'e1', template_id: 't-b', template_override_id: null, overall_status: 'pending_self' },
    ];
    vi.doMock('@/integrations/supabase/client', () => ({ supabase: buildSupabase(rows) }));
    const { findSeededConflicts } = await import('@/services/annualReview/formMapping');
    // Target = same template → no conflict.
    expect(await findSeededConflicts('c1', ['e1'], 't-b')).toEqual([]);
  });

  it('flags employees seeded on a different template and marks eligibility by stage', async () => {
    const rows: Row[] = [
      { id: 'i1', employee_id: 'e1', template_id: 't-a', template_override_id: null, overall_status: 'not_started' },
      { id: 'i2', employee_id: 'e2', template_id: 't-a', template_override_id: null, overall_status: 'pending_self' },
      { id: 'i3', employee_id: 'e3', template_id: 't-a', template_override_id: null, overall_status: 'pending_manager' },
      { id: 'i4', employee_id: 'e4', template_id: 't-a', template_override_id: 't-c', overall_status: 'pending_self' }, // override wins
      { id: 'i5', employee_id: 'e5', template_id: 't-b', template_override_id: null, overall_status: 'not_started' }, // matches target — ignored
    ];
    vi.doMock('@/integrations/supabase/client', () => ({ supabase: buildSupabase(rows) }));
    const { findSeededConflicts } = await import('@/services/annualReview/formMapping');
    const result = await findSeededConflicts('c1', ['e1', 'e2', 'e3', 'e4', 'e5'], 't-b');
    expect(result.map((r) => r.employee_id).sort()).toEqual(['e1', 'e2', 'e3', 'e4']);
    const byId = Object.fromEntries(result.map((r) => [r.employee_id, r]));
    expect(byId.e1.eligible_for_reassign).toBe(true);
    expect(byId.e2.eligible_for_reassign).toBe(true);
    expect(byId.e3.eligible_for_reassign).toBe(false);
    expect(byId.e4.current_template_id).toBe('t-c'); // override respected
  });
});