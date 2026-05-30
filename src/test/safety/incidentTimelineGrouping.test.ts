import { describe, it, expect } from 'vitest';
import {
  groupTimelineByDay,
  isGroupCollapsedByDefault,
} from '@/lib/incidentTimelineGrouping';
import type { TimelineRow } from '@/hooks/useSafetyIncidentDetail';

function row(id: string, iso: string, to: TimelineRow['to_status'] = 'investigation'): TimelineRow {
  return {
    id,
    incident_id: 'i1',
    from_status: null,
    to_status: to,
    changed_by: null,
    notes: null,
    created_at: iso,
  };
}

describe('groupTimelineByDay', () => {
  it('returns [] for empty input', () => {
    expect(groupTimelineByDay([])).toEqual([]);
  });

  it('groups multiple rows in the same day into one bucket preserving order', () => {
    const r1 = row('a', '2026-05-30T09:00:00Z');
    const r2 = row('b', '2026-05-30T10:00:00Z');
    const r3 = row('c', '2026-05-30T11:00:00Z');
    const out = groupTimelineByDay([r1, r2, r3]);
    expect(out).toHaveLength(1);
    expect(out[0].rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('separates distinct days into ordered buckets (oldest first)', () => {
    const r1 = row('a', '2026-05-28T09:00:00Z');
    const r2 = row('b', '2026-05-30T09:00:00Z');
    const r3 = row('c', '2026-05-29T09:00:00Z');
    const out = groupTimelineByDay([r1, r2, r3]);
    expect(out.map((g) => g.dayKey)).toEqual(
      [r1, r3, r2].map((r) => {
        const d = new Date(r.created_at);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }),
    );
  });

  it('mixed event types still bucket by day', () => {
    const r1 = row('a', '2026-05-30T08:00:00Z', 'reported');
    const r2 = row('b', '2026-05-30T09:00:00Z', 'assigned');
    const r3 = row('c', '2026-05-31T08:00:00Z', 'investigation');
    const out = groupTimelineByDay([r1, r2, r3]);
    expect(out).toHaveLength(2);
    expect(out[0].rows).toHaveLength(2);
    expect(out[1].rows).toHaveLength(1);
  });

  it('handles DST/timezone boundary without crashing', () => {
    // Late-night UTC may fall on different local day; key is "doesn't throw".
    const r1 = row('a', '2026-03-29T01:30:00Z');
    const r2 = row('b', '2026-03-29T02:30:00Z');
    const out = groupTimelineByDay([r1, r2]);
    expect(out.length).toBeGreaterThanOrEqual(1);
  });
});

describe('isGroupCollapsedByDefault', () => {
  it('collapses groups older than the threshold', () => {
    const now = new Date('2026-06-10T00:00:00Z');
    const old = groupTimelineByDay([row('x', '2026-05-01T00:00:00Z')])[0];
    const recent = groupTimelineByDay([row('y', '2026-06-09T00:00:00Z')])[0];
    expect(isGroupCollapsedByDefault(old, now)).toBe(true);
    expect(isGroupCollapsedByDefault(recent, now)).toBe(false);
  });
});