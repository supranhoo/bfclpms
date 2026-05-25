import { describe, it, expect } from 'vitest';
import { groupTimelineEvents, type TimelineLog } from './timelineGrouping';

const ANKIT = '11111111-1111-1111-1111-111111111111';

function mk(
  id: string,
  action: string,
  created_at: string,
  metadata: Record<string, unknown> | null = null,
  performed_by: string | null = ANKIT,
): TimelineLog {
  return { id, action, created_at, metadata, performed_by };
}

describe('groupTimelineEvents', () => {
  it('collapses the RCA cascade (5 rows from one Bulk HR PMS sign-off) into one group', () => {
    // Order matches DB DESC fetch (most recent first); all share the same TS+performer.
    const ts = '2026-05-25T11:34:18.111723+00:00';
    const logs = [
      mk('1', 'SUBMISSION_SCORE_CHANGED', ts, { source: 'safety_net_trigger' }),
      mk('2', 'BULK_STAGE_SIGNOFF_HR_PMS', ts, { batch_id: 'b1' }),
      mk('3', 'STATUS_TRANSITION', ts),
      mk('4', 'SUBMISSION_SCORE_CHANGED', ts, { source: 'safety_net_trigger' }),
      mk('5', 'RECONCILE_STATUS', ts, { tool: 'reconcile_workflow_statuses' }),
    ];
    const groups = groupTimelineEvents(logs);
    expect(groups).toHaveLength(1);
    expect(groups[0].parent.action).toBe('BULK_STAGE_SIGNOFF_HR_PMS');
    expect(groups[0].children.map((c) => c.id)).toEqual(['1', '3', '4', '5']);
  });

  it('keeps lone human action as its own group with no children', () => {
    const logs = [mk('1', 'SELF_REVIEW_SUBMITTED', '2026-05-01T10:00:00+00:00')];
    const groups = groupTimelineEvents(logs);
    expect(groups).toHaveLength(1);
    expect(groups[0].children).toHaveLength(0);
  });

  it('splits two cascades that occurred at different seconds', () => {
    const logs = [
      mk('a1', 'BULK_STAGE_SIGNOFF_MANAGER', '2026-05-25T11:34:18+00:00'),
      mk('a2', 'STATUS_TRANSITION', '2026-05-25T11:34:18+00:00'),
      mk('b1', 'BULK_STAGE_SIGNOFF_HR_PMS', '2026-05-25T11:34:25+00:00'),
      mk('b2', 'STATUS_TRANSITION', '2026-05-25T11:34:25+00:00'),
    ];
    const groups = groupTimelineEvents(logs);
    expect(groups).toHaveLength(2);
    expect(groups[0].parent.id).toBe('a1');
    expect(groups[0].children.map((c) => c.id)).toEqual(['a2']);
    expect(groups[1].parent.id).toBe('b1');
    expect(groups[1].children.map((c) => c.id)).toEqual(['b2']);
  });

  it('promotes orphan RECONCILE_STATUS to parent when no human row exists in the bucket', () => {
    const ts = '2026-05-25T11:34:18+00:00';
    const logs = [
      mk('1', 'STATUS_TRANSITION', ts),
      mk('2', 'RECONCILE_STATUS', ts),
    ];
    const groups = groupTimelineEvents(logs);
    expect(groups).toHaveLength(1);
    expect(groups[0].parent.action).toBe('RECONCILE_STATUS');
    expect(groups[0].children.map((c) => c.action)).toEqual(['STATUS_TRANSITION']);
  });

  it('does not collapse rows from different performers even at the same second', () => {
    const ts = '2026-05-25T11:34:18+00:00';
    const logs = [
      mk('1', 'BULK_STAGE_SIGNOFF_HR_PMS', ts, null, ANKIT),
      mk('2', 'BULK_STAGE_SIGNOFF_MANAGER', ts, null, '99999999-9999-9999-9999-999999999999'),
    ];
    const groups = groupTimelineEvents(logs);
    expect(groups).toHaveLength(2);
  });

  it('treats SUBMISSION_SCORE_CHANGED as a human action when not from safety_net_trigger', () => {
    const logs = [
      mk('1', 'SUBMISSION_SCORE_CHANGED', '2026-05-25T11:34:18+00:00', { source: 'manual' }),
    ];
    const groups = groupTimelineEvents(logs);
    expect(groups).toHaveLength(1);
    // Falls through to first-row fallback parent; the row itself remains visible.
    expect(groups[0].parent.id).toBe('1');
    expect(groups[0].children).toHaveLength(0);
  });
});
