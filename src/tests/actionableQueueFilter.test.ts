import { describe, it, expect } from 'vitest';
import {
  isActionableForReviewer,
  normalizeTeamQueueFilter,
  DEFAULT_TEAM_QUEUE_FILTER,
} from '@/lib/review/actionableQueueFilter';

describe('ADR-348 — actionable queue filter', () => {
  it('treats employees with pending KPIs (badge1 > 0) as actionable', () => {
    expect(isActionableForReviewer({ badge1: 1 })).toBe(true);
    expect(isActionableForReviewer({ badge1: 7 })).toBe(true);
  });

  it('hides fully reviewed / no-pending employees by default', () => {
    expect(isActionableForReviewer({ badge1: 0 })).toBe(false);
  });

  it('hides employees with no KPI stats at all', () => {
    expect(isActionableForReviewer(undefined)).toBe(false);
    expect(isActionableForReviewer(null)).toBe(false);
  });

  it('defaults the queue filter to actionable', () => {
    expect(DEFAULT_TEAM_QUEUE_FILTER).toBe('actionable');
    expect(normalizeTeamQueueFilter(null)).toBe('actionable');
    expect(normalizeTeamQueueFilter(undefined)).toBe('actionable');
    expect(normalizeTeamQueueFilter('')).toBe('actionable');
  });

  it('recognizes the explicit "all" override and rejects unknown values', () => {
    expect(normalizeTeamQueueFilter('all')).toBe('all');
    expect(normalizeTeamQueueFilter('bogus')).toBe('actionable');
  });
});
