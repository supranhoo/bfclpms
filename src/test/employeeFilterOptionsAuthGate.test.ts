/**
 * v2.66.11.18 — Manager / Designation / Grade pickers in
 * `useEmployeeFilterOptions` MUST gate their React Query `enabled` flag on
 * `isReady && !!user` (mem://architecture/auth-readiness-query-gate,
 * ADR-052 / POLICY §96).
 *
 * Without this gate the queries fire before Supabase rehydrates the
 * session, RLS returns 0 rows, and the picker (e.g. the Manager dropdown
 * on HR PMS Review) caches an empty list — producing the bug Vivek
 * reported on 2026-05-19 where the Manager filter showed only "— None —"
 * despite 2,516 of 2,538 active profiles having a reporting_manager_id.
 *
 * Two protections combined:
 *   1. Predicate parity — assert the gate formula behaves as documented.
 *   2. Source guard — assert the hook source actually carries the gate
 *      (catches a refactor that drops `enabled: isReady && !!user`).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function isPickerEnabled(isReady: boolean, user: { id: string } | null, extra: boolean = true) {
  return extra && isReady && !!user;
}

describe('useEmployeeFilterOptions auth-readiness gate (v2.66.11.18)', () => {
  it('blocks queries before auth bootstrap completes', () => {
    expect(isPickerEnabled(false, null)).toBe(false);
    expect(isPickerEnabled(false, { id: 'u1' })).toBe(false);
  });

  it('blocks queries when auth is ready but no user is present', () => {
    expect(isPickerEnabled(true, null)).toBe(false);
  });

  it('allows queries only once auth is ready AND a user is signed in', () => {
    expect(isPickerEnabled(true, { id: 'u1' })).toBe(true);
  });

  it('still honors per-query extra gate (e.g. enabledGrades=false)', () => {
    expect(isPickerEnabled(true, { id: 'u1' }, false)).toBe(false);
    expect(isPickerEnabled(true, { id: 'u1' }, true)).toBe(true);
  });

  it('hook source still imports useAuth and carries the gate (regression guard)', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/hooks/useEmployeeFilterOptions.ts'),
      'utf8',
    );
    expect(src).toMatch(/from\s+['"]@\/contexts\/AuthContext['"]/);
    expect(src).toMatch(/useAuth\(\)/);
    // Each of the three picker queries must include the gate.
    const gateMatches = src.match(/isReady\s*&&\s*!!user/g) ?? [];
    expect(gateMatches.length).toBeGreaterThanOrEqual(3);
  });
});
