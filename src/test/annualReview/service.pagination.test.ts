import { describe, it, expect, vi, beforeEach } from 'vitest';

type Result = { data?: unknown; error?: unknown; count?: number };

const makeBuilder = () => {
  const b: Record<string, unknown> & { __result?: Result } = {};
  const chain = vi.fn().mockImplementation(() => b);
  b.select = chain;
  b.eq = vi.fn().mockImplementation(() => b);
  b.in = vi.fn().mockImplementation(() => b);
  b.ilike = vi.fn().mockImplementation(() => b);
  b.or = vi.fn().mockImplementation(() => b);
  b.not = vi.fn().mockImplementation(() => b);
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

  it('applies managerId as direct .eq on the instance row (no profile lookup)', async () => {
    const inst = makeBuilder();
    inst.__result = { data: [], error: null, count: 0 };
    tables.set('annual_review_instances', inst);
    await svc.listInstancesPaginated({ cycleId: 'c1', page: 1, pageSize: 25, managerId: 'mgr-1' });
    expect(inst.eq).toHaveBeenCalledWith('manager_id', 'mgr-1');
  });

  it('resolves departmentId to a profile-id allowlist applied with .in', async () => {
    const profiles = makeBuilder();
    profiles.__result = { data: [{ id: 'p1' }, { id: 'p2' }], error: null };
    tables.set('profiles', profiles);
    const inst = makeBuilder();
    inst.__result = { data: [], error: null, count: 0 };
    tables.set('annual_review_instances', inst);
    await svc.listInstancesPaginated({ cycleId: 'c1', page: 1, pageSize: 25, departmentId: 'd1' });
    expect(profiles.in).toHaveBeenCalledWith('department_id', ['d1']);
    expect(inst.in).toHaveBeenCalledWith('employee_id', ['p1', 'p2']);
  });

  it('resolves businessUnitId via departments → profiles', async () => {
    const depts = makeBuilder();
    depts.__result = { data: [{ id: 'd1' }, { id: 'd2' }], error: null };
    tables.set('departments', depts);
    const profiles = makeBuilder();
    profiles.__result = { data: [{ id: 'p9' }], error: null };
    tables.set('profiles', profiles);
    const inst = makeBuilder();
    inst.__result = { data: [], error: null, count: 0 };
    tables.set('annual_review_instances', inst);
    await svc.listInstancesPaginated({ cycleId: 'c1', page: 1, pageSize: 25, businessUnitId: 'bu1' });
    expect(depts.eq).toHaveBeenCalledWith('business_unit_id', 'bu1');
    expect(profiles.in).toHaveBeenCalledWith('department_id', ['d1', 'd2']);
    expect(inst.in).toHaveBeenCalledWith('employee_id', ['p9']);
  });

  it('resolves pmsGrade via profiles.pms_grade .eq and intersects with name search', async () => {
    const profiles = makeBuilder();
    profiles.__result = { data: [{ id: 'p7' }], error: null };
    tables.set('profiles', profiles);
    const inst = makeBuilder();
    inst.__result = { data: [], error: null, count: 0 };
    tables.set('annual_review_instances', inst);
    await svc.listInstancesPaginated({ cycleId: 'c1', page: 1, pageSize: 25, pmsGrade: 'M3' });
    expect(profiles.eq).toHaveBeenCalledWith('pms_grade', 'M3');
    expect(inst.in).toHaveBeenCalledWith('employee_id', ['p7']);
  });

  it('resolves level via profiles.level .eq', async () => {
    const profiles = makeBuilder();
    profiles.__result = { data: [{ id: 'p3' }, { id: 'p4' }], error: null };
    tables.set('profiles', profiles);
    const inst = makeBuilder();
    inst.__result = { data: [], error: null, count: 0 };
    tables.set('annual_review_instances', inst);
    await svc.listInstancesPaginated({ cycleId: 'c1', page: 1, pageSize: 25, level: 'L2' });
    expect(profiles.eq).toHaveBeenCalledWith('level', 'L2');
    expect(inst.in).toHaveBeenCalledWith('employee_id', ['p3', 'p4']);
  });
});

describe('getCycleStatusCounts', () => {
  it('uses count-only queries and is NOT capped at the 1000-row Data API default', async () => {
    // Regression: previously read overall_status rows unpaged, so cycles
    // with >1000 employees silently rendered "1000" in the summary cards.
    const inst = makeBuilder();
    // head: true returns no rows but a real `count`. Mock that shape.
    inst.__result = { data: null, error: null, count: 2560 };
    tables.set('annual_review_instances', inst);

    const c = await svc.getCycleStatusCounts('c1');
    // 1 total query + 7 per-status queries.
    expect(inst.select).toHaveBeenCalledTimes(8);
    expect(inst.select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    expect(c.total).toBe(2560);
    expect(c.total).toBeGreaterThan(1000);
  });
});