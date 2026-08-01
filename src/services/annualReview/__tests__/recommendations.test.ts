import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  formatRecommendationAmount,
  RECOMMENDATION_STATUS_LABEL,
  type RecommendationStatus,
} from '@/services/annualReview/recommendations';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import { fetchRecommendationQueue } from '@/services/annualReview/recommendations';

const LEGACY_QUEUE_MOCK = {
  id: 'rec-1', instance_id: 'inst-1', employee_id: 'employee-1',
  employee_code: '100001', employee_name: 'Mock Employee', department_name: 'Operations',
  business_unit_name: 'Plant', designation_name: 'Manager', reviewer_role: 'bu_head',
  reviewer_name: 'Mock Reviewer', type_keys: ['promotion'], type_labels: ['Promotion'],
  is_monetary: false, amount_kind: null, amount_value: null,
  approved_amount_kind: null, approved_amount_value: null, proposed_designation: null,
  proposed_grade: null, effective_from: null, narrative: 'Recommended for promotion',
  status: 'needs_classification', source: 'legacy_import', decided_at: null,
  decision_reason: null, final_rating: '4.10', total_score: 82, created_at: '2026-08-01T14:06:14Z',
  total_count: 1077,
};

describe('ADR-226 recommendation formatting', () => {
  it('renders percentage asks without trailing zeros', () => {
    expect(formatRecommendationAmount('percent', 8)).toBe('8%');
    expect(formatRecommendationAmount('percent', 8.5)).toBe('8.50%');
  });

  it('renders absolute asks in Indian grouping', () => {
    expect(formatRecommendationAmount('absolute', 5000)).toBe('₹5,000');
    expect(formatRecommendationAmount('absolute', 150000)).toBe('₹1,50,000');
  });

  it('falls back to an em dash when the ask is unset (edge case)', () => {
    expect(formatRecommendationAmount(null, null)).toBe('—');
    expect(formatRecommendationAmount('percent', null)).toBe('—');
    expect(formatRecommendationAmount(null, 10)).toBe('—');
  });

  it('labels every persisted status (no raw enum leaks to the UI)', () => {
    const all: RecommendationStatus[] = [
      'draft', 'submitted', 'needs_classification', 'approved',
      'approved_modified', 'rejected', 'deferred', 'implemented',
    ];
    for (const s of all) expect(RECOMMENDATION_STATUS_LABEL[s]).toBeTruthy();
  });
});

describe('ADR-226 recommendation queue failure transparency', () => {
  beforeEach(() => rpc.mockReset());

  it('returns imported rows and the server-side total', async () => {
    rpc.mockResolvedValue({ data: [LEGACY_QUEUE_MOCK], error: null });
    const result = await fetchRecommendationQueue({
      cycleId: 'cycle-1', status: 'needs_classification', page: 0, pageSize: 25,
    });
    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(1077);
    expect(result.rows[0].designation_name).toBe('Manager');
  });

  it('propagates an RPC schema failure instead of returning a false empty queue', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('column p.designation_id does not exist') });
    await expect(fetchRecommendationQueue({
      cycleId: 'cycle-1', page: 0, pageSize: 25,
    })).rejects.toThrow('designation_id');
  });
});
