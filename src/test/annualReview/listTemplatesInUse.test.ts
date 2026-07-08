import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * listTemplatesInUse — aggregates seeded instances per effective template
 * (COALESCE(override, template_id)) and joins template names. Tests the
 * SSOT shared by the Form Mapping panel and the Phased Rollout multi-select.
 */

vi.mock('@/lib/fetchAll', () => ({
  fetchAllPaged: async (fetcher: any) => {
    const { data, error } = await fetcher(0, 999);
    if (error) throw error;
    return data ?? [];
  },
}));

type Row = { employee_id: string; template_id: string | null; template_override_id: string | null };

function buildSupabase(rows: Row[], templates: { id: string; name: string }[]) {
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
            in: async () => ({ data: templates, error: null }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe('listTemplatesInUse', () => {
  beforeEach(() => vi.resetModules());

  it('returns [] for empty cycleId', async () => {
    vi.doMock('@/integrations/supabase/client', () => ({ supabase: buildSupabase([], []) }));
    const { listTemplatesInUse } = await import('@/services/annualReview/formMapping');
    expect(await listTemplatesInUse('')).toEqual([]);
  });

  it('counts effective template with override precedence and sorts by desc', async () => {
    const rows: Row[] = [
      { employee_id: 'e1', template_id: 't-a', template_override_id: null },
      { employee_id: 'e2', template_id: 't-a', template_override_id: null },
      { employee_id: 'e3', template_id: 't-a', template_override_id: 't-b' }, // override wins
      { employee_id: 'e4', template_id: null, template_override_id: 't-b' },
      { employee_id: 'e5', template_id: null, template_override_id: null }, // ignored
    ];
    const templates = [
      { id: 't-a', name: 'Template A' },
      { id: 't-b', name: 'Template B' },
    ];
    vi.doMock('@/integrations/supabase/client', () => ({ supabase: buildSupabase(rows, templates) }));
    const { listTemplatesInUse } = await import('@/services/annualReview/formMapping');
    const result = await listTemplatesInUse('cycle-1');
    expect(result).toEqual([
      { template_id: 't-b', name: 'Template B', employees_count: 2 },
      { template_id: 't-a', name: 'Template A', employees_count: 2 },
    ]);
  });

  it('returns [] when no instances have an effective template', async () => {
    const rows: Row[] = [
      { employee_id: 'e1', template_id: null, template_override_id: null },
    ];
    vi.doMock('@/integrations/supabase/client', () => ({ supabase: buildSupabase(rows, []) }));
    const { listTemplatesInUse } = await import('@/services/annualReview/formMapping');
    expect(await listTemplatesInUse('cycle-1')).toEqual([]);
  });
});