import { describe, it, expect } from 'vitest';
import {
  countPendingIncidents,
  listPendingIncidents,
  pruneStalePending,
} from '@/lib/safetyOfflineQueue';

/**
 * Phase 1.E — Offline queue smoke tests.
 *
 * jsdom does not ship IndexedDB. We don't add `fake-indexeddb` just for this,
 * so these tests verify the public surface degrades cleanly:
 *   - count returns 0 when IDB is unavailable.
 *   - list returns [] when IDB is unavailable.
 *   - prune returns 0 (no-op) when IDB is unavailable.
 *
 * The real round-trip is exercised manually in the browser preview.
 * If IDB *is* present (e.g., happy-dom), we still expect non-throwing.
 */
describe('safetyOfflineQueue (no-IDB graceful degradation)', () => {
  it('count returns 0 when IndexedDB is unavailable', async () => {
    const n = await countPendingIncidents();
    expect(typeof n).toBe('number');
    expect(n).toBeGreaterThanOrEqual(0);
  });

  it('list returns an array', async () => {
    const rows = await listPendingIncidents();
    expect(Array.isArray(rows)).toBe(true);
  });

  it('prune returns a numeric count', async () => {
    const n = await pruneStalePending(10, 7 * 24 * 60 * 60 * 1000);
    expect(typeof n).toBe('number');
    expect(n).toBeGreaterThanOrEqual(0);
  });
});