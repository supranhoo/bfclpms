/**
 * v2.66.11.15 — system_settings / menu feature-flag hooks MUST NOT fire
 * before AuthContext bootstraps. Pre-auth requests hit PostgREST as the
 * `anon` role; system_settings RLS calls `has_role()` which `anon`
 * cannot execute, surfacing as `permission denied for function has_role`
 * and poisoning downstream queries (Sajid Raza Team Reviews regression).
 *
 * Source-level guard: assert each hook still carries `enabled: isReady`
 * (and the matching useAuth import) so a future refactor cannot silently
 * drop the gate.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (rel: string) =>
  readFileSync(join(process.cwd(), rel), 'utf8');

describe('system_settings hooks — auth-ready gate', () => {
  it('useEntitlement / useEnforcementPilot are gated on isReady', () => {
    const src = read('src/hooks/useEntitlement.ts');
    expect(src).toMatch(/from\s+['"]@\/contexts\/AuthContext['"]/);
    // Both exported hooks must destructure isReady and pass it as enabled.
    const enabledHits = src.match(/enabled:\s*isReady\b/g) ?? [];
    expect(enabledHits.length).toBeGreaterThanOrEqual(2);
    const isReadyHits = src.match(/const\s*\{\s*isReady\s*\}\s*=\s*useAuth\(\)/g) ?? [];
    expect(isReadyHits.length).toBeGreaterThanOrEqual(2);
  });

  it('useMenuOverridesEnabled is gated on isReady', () => {
    const src = read('src/hooks/useResolvedMenu.ts');
    expect(src).toMatch(/from\s+['"]@\/contexts\/AuthContext['"]/);
    expect(src).toMatch(/const\s*\{\s*isReady\s*\}\s*=\s*useAuth\(\)/);
    expect(src).toMatch(/enabled:\s*isReady\b/);
  });
});