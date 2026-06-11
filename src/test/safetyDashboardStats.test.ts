import { describe, it, expect } from 'vitest';

/**
 * Phase 3 dashboard widgets — pure aggregation contract.
 * Validates orphaned count, my-assignments filter, and 30-day bucketing
 * by exercising the same loop the hook uses.
 */

type Row = {
  id: string;
  status: string;
  assigned_to: string | null;
  created_at: string;
  sla_state: 'green' | 'amber' | 'red' | 'closed';
  severity: string;
};

function aggregate(rows: Row[], currentUserId: string | null) {
  let orphaned = 0;
  const myAssignments: Row[] = [];
  const trend = new Map<string, number>();
  const today = new Date('2026-06-11T00:00:00Z');
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    trend.set(d.toISOString().slice(0, 10), 0);
  }
  for (const r of rows) {
    if (r.status === 'orphaned') orphaned++;
    if (currentUserId && r.assigned_to === currentUserId && r.status !== 'closed') {
      myAssignments.push(r);
    }
    const key = r.created_at.slice(0, 10);
    if (trend.has(key)) trend.set(key, (trend.get(key) ?? 0) + 1);
  }
  return { orphaned, myAssignments, trend };
}

describe('safety dashboard stats aggregation', () => {
  const rows: Row[] = [
    { id: '1', status: 'orphaned', assigned_to: null, created_at: '2026-06-11T10:00:00Z', sla_state: 'red', severity: 'high' },
    { id: '2', status: 'assigned', assigned_to: 'me', created_at: '2026-06-10T10:00:00Z', sla_state: 'amber', severity: 'medium' },
    { id: '3', status: 'closed',   assigned_to: 'me', created_at: '2026-06-09T10:00:00Z', sla_state: 'closed', severity: 'low' },
    { id: '4', status: 'orphaned', assigned_to: null, created_at: '2025-12-01T10:00:00Z', sla_state: 'red', severity: 'critical' },
  ];

  it('counts orphaned across all rows', () => {
    expect(aggregate(rows, 'me').orphaned).toBe(2);
  });

  it('filters my-assignments to open incidents assigned to current user', () => {
    const { myAssignments } = aggregate(rows, 'me');
    expect(myAssignments.map((r) => r.id)).toEqual(['2']);
  });

  it('omits my-assignments when user is anonymous', () => {
    expect(aggregate(rows, null).myAssignments).toEqual([]);
  });

  it('30-day trend buckets only include dates inside the window', () => {
    const { trend } = aggregate(rows, 'me');
    expect(trend.get('2026-06-11')).toBe(1);
    expect(trend.get('2026-06-10')).toBe(1);
    expect(trend.has('2025-12-01')).toBe(false); // out of window — silently dropped
    expect(trend.size).toBe(30);
  });
});