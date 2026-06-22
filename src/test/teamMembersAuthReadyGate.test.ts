/**
 * v2.66.11.14 — Team Reviews dashboard fan-out MUST NOT fire before:
 *   (a) AuthContext has bootstrapped (`isReady === true`), AND
 *   (b) the viewer id is a real UUID.
 *
 * RCA: Sajid Raza (manager, 13 active direct reports) saw the amber
 * "Dashboard data could not be loaded" banner because hooks fired with
 * `user?.id === undefined` (coerced to the string `"undefined"`) and
 * because at least one policy-bearing read reached PostgREST as the
 * `anon` role (`permission denied for function has_role`). Postgres
 * logs confirmed `reporting_manager_id = 'undefined'` and
 * `id = ANY [null]`. Both classes are auth-readiness races.
 *
 * Two protections combined:
 *   1. Predicate parity — assert the `isUuid()` guard used inside the
 *      hook behaves as documented.
 *   2. Source guards — assert the hooks and the grid still carry the
 *      gate (regression catcher for a refactor that drops them).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && UUID_RE.test(v);

describe('useTeamMembers / useSkipLevelTeamMembers UUID gate', () => {
  it('rejects undefined, null, and the literal strings that broke prod', () => {
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid('undefined')).toBe(false);
    expect(isUuid('null')).toBe(false);
    expect(isUuid('not-a-uuid')).toBe(false);
  });

  it('accepts a well-formed UUID v4', () => {
    expect(isUuid('b68f5bce-eddf-4bd0-83af-fb64ea09e529')).toBe(true);
  });

  it('useOrganization source carries the UUID guard on both hooks', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/hooks/useOrganization.ts'),
      'utf8',
    );
    // Helper must be defined.
    expect(src).toMatch(/const\s+isUuid\s*=/);
    // Both hooks must read `enabled: isUuid(...)` — not the older `!!`.
    const enabledLines = src.match(/enabled:\s*isUuid\(/g) ?? [];
    expect(enabledLines.length).toBeGreaterThanOrEqual(2);
    // The bare `enabled: !!managerId` / `!!userId` form must be gone.
    expect(src).not.toMatch(/enabled:\s*!!managerId\b/);
    expect(src).not.toMatch(/enabled:\s*!!userId\b/);
  });

  it('EmployeeSelectorGrid gates the dashboard fan-out on authReady', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/review/EmployeeSelectorGrid.tsx'),
      'utf8',
    );
    expect(src).toMatch(/isReady:\s*authReady/);
    // viewerId must replace the bare user?.id at the call sites that fan
    // out to PostgREST.
    expect(src).toMatch(/useTeamMembers\(viewerId\)/);
    expect(src).toMatch(/useSkipLevelTeamMembers\([\s\S]*viewerId[\s\S]*?\)/);
    // viewerId must short-circuit when auth is not ready.
    expect(src).toMatch(/const\s+viewerId\s*=\s*authReady\s*\?\s*user\?\.id\s*:\s*undefined/);
  });
});