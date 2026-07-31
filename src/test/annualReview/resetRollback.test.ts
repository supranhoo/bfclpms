import { describe, it, expect } from 'vitest';
import {
  extractArchivedResponses,
  resolveRollbackStatus,
  buildRollbackPlan,
  type ResetArchiveRow,
} from '@/lib/annualReview/resetRollback';

/** ADR-210 — rollback of an erroneous force-reset from `annual_review_reset_archive`. */

const selfResponse = {
  id: 'resp-self',
  instance_id: 'inst-1',
  reviewer_id: 'emp-1',
  reviewer_role: 'self',
  criteria_scores: {},
  qualitative_responses: { f_a: 'answer' },
  evidence: [],
  is_locked: true,
  submitted_at: '2026-07-17T11:34:04.591859+00:00',
};

describe('extractArchivedResponses', () => {
  it('returns the archived response array verbatim', () => {
    expect(extractArchivedResponses([selfResponse])).toEqual([selfResponse]);
  });

  it('ignores legacy archives that stored an instance snapshot object', () => {
    expect(extractArchivedResponses({ overall_status: 'completed' } as never)).toEqual([]);
  });

  it('drops malformed entries', () => {
    expect(extractArchivedResponses([selfResponse, null, { foo: 1 }] as never)).toEqual([selfResponse]);
  });
});

describe('resolveRollbackStatus', () => {
  it('restores the archived prior status when its stage is still enabled', () => {
    expect(resolveRollbackStatus('pending_bu', ['self', 'bu_head'], [selfResponse])).toBe('pending_bu');
  });

  it('never leaves a restored locked self stage at pending_self', () => {
    expect(resolveRollbackStatus(null, ['self', 'bu_head'], [selfResponse])).toBe('pending_bu');
  });

  it('re-anchors when the archived stage is no longer enabled', () => {
    expect(resolveRollbackStatus('pending_dept', ['self', 'bu_head'], [selfResponse])).toBe('pending_bu');
  });

  it('resolves to completed when every enabled stage has a locked response', () => {
    const bu = { ...selfResponse, id: 'resp-bu', reviewer_role: 'bu_head' };
    expect(resolveRollbackStatus('pending_bu', ['self', 'bu_head'], [selfResponse, bu])).toBe('pending_bu');
    expect(resolveRollbackStatus(null, ['self', 'bu_head'], [selfResponse, bu])).toBe('completed');
  });

  it('keeps an archived completed status', () => {
    expect(resolveRollbackStatus('completed', ['self', 'bu_head'], [])).toBe('completed');
  });
});

describe('buildRollbackPlan', () => {
  const archive: ResetArchiveRow = {
    id: 'arc-1',
    instance_id: 'inst-1',
    prior_status: 'pending_bu',
    prior_template_id: 'tpl-old',
    wiped_responses: [selfResponse],
  };

  it('restores responses, prior template and prior status', () => {
    const plan = buildRollbackPlan(archive, ['self', 'bu_head']);
    expect(plan.responses).toEqual([selfResponse]);
    expect(plan.targetTemplateId).toBe('tpl-old');
    expect(plan.targetStatus).toBe('pending_bu');
  });

  it('never rolls back reviewer mappings — newer remaps win', () => {
    expect(buildRollbackPlan(archive, ['self', 'bu_head']).preserveReviewerMappings).toBe(true);
  });
});
