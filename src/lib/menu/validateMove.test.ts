import { describe, it, expect } from 'vitest';
import { validateMove } from './validateMove';
import type { MenuRegistryRow, ResolvedMenuNode } from './types';

const mk = (overrides: Partial<MenuRegistryRow>): MenuRegistryRow => ({
  menu_key: 'k', default_label: 'L', module_key: 'pms', default_parent_key: null,
  menu_level: 2, route_path: null, icon_name: null, default_sort_order: 10,
  accepts_children: false, is_renamable: true, is_movable: true,
  is_cross_app_movable: false, is_system_required: false,
  feature_key: null, permission_key: null,
  ...overrides,
});

const resolved = (r: MenuRegistryRow): ResolvedMenuNode => ({
  menu_key: r.menu_key, label: r.default_label, parent_key: r.default_parent_key,
  sort_order: r.default_sort_order, module_key: r.module_key, menu_level: r.menu_level,
  route_path: r.route_path, icon_name: r.icon_name,
  accepts_children: r.accepts_children, is_renamable: r.is_renamable,
  is_movable: r.is_movable, is_cross_app_movable: r.is_cross_app_movable,
  is_system_required: r.is_system_required, is_overridden: false,
});

describe('validateMove', () => {
  const group = mk({ menu_key: 'g', accepts_children: true, is_movable: false, is_system_required: true });
  const other = mk({ menu_key: 'g2', accepts_children: true, is_movable: false, is_system_required: true });
  const leaf = mk({ menu_key: 'l', default_parent_key: 'g' });

  const registryByKey = { g: group, g2: other, l: leaf };
  const resolvedByKey = { g: resolved(group), g2: resolved(other), l: resolved(leaf) };

  it('rejects non-movable source', () => {
    const r = validateMove({ source: mk({ ...leaf, is_movable: false }), targetParentKey: 'g2', registryByKey, resolvedByKey });
    expect(r.ok).toBe(false);
  });

  it('rejects system-required source', () => {
    const r = validateMove({ source: mk({ ...leaf, is_system_required: true }), targetParentKey: 'g2', registryByKey, resolvedByKey });
    expect(r.ok).toBe(false);
  });

  it('rejects target that does not accept children', () => {
    const r = validateMove({ source: leaf, targetParentKey: 'l', registryByKey, resolvedByKey });
    expect(r.ok).toBe(false);
  });

  it('rejects cross-app moves when flag is false', () => {
    const reg = { ...registryByKey, hr: mk({ menu_key: 'hr', module_key: 'hrms', accepts_children: true }) };
    const res = { ...resolvedByKey, hr: resolved(reg.hr) };
    const r = validateMove({ source: leaf, targetParentKey: 'hr', registryByKey: reg, resolvedByKey: res });
    expect(r.ok).toBe(false);
  });

  it('allows cross-app moves when flag is true', () => {
    const reg = { ...registryByKey, hr: mk({ menu_key: 'hr', module_key: 'hrms', accepts_children: true }) };
    const res = { ...resolvedByKey, hr: resolved(reg.hr) };
    const r = validateMove({ source: mk({ ...leaf, is_cross_app_movable: true }), targetParentKey: 'hr', registryByKey: reg, resolvedByKey: res });
    expect(r.ok).toBe(true);
  });

  it('detects cycles via resolved parent chain', () => {
    // l is a child of g; g being moved under l would cycle.
    const movableGroup = mk({ menu_key: 'g', accepts_children: true });
    const reg = { ...registryByKey, g: movableGroup, l: mk({ ...leaf, accepts_children: true }) };
    const res = { ...resolvedByKey, g: resolved(movableGroup), l: resolved(reg.l) };
    const r = validateMove({ source: movableGroup, targetParentKey: 'l', registryByKey: reg, resolvedByKey: res });
    expect(r.ok).toBe(false);
  });

  it('accepts a valid within-module move', () => {
    const r = validateMove({ source: leaf, targetParentKey: 'g2', registryByKey, resolvedByKey });
    expect(r.ok).toBe(true);
  });
});