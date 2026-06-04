/**
 * CAPA invariant I1 — `menu_overrides_enabled=false` ⇒ hardcoded baseline
 * sidebar groups render for every authenticated role.
 *
 * Strategy: source-guard (matches the established
 * `employeeFilterOptionsAuthGate.test.ts` pattern) over the static menu
 * definitions in AppSidebar.tsx. A full <AppSidebar/> render requires
 * mocking AuthContext + react-query + Supabase chains + sidebar provider;
 * that is high-cost and brittle. The guards below prove the baseline
 * cannot disappear when the master switch is off.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SIDEBAR_SRC = readFileSync(
  join(process.cwd(), 'src/components/layout/AppSidebar.tsx'),
  'utf8',
);

// Real labels rendered by AppSidebar (verified against current component).
// Per the close-out caution: "KRA Settings" and "Administration" are the
// real labels — not "KRA Settings parent" or "Admin".
const BASELINE_GROUP_LABELS = [
  'Main',
  'Manager',
  'Management',
  'HR PMS',
  'Audit',
  'Data Entry',
  'KRA Settings',
  'Incentive',
  'Administration',
  'Reports',
];

describe('CAPA I1 — sidebar baseline cannot be empty when overrides flag is off', () => {
  it('AppSidebar source declares every baseline group label', () => {
    for (const label of BASELINE_GROUP_LABELS) {
      expect(SIDEBAR_SRC).toContain(`label="${label}"`);
    }
  });

  it('resolveGroupItems returns the static fallback when overridesEnabled === false', () => {
    expect(SIDEBAR_SRC).toMatch(/overridesEnabled\s*===\s*false[\s\S]{0,200}return\s+fallback/);
  });

  it('admin baseline includes the core admin menu items', () => {
    const adminBlock = SIDEBAR_SRC.match(/admin:\s*\[([\s\S]*?)\],\s*incentive:/);
    expect(adminBlock).not.toBeNull();
    const body = adminBlock![1];
    for (const t of ['Admin Dashboard', 'User Management', 'System Settings']) {
      expect(body).toContain(`title: '${t}'`);
    }
  });

  it('main baseline includes Dashboard + Inbox for every role', () => {
    const mainBlock = SIDEBAR_SRC.match(/main:\s*\[([\s\S]*?)\],\s*manager:/);
    expect(mainBlock).not.toBeNull();
    const body = mainBlock![1];
    expect(body).toContain("title: 'My Dashboard'");
    expect(body).toContain("title: 'Inbox'");
  });
});