import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn().mockResolvedValue({ data: 'audit-123', error: null });
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import {
  transferAnnualReviewStage,
  revertStageTransfer,
} from '@/services/annualReview/annualReviewService';

describe('ADR-169 transferAnnualReviewStage contract', () => {
  beforeEach(() => rpc.mockClear());

  it('sends canonical arguments to transfer_annual_review_stage_response', async () => {
    await transferAnnualReviewStage({
      instanceId: 'inst-1',
      fromRole: 'bu_head',
      toRole: 'dept_head',
      newReviewerIdForSourceSlot: 'user-new',
      dropFromStage: true,
      reason: 'BU head reshuffle',
    });
    expect(rpc).toHaveBeenCalledWith(
      'transfer_annual_review_stage_response',
      expect.objectContaining({
        p_instance_id: 'inst-1',
        p_from_role: 'bu_head',
        p_to_role: 'dept_head',
        p_new_reviewer_id: 'user-new',
        p_drop_from_stage: true,
        p_reason: 'BU head reshuffle',
      }),
    );
  });

  it('defaults drop_from_stage=true when omitted', async () => {
    await transferAnnualReviewStage({
      instanceId: 'inst-2',
      fromRole: 'manager',
      toRole: 'skip_manager',
      reason: 'test',
    });
    expect(rpc).toHaveBeenCalledWith(
      'transfer_annual_review_stage_response',
      expect.objectContaining({
        p_new_reviewer_id: null,
        p_drop_from_stage: true,
      }),
    );
  });

  it('revertStageTransfer calls the canonical RPC', async () => {
    await revertStageTransfer('audit-9');
    expect(rpc).toHaveBeenCalledWith('revert_stage_transfer', { p_audit_id: 'audit-9' });
  });
});