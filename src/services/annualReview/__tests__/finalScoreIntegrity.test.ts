import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  missingFinalScoreRows,
  isMissingFinalScore,
  recomputeFinalScores,
  RECOMPUTE_BATCH_LIMIT,
} from '../finalScoreIntegrity';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

// Mock data mirrors the real ADR-232 defect: completed KRA-template reviews
// whose system score exists but whose total_score was never written back.
const rows = [
  { instance_id: 'i1', employee_code: '100264', employee_name: 'Sajid Raza', overall_status: 'completed', is_excluded: false, total_score: null },
  { instance_id: 'i2', employee_code: '100012', employee_name: 'Nitesh Kumar Baldwa', overall_status: 'completed', is_excluded: false, total_score: null },
  { instance_id: 'i3', employee_code: '100003', employee_name: 'Scored', overall_status: 'completed', is_excluded: false, total_score: 88.5 },
  { instance_id: 'i4', employee_code: '100004', employee_name: 'Excluded', overall_status: 'completed', is_excluded: true, total_score: null },
  { instance_id: 'i5', employee_code: '100005', employee_name: 'In progress', overall_status: 'pending_hr', is_excluded: false, total_score: null },
  { instance_id: 'i6', employee_code: '100006', employee_name: 'Zero score', overall_status: 'completed', is_excluded: false, total_score: 0 },
];

describe('missingFinalScoreRows', () => {
  it('flags only completed, non-excluded rows with no final score', () => {
    expect(missingFinalScoreRows(rows).map((r) => r.instance_id)).toEqual(['i1', 'i2']);
  });

  it('treats a stored zero as a real score, not a missing one', () => {
    expect(isMissingFinalScore(rows[5])).toBe(false);
  });

  it('handles null/undefined input', () => {
    expect(missingFinalScoreRows(null)).toEqual([]);
    expect(missingFinalScoreRows(undefined)).toEqual([]);
  });
});

describe('recomputeFinalScores', () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: { applied: 2, skipped: [] }, error: null });
  });

  it('calls the RPC with de-duplicated ids and overwrite off by default', async () => {
    const res = await recomputeFinalScores({ instanceIds: ['i1', 'i1', 'i2'], reason: 'ADR-232 repair run' });
    expect(rpc).toHaveBeenCalledWith('admin_recompute_annual_review_final_score', {
      p_instance_ids: ['i1', 'i2'],
      p_reason: 'ADR-232 repair run',
      p_allow_overwrite: false,
    });
    expect(res).toEqual({ applied: 2, skipped: [] });
  });

  it('is a no-op for an empty selection', async () => {
    expect(await recomputeFinalScores({ instanceIds: [], reason: 'ADR-232 repair run' })).toEqual({ applied: 0, skipped: [] });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects a short reason before hitting the server', async () => {
    await expect(recomputeFinalScores({ instanceIds: ['i1'], reason: 'short' })).rejects.toThrow(/reason/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects oversized batches', async () => {
    const ids = Array.from({ length: RECOMPUTE_BATCH_LIMIT + 1 }, (_, i) => `id-${i}`);
    await expect(recomputeFinalScores({ instanceIds: ids, reason: 'ADR-232 repair run' })).rejects.toThrow(/max/i);
  });

  it('surfaces server errors', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('only admin / hr_pms may recompute annual review final scores') });
    await expect(recomputeFinalScores({ instanceIds: ['i1'], reason: 'ADR-232 repair run' })).rejects.toThrow(/admin/i);
  });

  it('reports skipped instances returned by the server', async () => {
    rpc.mockResolvedValue({ data: { applied: 1, skipped: [{ instance_id: 'i2', reason: 'skipped_no_score_source' }] }, error: null });
    const res = await recomputeFinalScores({ instanceIds: ['i1', 'i2'], reason: 'ADR-232 repair run' });
    expect(res.applied).toBe(1);
    expect(res.skipped[0].reason).toBe('skipped_no_score_source');
  });
});