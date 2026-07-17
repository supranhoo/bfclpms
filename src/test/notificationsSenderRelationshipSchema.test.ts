import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Regression guard for the `d.head_id` typo that broke non-admin notification
 * inserts (Ayush's "Add Observation" failure, 2026-07-17).
 *
 * The `can_send_notification_to` SECURITY DEFINER helper runs inside a BEFORE
 * INSERT trigger on `public.notifications`. A wrong column name there causes
 * every authenticated cross-user insert to fail with `42703`, but only for
 * non-admin senders (admin/HR short-circuit earlier in the function), so the
 * regression is easy to miss in manual smoke tests.
 */
describe('can_send_notification_to schema references', () => {
  const dir = resolve(__dirname, '../../supabase/migrations');
  const bodies = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(resolve(dir, f), 'utf8'))
    .filter((b) => b.includes('can_send_notification_to'));

  it('has at least one migration defining the helper', () => {
    expect(bodies.length).toBeGreaterThan(0);
  });

  it('latest definition uses departments.head_user_id, not head_id', () => {
    const latest = bodies[bodies.length - 1];
    expect(latest).toContain('d.head_user_id');
    expect(latest).not.toMatch(/\bd\.head_id\b/);
  });
});
