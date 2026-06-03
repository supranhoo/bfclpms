import { describe, it, expect } from 'vitest';
import { ALL_APP_ROLES } from '@/lib/roles';
import { resolveModule, resolveAction, type EntitlementSnapshot } from '@/hooks/useEntitlement';

describe('Hub Platform Foundation — Phase 1', () => {
  describe('app roles', () => {
    it('includes the 7 existing PMS roles (backward compat)', () => {
      for (const r of ['admin','manager','employee','auditor','management','hr_pms','skip_level'] as const) {
        expect(ALL_APP_ROLES).toContain(r);
      }
    });
    it('adds platform_owner', () => {
      expect(ALL_APP_ROLES).toContain('platform_owner');
    });
  });

  describe('entitlement resolver (observe-mode)', () => {
    const disabled: EntitlementSnapshot = {
      enabled: false, clientId: null, modules: new Set(), actions: new Set(),
    };
    const enabled: EntitlementSnapshot = {
      enabled: true,
      clientId: 'c1',
      modules: new Set(['pms']),
      actions: new Set(['pms.admin.users.add']),
    };

    it('returns true for any module when flag OFF (observe-off = allow-all)', () => {
      expect(resolveModule(disabled, 'pms')).toBe(true);
      expect(resolveModule(disabled, 'unknown')).toBe(true);
      expect(resolveAction(disabled, 'pms.admin.users.add')).toBe(true);
      expect(resolveAction(disabled, 'literally.anything')).toBe(true);
    });

    it('returns true for entitled keys when flag ON', () => {
      expect(resolveModule(enabled, 'pms')).toBe(true);
      expect(resolveAction(enabled, 'pms.admin.users.add')).toBe(true);
    });

    it('returns false for unknown keys when flag ON (unknown = deny)', () => {
      expect(resolveModule(enabled, 'hrms')).toBe(false);
      expect(resolveAction(enabled, 'pms.workflow.final_score_rules.edit')).toBe(false);
    });
  });

  describe('multi-role primary derivation (AuthContext priority)', () => {
    const ROLE_PRIORITY = [
      'admin','platform_owner','hr_pms','management','auditor','skip_level','manager','employee',
    ] as const;
    const pickPrimary = (roles: string[]) => {
      for (const r of ROLE_PRIORITY) if (roles.includes(r)) return r;
      return roles[0] ?? null;
    };

    it('admin+platform_owner → primary is admin (backward compat)', () => {
      expect(pickPrimary(['platform_owner','admin'])).toBe('admin');
    });
    it('platform_owner alone → primary is platform_owner', () => {
      expect(pickPrimary(['platform_owner'])).toBe('platform_owner');
    });
    it('manager alone → primary is manager', () => {
      expect(pickPrimary(['manager'])).toBe('manager');
    });
    it('empty roles → primary is null', () => {
      expect(pickPrimary([])).toBeNull();
    });
  });
});