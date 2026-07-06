import { describe, it, expect, vi, beforeEach } from 'vitest';

type Counts = { rules: number; instTpl: number; instOverride: number };

let counts: Counts = { rules: 0, instTpl: 0, instOverride: 0 };
const deleteEqSpy = vi.fn();

vi.mock('@/integrations/supabase/client', () => {
  const fromImpl = (table: string) => {
    const selectHead = () => ({
      eq: (col: string, _val: string) => {
        if (table === 'annual_review_assignment_rules') {
          return Promise.resolve({ count: counts.rules, error: null });
        }
        if (table === 'annual_review_instances') {
          return Promise.resolve({
            count: col === 'template_id' ? counts.instTpl : counts.instOverride,
            error: null,
          });
        }
        return Promise.resolve({ count: 0, error: null });
      },
    });
    return {
      select: (_c: string, _opts?: unknown) => selectHead(),
      delete: () => ({
        eq: (col: string, val: string) => {
          deleteEqSpy(table, col, val);
          return Promise.resolve({ error: null });
        },
      }),
    };
  };
  return { supabase: { from: fromImpl } };
});

import { deleteTemplate } from '@/services/annualReview/annualReviewService';

describe('deleteTemplate', () => {
  beforeEach(() => {
    counts = { rules: 0, instTpl: 0, instOverride: 0 };
    deleteEqSpy.mockClear();
  });

  it('deletes when no references exist', async () => {
    const out = await deleteTemplate('t1');
    expect(out).toEqual({ ok: true });
    expect(deleteEqSpy).toHaveBeenCalledWith('annual_review_templates', 'id', 't1');
  });

  it('blocks with a message that includes reference counts', async () => {
    counts = { rules: 2, instTpl: 3, instOverride: 4 };
    await expect(deleteTemplate('t1')).rejects.toThrow(
      /2 rule\(s\), 7 live instance\(s\)/,
    );
    expect(deleteEqSpy).not.toHaveBeenCalled();
  });

  it('blocks even when only one reference type is non-zero', async () => {
    counts = { rules: 0, instTpl: 0, instOverride: 1 };
    await expect(deleteTemplate('t1')).rejects.toThrow(/1 live instance/);
    expect(deleteEqSpy).not.toHaveBeenCalled();
  });
});