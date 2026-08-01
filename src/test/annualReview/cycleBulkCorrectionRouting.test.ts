/**
 * ADR-225a — commit routing + failure surfacing for bulk score corrections.
 *
 * RCA (2026-08-01, employee 101772): `admin_apply_system_scores_correction`
 * was declared with `p_final_rating numeric` while
 * `annual_review_instances.final_rating` is TEXT, so every downgrade commit
 * raised `COALESCE types numeric and text cannot be matched` and was
 * swallowed as a "failed" row. These tests pin the RPC contract and assert
 * that a server-side exception is reported, never silently dropped.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));
vi.mock('@/services/annualReview/annualReviewService', () => ({
  updateInstance: vi.fn(async () => ({})),
  resolveTemplateId: vi.fn(() => null),
}));

import { commitDryRun } from '@/services/annualReview/cycleBulkDataUpload';

const instance = {
  instanceId: 'inst-1',
  employeeCode: '101772',
  fullName: 'Test Employee',
  templateName: 'A',
  overallStatus: 'completed',
  systemScores: { sys_prod: 20 },
  systemScoresRaw: { sys_prod: 97 },
  eligibilityInputs: {},
  slotByCanonical: new Map([
    ['system_scores::annual production target vs actual', { id: 'sys_prod', slot: { weight: 25 } }],
  ]),
} as never;

const plan = {
  columns: [{ name: 'Annual Production Target Vs Actual', kind: 'system_scores' }],
  instances: [instance],
} as never;

function report(direction: 'down' | 'up') {
  return {
    rows: [{
      employeeCode: '101772',
      verdict: 'apply',
      mode: 'admin_upgrade',
      changes: [{
        column: 'Annual Production Target Vs Actual',
        kind: 'system_scores',
        before: 97, after: 85,
        beforePoints: 20, afterPoints: direction === 'down' ? 10 : 24,
        direction,
      }],
    }],
  } as never;
}

describe('ADR-225a commit routing', () => {
  beforeEach(() => rpc.mockReset());

  it('routes a downward row to the correction RPC with a text-compatible final rating', async () => {
    rpc.mockResolvedValue({ data: {}, error: null });
    const res = await commitDryRun(report('down'), plan, { reason: 'corrected production actuals' });
    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe('admin_apply_system_scores_correction');
    expect(args.p_reason).toBe('corrected production actuals');
    // Must be null or a string — a numeric rating would not match the TEXT column.
    expect(args.p_final_rating === null || typeof args.p_final_rating === 'string').toBe(true);
    expect(res.correctedRows).toBe(1);
    expect(res.failed).toBe(0);
  });

  it('routes an upward-only row to the monotonic upgrade RPC', async () => {
    rpc.mockResolvedValue({ data: {}, error: null });
    await commitDryRun(report('up'), plan, { reason: 'x' });
    expect((rpc.mock.calls[0] as [string])[0]).toBe('admin_apply_system_scores_upgrade');
  });

  it('reports a server-side RPC exception instead of silently succeeding', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'COALESCE types numeric and text cannot be matched' } });
    const res = await commitDryRun(report('down'), plan, { reason: 'corrected production actuals' });
    expect(res.updated).toBe(0);
    expect(res.failed).toBe(1);
    expect(res.errors[0]).toContain('101772');
  });
});