/**
 * CAPA tests (2026-06-04) — Menu Setting / Custom Tabs rollout.
 * These guard the baseline access invariants while the roadmap matures.
 * See mem://features/admin/menu-setting-capa for removal criteria.
 */
import { describe, it, expect } from 'vitest';
import { applyOverrides, groupByParent } from '@/lib/menu/applyOverrides';
import type { MenuOverrideRow, MenuRegistryRow } from '@/lib/menu/types';

const baseRegistry: MenuRegistryRow[] = [
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
];

function ov(partial: Partial<MenuOverrideRow>): MenuOverrideRow {
  return {
    id: 'x', menu_key: 'dashboard', client_id: null, custom_label: null,
    custom_parent_key: null, custom_sort_order: null, custom_menu_level: null,
    custom_module_key: null, is_active: true, updated_by: null,
    updated_at: '2026-06-04T00:00:00Z', ...partial,
  };
}

describe('CAPA — applyOverrides resilience', () => {
  it('coerces a dangling override parent_key to the default parent', () => {
    const resolved = applyOverrides(baseRegistry, [
      ov({ menu_key: 'dashboard', custom_parent_key: 'does-not-exist' }),
    ]);
    const d = resolved.find((n) => n.menu_key === 'dashboard')!;
    expect(d.parent_key).toBe('group-main');
    expect(d.is_overridden).toBe(false);
  });

  it('coerces a dangling default parent_key to null (does not crash tree)', () => {
    const reg: MenuRegistryRow[] = [
      { ...baseRegistry[1], default_parent_key: 'ghost-parent' },
    ];
    const resolved = applyOverrides(reg, []);
    expect(resolved[0].parent_key).toBeNull();
    // groupByParent must still build a valid map without throwing.
    const map = groupByParent(resolved);
    expect(map.get(null)?.length).toBe(1);
  });

  it('clamps menu_level into the 1..4 range', () => {
    const resolved = applyOverrides(baseRegistry, [
      ov({ menu_key: 'dashboard', custom_menu_level: 99 }),
    ]);
    expect(resolved.find((n) => n.menu_key === 'dashboard')!.menu_level).toBe(4);
  });

  it('keeps registry items renderable even when every override is malformed', () => {
    const resolved = applyOverrides(baseRegistry, [
      ov({ menu_key: 'dashboard', custom_parent_key: 'nope', custom_menu_level: -5 }),
    ]);
    const d = resolved.find((n) => n.menu_key === 'dashboard')!;
    expect(d.menu_level).toBeGreaterThanOrEqual(1);
    expect(d.menu_level).toBeLessThanOrEqual(4);
    expect(d.parent_key).toBe('group-main');
  });
});