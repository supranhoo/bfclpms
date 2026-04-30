/**
 * IAC Phase 2 behavior contract (mock-based).
 *
 * The real has_role/has_safety_role functions live in Postgres. This
 * test pins the OR-shim contract so any future rewrite preserves both
 * sources of truth.
 */
import { describe, it, expect } from 'vitest';

function hasRoleShim(uid: string, role: string, opts: {
  legacy: Set<string>;        // "uid:role" pairs in user_roles
  iac: Set<string>;           // "uid:iac_code" pairs from active assignments
  enumToCode: Record<string, string>;
}) {
  if (opts.legacy.has(`${uid}:${role}`)) return true;
  const code = opts.enumToCode[role];
  return !!code && opts.iac.has(`${uid}:${code}`);
}

const enumToCode = {
  admin: 'pms_admin',
  manager: 'pms_manager',
  employee: 'pms_employee',
  auditor: 'pms_auditor',
  management: 'pms_management',
  hr_pms: 'pms_hr',
  skip_level: 'pms_skip_level',
};

describe('IAC Phase 2 — has_role OR-shim', () => {
  it('returns true when only the legacy table grants the role', () => {
    expect(
      hasRoleShim('u1', 'admin', {
        legacy: new Set(['u1:admin']),
        iac: new Set(),
        enumToCode,
      }),
    ).toBe(true);
  });

  it('returns true when only the new IAC table grants the role', () => {
    expect(
      hasRoleShim('u1', 'admin', {
        legacy: new Set(),
        iac: new Set(['u1:pms_admin']),
        enumToCode,
      }),
    ).toBe(true);
  });

  it('returns false when neither source grants the role', () => {
    expect(
      hasRoleShim('u1', 'admin', { legacy: new Set(), iac: new Set(), enumToCode }),
    ).toBe(false);
  });

  it('rejects an unmapped role even if a legacy ghost exists for someone else', () => {
    expect(
      hasRoleShim('u2', 'admin', {
        legacy: new Set(['u1:admin']),
        iac: new Set(),
        enumToCode,
      }),
    ).toBe(false);
  });
});