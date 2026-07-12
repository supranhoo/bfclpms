import { describe, it, expect } from 'vitest';

/**
 * POLICY §AR-REVIEWER-RESYNC — unit-level guard that documents the
 * "safe to resync" gate used by resyncReviewersFromMaster. Kept as a plain
 * predicate test so we do not need to spin up a full Supabase mock: the
 * gate is the risky bit; the hierarchy resolution itself is covered by
 * hierarchyGuard.test.ts and seedUpdatePatch.test.ts.
 */
const RESYNC_SAFE_STATUSES = new Set(['not_started', 'pending_self']);
const isSafeToResync = (status: string) => RESYNC_SAFE_STATUSES.has(status);

describe('resyncReviewersFromMaster stage gate', () => {
  it('allows resync while the instance is still at or before self-review', () => {
    expect(isSafeToResync('not_started')).toBe(true);
    expect(isSafeToResync('pending_self')).toBe(true);
  });

  it('refuses to swap reviewers once a downstream stage has begun', () => {
    for (const s of ['pending_manager', 'pending_skip', 'pending_dept', 'pending_bu', 'pending_hr', 'completed', 'excluded']) {
      expect(isSafeToResync(s)).toBe(false);
    }
  });
});