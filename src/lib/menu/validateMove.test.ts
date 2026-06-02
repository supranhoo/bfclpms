import { describe, it, expect } from 'vitest';
import { validateMove, MAX_MENU_DEPTH } from './validateMove';
import type { MenuRegistryRow, ResolvedMenuNode } from './types';

function reg(over: Partial<MenuRegistryRow>): MenuRegistryRow {
  return {
    menu_key: 'x',
    default_label: 'X',
    module_key: 'pms',
    default_parent_key: 'group-reports',
    menu_level: 2,
    route_path: null,
    icon_name: null,
    default_sort_order: 10,
    accepts_children: true,
    is_renamable: true,
    is_movable: true,
    is_cross_app_movable: false,
    is_system_required: false,
    feature_key: null,
    permission_key: 'x',
    ...over,
  };
}

function node(r: MenuRegistryRow, over: Partial<ResolvedMenuNode> = {}): ResolvedMenuNode {
  return {
    menu_key: r.menu_key,
    label: r.default_label,
    parent_key: r.default_parent_key,
    sort_order: r.default_sort_order,
    module_key: r.module_key,
    menu_level: r.menu_level,
    route_path: r.route_path,
    icon_name: r.icon_name,
    accepts_children: r.accepts_children,
    is_renamable: r.is_renamable,
    is_movable: r.is_movable,
    is_cross_app_movable: r.is_cross_app_movable,
    is_system_required: r.is_system_required,
    is_overridden: false,
    ...over,
  };
}

describe('validateMove — universal nesting', () => {
  const groupMain   = reg({ menu_key: 'group-main',   menu_level: 1, default_parent_key: null, is_movable: false, is_system_required: true });
  const groupAdmin  = reg({ menu_key: 'group-admin',  menu_level: 1, default_parent_key: null, is_movable: false, is_system_required: true });
  const adminDash   = reg({ menu_key: 'admin-dashboard', menu_level: 2, default_parent_key: 'group-admin', accepts_children: true });
  const perfReport  = reg({ menu_key: 'reports-perf', menu_level: 2, default_parent_key: 'group-reports', accepts_children: true });
  const leafSubtab  = reg({ menu_key: 'org-tab-divisions', menu_level: 4, default_parent_key: 'admin-settings-organization', accepts_children: false });
  const lockedItem  = reg({ menu_key: 'dashboard', menu_level: 2, is_movable: false, is_system_required: true });

  const registry = Object.fromEntries(
    [groupMain, groupAdmin, adminDash, perfReport, leafSubtab, lockedItem].map((r) => [r.menu_key, r]),
  );
  const resolved = Object.fromEntries(
    Object.values(registry).map((r) => [r.menu_key, node(r)]),
  );

  it('allows L2 → L3 nesting under an item that accepts children', () => {
    const v = validateMove({ source: perfReport, targetParentKey: 'admin-dashboard', registryByKey: registry, resolvedByKey: resolved });
    expect(v.ok).toBe(true);
  });

  it('allows L3 → L2 (back to a group)', () => {
    const v = validateMove({ source: perfReport, targetParentKey: 'group-main', registryByKey: registry, resolvedByKey: resolved });
    expect(v.ok).toBe(true);
  });

  it('rejects nesting under a leaf', () => {
    const v = validateMove({ source: perfReport, targetParentKey: 'org-tab-divisions', registryByKey: registry, resolvedByKey: resolved });
    expect(v.ok).toBe(false);
  });

  it('rejects depth > MAX_MENU_DEPTH', () => {
    // Build a chain so target parent is already at level MAX_MENU_DEPTH.
    const deepParent = reg({ menu_key: 'deep-parent', menu_level: MAX_MENU_DEPTH as 1|2|3|4, accepts_children: true });
    const reg2 = { ...registry, 'deep-parent': deepParent };
    const res2 = { ...resolved, 'deep-parent': node(deepParent) };
    const v = validateMove({ source: perfReport, targetParentKey: 'deep-parent', registryByKey: reg2, resolvedByKey: res2 });
    expect(v.ok).toBe(false);
    expect(v.ok === false && /too deep/i.test(v.reason)).toBe(true);
  });

  it('rejects cycles', () => {
    // Pretend admin-dashboard is already nested under perfReport (resolved chain).
    const res2 = { ...resolved, 'admin-dashboard': node(adminDash, { parent_key: 'reports-perf' }) };
    const v = validateMove({ source: perfReport, targetParentKey: 'admin-dashboard', registryByKey: registry, resolvedByKey: res2 });
    expect(v.ok).toBe(false);
    expect(v.ok === false && /cycle/i.test(v.reason)).toBe(true);
  });

  it('rejects system-required items', () => {
    const v = validateMove({ source: lockedItem, targetParentKey: 'group-main', registryByKey: registry, resolvedByKey: resolved });
    expect(v.ok).toBe(false);
  });

  it('rejects unknown target parent', () => {
    const v = validateMove({ source: perfReport, targetParentKey: 'does-not-exist', registryByKey: registry, resolvedByKey: resolved });
    expect(v.ok).toBe(false);
  });

  it('rejects cross-app moves when not allowed', () => {
    const otherApp = reg({ menu_key: 'safety-home', module_key: 'safety', menu_level: 2, accepts_children: true });
    const reg2 = { ...registry, 'safety-home': otherApp };
    const res2 = { ...resolved, 'safety-home': node(otherApp) };
    const v = validateMove({ source: perfReport, targetParentKey: 'safety-home', registryByKey: reg2, resolvedByKey: res2 });
    expect(v.ok).toBe(false);
  });
});