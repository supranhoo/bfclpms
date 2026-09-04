import { describe, it, expect } from 'vitest';
import {
  isActionableForReviewer,
  hasAssignedKras,
  normalizeTeamQueueFilter,
  DEFAULT_TEAM_QUEUE_FILTER,
} from '@/lib/review/actionableQueueFilter';

describe('ADR-348/359 — team queue filters', () => {
  it('treats employees with pending KPIs (badge1 > 0) as actionable', () => {
    expect(isActionableForReviewer({ badge1: 1 })).toBe(true);
    expect(isActionableForReviewer({ badge1: 7 })).toBe(true);
  });

  it('marks fully reviewed / no-pending employees as not actionable', () => {
    expect(isActionableForReviewer({ badge1: 0 })).toBe(false);
    expect(isActionableForReviewer(undefined)).toBe(false);
    expect(isActionableForReviewer(null)).toBe(false);
  });

  it('ADR-359: KRA-Set-only employees are visible under "assigned" but not "actionable"', () => {
    const kraSetOnly = { badge1: 0, total: 12 };
    expect(hasAssignedKras(kraSetOnly)).toBe(true);
    expect(isActionableForReviewer(kraSetOnly)).toBe(false);
  });

  it('ADR-359: employees with no KRAs are hidden under "assigned"', () => {
    expect(hasAssignedKras({ badge1: 0, total: 0 })).toBe(false);
    expect(hasAssignedKras({ badge1: 0 })).toBe(false);
    expect(hasAssignedKras(null)).toBe(false);
  });

  it('defaults the queue filter to assigned', () => {
    expect(DEFAULT_TEAM_QUEUE_FILTER).toBe('assigned');
    expect(normalizeTeamQueueFilter(null)).toBe('assigned');
    expect(normalizeTeamQueueFilter(undefined)).toBe('assigned');
    expect(normalizeTeamQueueFilter('')).toBe('assigned');
    expect(normalizeTeamQueueFilter('bogus')).toBe('assigned');
  });

  it('keeps the explicit legacy overrides working', () => {
    expect(normalizeTeamQueueFilter('all')).toBe('all');
    expect(normalizeTeamQueueFilter('actionable')).toBe('actionable');
  });
});
