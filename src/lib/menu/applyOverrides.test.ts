import { describe, it, expect } from 'vitest';
import { applyOverrides, buildLabelMap, groupByParent } from './applyOverrides';
import type { MenuOverrideRow, MenuRegistryRow } from './types';

const registry: MenuRegistryRow[] = [
  {
    menu_key: 'g', default_label: 'Group', module_key: 'pms', default_parent_key: null,
    menu_level: 2, route_path: null, icon_name: null, default_sort_order: 10,
    accepts_children: true, is_renamable: true, is_movable: false,
    is_cross_app_movable: false, is_system_required: true,
    feature_key: null, permission_key: null,
  },
  {
    menu_key: 'a', default_label: 'Alpha', module_key: 'pms', default_parent_key: 'g',
    menu_level: 2, route_path: '/a', icon_name: null, default_sort_order: 20,
    accepts_children: false, is_renamable: true, is_movable: true,
    is_cross_app_movable: false, is_system_required: false,
    feature_key: null, permission_key: 'a',
  },
  {
    menu_key: 'b', default_label: 'Beta', module_key: 'pms', default_parent_key: 'g',
    menu_level: 2, route_path: '/b', icon_name: null, default_sort_order: 10,
    accepts_children: false, is_renamable: true, is_movable: true,
    is_cross_app_movable: false, is_system_required: false,
    feature_key: null, permission_key: 'b',
  },
];

function override(partial: Partial<MenuOverrideRow>): MenuOverrideRow {
  return {
    id: 'x', menu_key: 'a', client_id: null, custom_label: null,
    custom_parent_key: null, custom_sort_order: null, is_active: true,
    custom_menu_level: null, custom_module_key: null,
    updated_by: null, updated_at: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

describe('applyOverrides', () => {
  it('returns defaults when no overrides exist', () => {
    const r = applyOverrides(registry, []);
    expect(r.find((n) => n.menu_key === 'a')?.label).toBe('Alpha');
    expect(r.find((n) => n.menu_key === 'a')?.is_overridden).toBe(false);
  });

  it('applies label override and flags is_overridden', () => {
    const r = applyOverrides(registry, [override({ custom_label: 'Renamed' })]);
    const a = r.find((n) => n.menu_key === 'a')!;
    expect(a.label).toBe('Renamed');
    expect(a.is_overridden).toBe(true);
  });

  it('ignores inactive overrides', () => {
    const r = applyOverrides(registry, [override({ custom_label: 'X', is_active: false })]);
    expect(r.find((n) => n.menu_key === 'a')?.label).toBe('Alpha');
  });

  it('applies custom sort_order and groupByParent sorts ascending', () => {
    const r = applyOverrides(registry, [override({ custom_sort_order: 5 })]);
    const grouped = groupByParent(r);
    const children = grouped.get('g')!.map((n) => n.menu_key);
    expect(children).toEqual(['a', 'b']); // a now 5, b still 10
  });

  it('buildLabelMap returns keyed labels', () => {
    const map = buildLabelMap(applyOverrides(registry, []));
    expect(map['a']).toBe('Alpha');
    expect(map['b']).toBe('Beta');
  });

  it('applies module + level overrides', () => {
    const r = applyOverrides(registry, [
      override({ custom_module_key: 'hrms', custom_menu_level: 3 }),
    ]);
    const a = r.find((n) => n.menu_key === 'a')!;
    expect(a.module_key).toBe('hrms');
    expect(a.menu_level).toBe(3);
    expect(a.is_overridden).toBe(true);
  });
});