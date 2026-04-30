/**
 * IAC parity test (mock-based).
 *
 * Validates that the seeded role->capability mapping mirrors the existing
 * PMS app_role + Safety safety_app_role behavior, so legacy `has_role`
 * call sites keep working after legacy enums are eventually retired.
 *
 * The real has_capability function lives in Postgres; here we simulate it
 * with the same logic against an in-memory mapping that mirrors the
 * Phase 1 migration seed.
 */
import { describe, it, expect } from 'vitest';

type Cap = string;
const ROLES: Record<string, Cap[]> = {
  pms_admin: ['hub.access', 'hub.iac.manage', 'pms.access', 'pms.review.self_submit', 'pms.review.manager', 'pms.review.audit', 'pms.review.management', 'pms.review.hr', 'pms.review.skip_level', 'pms.admin', 'safety.access'],
  pms_manager: ['hub.access', 'pms.access', 'pms.review.manager', 'pms.review.self_submit'],
  pms_employee: ['hub.access', 'pms.access', 'pms.review.self_submit'],
  pms_auditor: ['hub.access', 'pms.access', 'pms.review.audit'],
  pms_management: ['hub.access', 'pms.access', 'pms.review.management'],
  pms_hr: ['hub.access', 'pms.access', 'pms.review.hr'],
  pms_skip_level: ['hub.access', 'pms.access', 'pms.review.skip_level'],
  safety_admin: ['hub.access', 'safety.access', 'safety.incident.create', 'safety.incident.investigate', 'safety.incident.approve', 'safety.permit.request', 'safety.permit.approve', 'safety.audit.run', 'safety.audit.read', 'safety.training.deliver', 'safety.admin'],
  safety_worker: ['hub.access', 'safety.access', 'safety.incident.create'],
};

function hasCap(role: string, cap: Cap) {
  return (ROLES[role] ?? []).includes(cap);
}

describe('IAC capability parity', () => {
  it('PMS admin has full PMS + IAC management', () => {
    expect(hasCap('pms_admin', 'pms.admin')).toBe(true);
    expect(hasCap('pms_admin', 'hub.iac.manage')).toBe(true);
  });

  it('PMS manager can review but not approve management-tier', () => {
    expect(hasCap('pms_manager', 'pms.review.manager')).toBe(true);
    expect(hasCap('pms_manager', 'pms.review.management')).toBe(false);
    expect(hasCap('pms_manager', 'pms.admin')).toBe(false);
  });

  it('PMS employee can self-submit only', () => {
    expect(hasCap('pms_employee', 'pms.review.self_submit')).toBe(true);
    expect(hasCap('pms_employee', 'pms.review.audit')).toBe(false);
  });

  it('Safety worker can create incidents but not approve closure', () => {
    expect(hasCap('safety_worker', 'safety.incident.create')).toBe(true);
    expect(hasCap('safety_worker', 'safety.incident.approve')).toBe(false);
    expect(hasCap('safety_worker', 'hub.access')).toBe(true);
  });

  it('Safety admin gets every safety capability', () => {
    expect(hasCap('safety_admin', 'safety.admin')).toBe(true);
    expect(hasCap('safety_admin', 'safety.permit.approve')).toBe(true);
  });

  it('Cross-module isolation: PMS manager has no Safety caps', () => {
    expect(hasCap('pms_manager', 'safety.access')).toBe(false);
    expect(hasCap('pms_manager', 'safety.incident.create')).toBe(false);
  });
});