/**
 * CAPA invariant I3 — `useMenuAccess.canAccess` MUST be fail-open for the
 * baseline menus when `menu_access_config` is empty or failing. Admin
 * must never lose `admin-settings`; every signed-in user must keep
 * Dashboard + Inbox.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(
  join(process.cwd(), 'src/hooks/useMenuAccess.ts'),
  'utf8',
);

describe('CAPA I3 — useMenuAccess fail-open contract', () => {
  it('admin always gets admin-settings even with empty menu_access_config', () => {
    expect(SRC).toMatch(
      /menuKey\s*===\s*'admin-settings'\s*&&\s*effectiveRole\s*===\s*'admin'[\s\S]{0,40}return\s+true/,
    );
  });

  it('every signed-in user gets Dashboard and Inbox via EMPLOYEE_DEFAULT_MENUS', () => {
    expect(SRC).toMatch(/EMPLOYEE_DEFAULT_MENUS\s*=\s*\[\s*'dashboard'\s*,\s*'inbox'\s*\]/);
    expect(SRC).toMatch(
      /user\s*&&\s*EMPLOYEE_DEFAULT_MENUS\.includes\(menuKey\)[\s\S]{0,40}return\s+true/,
    );
  });

  it('DEFAULT_MENU_ROLES preserves admin/auditor baseline keys', () => {
    const block = SRC.match(/DEFAULT_MENU_ROLES[\s\S]*?\};/)![0];
    for (const key of ['dashboard', 'inbox', 'audit-panel', 'admin-settings', 'team-reviews']) {
      expect(block).toContain(`'${key}'`);
    }
    expect(block).toMatch(/'admin-settings':\s*\[\s*'admin'\s*\]/);
  });

  it('admin is the last-resort fallback when no config + no DEFAULT_MENU_ROLES entry', () => {
    expect(SRC).toMatch(/return\s+effectiveRole\s*===\s*'admin'\s*;/);
  });

  it('Priority chain 1..7 is still documented (no priority silently removed)', () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7]) {
      expect(SRC).toMatch(new RegExp(`Priority\\s+${n}`));
    }
  });
});