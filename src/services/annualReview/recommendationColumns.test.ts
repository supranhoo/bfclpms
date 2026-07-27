import { describe, it, expect } from 'vitest';
import { indexRecommendations, mergeRecommendations } from './recommendationColumns';

describe('ADR-182 recommendation columns', () => {
  it('indexes rows by instance id', () => {
    const map = indexRecommendations([
      { instance_id: 'i1', dept_head_recommendation: 'promote', bu_head_recommendation: null, management_recommendation: 'agreed' },
    ]);
    expect(map.i1.dept_head_recommendation).toBe('promote');
    expect(map.i1.bu_head_recommendation).toBeNull();
    expect(map.i1.management_recommendation).toBe('agreed');
  });

  it('ignores rows without an instance id', () => {
    const map = indexRecommendations([
      { instance_id: '', dept_head_recommendation: 'x', bu_head_recommendation: null, management_recommendation: null },
    ] as any);
    expect(Object.keys(map)).toHaveLength(0);
  });

  it('merges onto report rows and leaves unmatched rows untouched', () => {
    const rows = [{ instance_id: 'i1', employee_code: 'E1' }, { instance_id: 'i2', employee_code: 'E2' }];
    const out = mergeRecommendations(rows, {
      i1: { dept_head_recommendation: 'promote', bu_head_recommendation: 'ok', management_recommendation: null },
    });
    expect((out[0] as any).bu_head_recommendation).toBe('ok');
    expect((out[1] as any).bu_head_recommendation).toBeUndefined();
    // input not mutated
    expect((rows[0] as any).bu_head_recommendation).toBeUndefined();
  });
});
