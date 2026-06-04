/**
 * CAPA invariant I2 (pure-logic supplement) — `applyOverrides` MUST NOT
 * throw on a non-existent `menu_key` in `menu_overrides` AND MUST NOT
 * drop nodes from the resolved tree.
 */
import { describe, it, expect } from 'vitest';
import { applyOverrides, groupByParent } from '@/lib/menu/applyOverrides';
import type { MenuOverrideRow, MenuRegistryRow } from '@/lib/menu/types';

const registry: MenuRegistryRow[] = [
  {
    menu_key: 'group-main', default_label: 'Main', module_key: 'pms',
    default_parent_key: null, menu_level: 2, route_path: null, icon_name: null,
    default_sort_order: 10, accepts_children: true, is_renamable: true,
    is_movable: false, is_cross_app_movable: false, is_system_required: true,
    feature_key: null, permission_key: null,
  },
  {
    menu_key: 'dashboard', default_label: 'My Dashboard', module_key: 'pms',
    default_parent_key: 'group-main', menu_level: 2, route_path: '/dashboard',
    icon_name: 'Home', default_sort_order: 10, accepts_children: false,
    is_renamable: true, is_movable: true, is_cross_app_movable: false,
    is_system_required: true, feature_key: null, permission_key: 'dashboard',
  },
  {
    menu_key: 'inbox', default_label: 'Inbox', module_key: 'pms',
    default_parent_key: 'group-main', menu_level: 2, route_path: '/queries',
    icon_name: 'MessageSquare', default_sort_order: 20, accepts_children: false,
    is_renamable: true, is_movable: true, is_cross_app_movable: false,
    is_system_required: true, feature_key: null, permission_key: 'inbox',
  },
];

let _idCounter = 0;
function ov(partial: Partial<MenuOverrideRow>): MenuOverrideRow {
  _idCounter += 1;
  return {
    id: `ov-${_idCounter}`, menu_key: 'dashboard', client_id: null,
    custom_label: null, custom_parent_key: null, custom_sort_order: null,
    custom_menu_level: null, custom_module_key: null, is_active: true,
    updated_by: null, updated_at: '2026-06-04T00:00:00Z', ...partial,
  };
}

describe('CAPA — applyOverrides resilience to malformed override rows', () => {
  it('does not throw when an override targets a non-existent menu_key', () => {
    expect(() =>
      applyOverrides(registry, [
        ov({ menu_key: 'ghost-key-does-not-exist', custom_label: 'Ghost' }),
      ]),
    ).not.toThrow();
  });

  it('preserves every registry node when overrides reference unknown keys', () => {
    const resolved = applyOverrides(registry, [
      ov({ menu_key: 'ghost-1', custom_label: 'X' }),
      ov({ menu_key: 'ghost-2', custom_parent_key: 'also-ghost' }),
    ]);
    expect(resolved).toHaveLength(registry.length);
    const keys = new Set(resolved.map((n) => n.menu_key));
    for (const r of registry) expect(keys.has(r.menu_key)).toBe(true);
  });

  it('coerces a dangling override parent to the registry default parent', () => {
    const resolved = applyOverrides(registry, [
      ov({ menu_key: 'dashboard', custom_parent_key: 'does-not-exist' }),
    ]);
    const d = resolved.find((n) => n.menu_key === 'dashboard')!;
    expect(d.parent_key).toBe('group-main');
    expect(d.is_overridden).toBe(false);
  });

  it('groupByParent builds a stable map even with malformed overrides present', () => {
    const resolved = applyOverrides(registry, [
      ov({ menu_key: 'inbox', custom_parent_key: 'nope', custom_menu_level: -10 }),
    ]);
    const map = groupByParent(resolved);
    expect(map.get(null)?.map((n) => n.menu_key)).toContain('group-main');
    expect(map.get('group-main')?.map((n) => n.menu_key).sort()).toEqual(['dashboard', 'inbox']);
  });
});