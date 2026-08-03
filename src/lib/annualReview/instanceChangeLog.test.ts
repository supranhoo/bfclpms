import { describe, expect, it } from 'vitest';
import {
  actorLabel, eventTypeLabel, formatChange, formatChangeTimestamp, sortChangeLog,
  type InstanceChangeLogRow,
} from './instanceChangeLog';

const row = (o: Partial<InstanceChangeLogRow>): InstanceChangeLogRow => ({
  occurred_at: '2026-07-01T10:00:00Z',
  event_type: 'calibration',
  field_label: 'Final rating calibrated',
  old_value: null,
  new_value: null,
  actor_id: null,
  actor_name: null,
  reason: null,
  total_count: 1,
  ...o,
});

describe('instanceChangeLog', () => {
  it('labels known and unknown event types', () => {
    expect(eventTypeLabel('exemption')).toBe('Exemption');
    expect(eventTypeLabel('system_score')).toBe('System score');
    expect(eventTypeLabel('whatever')).toBe('Change');
  });

  it('falls back to "System" when no actor is recorded', () => {
    expect(actorLabel(row({ actor_id: null, actor_name: null }))).toBe('System');
    expect(actorLabel(row({ actor_id: 'u1', actor_name: 'Asha' }))).toBe('Asha');
    expect(actorLabel(row({ actor_id: 'u1', actor_name: '  ' }))).toBe('Unknown user');
  });

  it('formats old -> new transitions, including one-sided ones', () => {
    expect(formatChange(row({ old_value: '3.50', new_value: '4.00' }))).toBe('3.50 → 4.00');
    expect(formatChange(row({ old_value: null, new_value: 'approved' }))).toBe('approved');
    expect(formatChange(row({ old_value: '4.00', new_value: null }))).toBe('4.00 → —');
    expect(formatChange(row({}))).toBe('—');
  });

  it('preserves legitimate numeric values verbatim', () => {
    expect(formatChange(row({ old_value: null, new_value: '18' }))).toBe('18');
  });

  it('sorts newest first and breaks ties deterministically', () => {
    const rows = [
      row({ occurred_at: '2026-07-01T10:00:00Z', field_label: 'B' }),
      row({ occurred_at: '2026-07-05T10:00:00Z', field_label: 'C' }),
      row({ occurred_at: '2026-07-01T10:00:00Z', field_label: 'A' }),
    ];
    expect(sortChangeLog(rows).map((r) => r.field_label)).toEqual(['C', 'A', 'B']);
  });

  it('renders an em dash for an invalid timestamp', () => {
    expect(formatChangeTimestamp('not-a-date')).toBe('—');
    expect(formatChangeTimestamp('2026-07-01T10:00:00Z')).not.toBe('—');
  });
});
