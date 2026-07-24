import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn().mockResolvedValue({ error: null });
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import { editAnnualReviewWorkflow } from '@/services/annualReview/annualReviewService';

describe('editAnnualReviewWorkflow contract', () => {
  beforeEach(() => rpc.mockClear());

  it('sends canonical stage order + supersede mode', async () => {
    await editAnnualReviewWorkflow({
      instanceId: 'inst-1',
      enabledStages: ['bu_head', 'self', 'manager'] as any,
      reviewerOverrides: { manager: 'user-1' },
      mode: 'supersede',
      reason: 'admin correction – tester',
    });
    expect(rpc).toHaveBeenCalledWith(
      'annual_review_edit_workflow',
      expect.objectContaining({
        p_instance_id: 'inst-1',
        p_enabled_stages: ['self', 'manager', 'bu_head'],
        p_reviewer_overrides: { manager: 'user-1' },
        p_mode: 'supersede',
        p_reason: 'admin correction – tester',
      }),
    );
  });

  it('safe mode with no stage changes still passes {} overrides', async () => {
    await editAnnualReviewWorkflow({
      instanceId: 'inst-2',
      mode: 'safe',
      reason: 'fix',
    });
    expect(rpc).toHaveBeenCalledWith(
      'annual_review_edit_workflow',
      expect.objectContaining({
        p_enabled_stages: null,
        p_reviewer_overrides: {},
        p_mode: 'safe',
      }),
    );
  });
});