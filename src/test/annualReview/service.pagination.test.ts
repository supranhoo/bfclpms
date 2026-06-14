import { describe, it, expect, vi, beforeEach } from 'vitest';

type Result = { data?: unknown; error?: unknown; count?: number };

const makeBuilder = () => {
  const b: Record<string, unknown> & { __result?: Result } = {};
  const chain = vi.fn().mockImplementation(() => b);
  b.select = chain;
  b.eq = vi.fn().mockImplementation(() => b);
  b.in = vi.fn().mockImplementation(() => b);
  b.ilike = vi.fn().mockImplementation(() => b);
  b.order = vi.fn().mockImplementation(() => b);
  b.range = vi.fn().mockImplementation(() => b);
  b.limit = vi.fn().mockImplementation(() => b);
  // Awaitable
  (b as { then: unknown }).then = (resolve: (v: Result) => void) =>
    resolve(b.__result ?? { data: [], error: null, count: 0 });
  return b;
};

const tables = new Map<string, ReturnType<typeof makeBuilder>>();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((t: string) => {
      if (!tables.has(t)) tables.set(t, makeBuilder());
      return tables.get(t)!;
    }),
    storage: { from: vi.fn() },
    functions: { invoke: vi.fn() },
    rpc: vi.fn(),
  },
}));

import * as svc from '@/services/annualReview/annualReviewService';

beforeEach(() => tables.clear());

describe('listInstancesPaginated', () => {
  it('caps page size at 100 and applies cycle_id eq', async () => {
    const inst = makeBuilder();
    inst.__result = { data: [{ id: '1' }], error: null, count: 1 };
    tables.set('annual_review_instances', inst);

    const out = await svc.listInstancesPaginated({ cycleId: 'c1', page: 1, pageSize: 9999 });
    expect(out.total).toBe(1);
    expect(inst.range).toHaveBeenCalledWith(0, 99);
    expect(inst.eq).toHaveBeenCalledWith('cycle_id', 'c1');
  });

  it('returns empty when name search has no matches', async () => {
    const profiles = makeBuilder();
    profiles.__result = { data: [], error: null };
    tables.set('profiles', profiles);
    tables.set('annual_review_instances', makeBuilder());

    const out = await svc.listInstancesPaginated({ cycleId: 'c1', page: 1, pageSize: 25, search: 'nobody' });
    expect(out).toEqual({ rows: [], total: 0 });
  });

  it('applies status filter only when not "all" and offsets pages', async () => {
    const inst = makeBuilder();
    inst.__result = { data: [], error: null, count: 0 };
    tables.set('annual_review_instances', inst);
    await svc.listInstancesPaginated({ cycleId: 'c1', page: 2, pageSize: 25, status: 'pending_hr' });
    expect(inst.eq).toHaveBeenCalledWith('overall_status', 'pending_hr');
    expect(inst.range).toHaveBeenCalledWith(25, 49);
  });
});

describe('getCycleStatusCounts', () => {
  it('groups rows by overall_status and totals', async () => {
    const inst = makeBuilder();
    inst.__result = {
      data: [
        { overall_status: 'pending_self' },
        { overall_status: 'pending_self' },
        { overall_status: 'completed' },
      ],
      error: null,
    };
    tables.set('annual_review_instances', inst);

    const c = await svc.getCycleStatusCounts('c1');
    expect(c.total).toBe(3);
    expect(c.pending_self).toBe(2);
    expect(c.completed).toBe(1);
    expect(c.pending_hr).toBe(0);
  });
});