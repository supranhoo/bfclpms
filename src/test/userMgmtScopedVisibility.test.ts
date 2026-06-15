/**
 * Regression test for the User Management blank-roster bug
 * (Avinash 101732 → 102028 invisible).
 *
 * Locks two invariants:
 *  1. AuthContext's post-auth-ready invalidation includes
 *     `my-visible-employee-ids` so the access-profile scoped roster cannot
 *     stay stuck on a pre-auth empty result.
 *  2. UserManagement gates the GLOBAL profile head-count stats query on
 *     `viewerIsAdmin` so scoped (non-admin) viewers never see the
 *     misleading "Total 2571 / Showing 0 of 0" combination.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..', '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

describe('User Management scoped visibility recovery', () => {
  it('AuthContext invalidates my-visible-employee-ids on auth ready', () => {
    const src = read('src/contexts/AuthContext.tsx');
    expect(src).toMatch(/queryKey:\s*\[['"]my-visible-employee-ids['"]\]/);
  });

  it('UserManagement stats query is gated on viewerIsAdmin', () => {
    const src = read('src/pages/admin/UserManagement.tsx');
    // The user-mgmt-stats query must be admin-only so scoped users do not
    // get a global head-count next to a scoped table.
    const statsBlock = src.match(/queryKey:\s*\[['"]user-mgmt-stats['"]\][\s\S]{0,400}/);
    expect(statsBlock, 'user-mgmt-stats block not found').toBeTruthy();
    expect(statsBlock![0]).toMatch(/enabled:\s*viewerIsAdmin/);
  });

  it('UserManagement has a roster-recovery effect for scoped viewers', () => {
    const src = read('src/pages/admin/UserManagement.tsx');
    // Must refetch the `profiles` cache when the visibility set says rows
    // exist but the cached roster is empty.
    expect(src).toMatch(
      /invalidateQueries\(\{\s*queryKey:\s*\[['"]profiles['"]\]\s*\}\)/,
    );
  });
});