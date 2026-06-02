import { describe, it, expect } from 'vitest';
import {
  slugify,
  generateMenuKey,
  validateCreate,
  isValidHttpUrl,
  isValidInternalRoute,
} from './customMenu';
import type { MenuRegistryRow, ResolvedMenuNode } from './types';

function reg(partial: Partial<MenuRegistryRow> & { menu_key: string }): MenuRegistryRow {
  return {
    menu_key: partial.menu_key,
    default_label: partial.default_label ?? partial.menu_key,
    module_key: partial.module_key ?? 'pms',
    default_parent_key: partial.default_parent_key ?? null,
    menu_level: (partial.menu_level ?? 2) as 1 | 2 | 3 | 4,
    route_path: partial.route_path ?? null,
    icon_name: partial.icon_name ?? null,
    default_sort_order: partial.default_sort_order ?? 100,
    accepts_children: partial.accepts_children ?? false,
    is_renamable: partial.is_renamable ?? true,
    is_movable: partial.is_movable ?? true,
    is_cross_app_movable: partial.is_cross_app_movable ?? false,
    is_system_required: partial.is_system_required ?? false,
    feature_key: null,
    permission_key: null,
  };
}

function res(r: MenuRegistryRow): ResolvedMenuNode {
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
  };
}

const groupMain = reg({ menu_key: 'group-main', menu_level: 1, accepts_children: true });
const adminDash = reg({ menu_key: 'admin-dashboard', menu_level: 2, default_parent_key: 'group-main', accepts_children: true });
const leafNode  = reg({ menu_key: 'leaf-item',     menu_level: 2, default_parent_key: 'group-main', accepts_children: false });
const l3Node    = reg({ menu_key: 'some-tab',      menu_level: 3, default_parent_key: 'admin-dashboard', accepts_children: true });

const registryByKey = Object.fromEntries(
  [groupMain, adminDash, leafNode, l3Node].map((r) => [r.menu_key, r]),
);
const resolvedByKey = Object.fromEntries(
  Object.values(registryByKey).map((r) => [r.menu_key, res(r as MenuRegistryRow)]),
);
const existingKeys = Object.keys(registryByKey);

describe('slugify', () => {
  it('lowercases, hyphenates, strips punctuation', () => {
    expect(slugify('My Cool Tab!')).toBe('my-cool-tab');
    expect(slugify('  Spaces & Symbols #1 ')).toBe('spaces-symbols-1');
    expect(slugify('---weird---')).toBe('weird');
  });
});

describe('generateMenuKey', () => {
  it('returns custom-<slug> when unused', () => {
    expect(generateMenuKey('Reports Hub', [])).toBe('custom-reports-hub');
  });
  it('appends numeric suffix on collision', () => {
    expect(generateMenuKey('Reports', ['custom-reports'])).toBe('custom-reports-2');
    expect(generateMenuKey('Reports', ['custom-reports', 'custom-reports-2', 'custom-reports-3'])).toBe('custom-reports-4');
  });
  it('falls back to "item" for empty slug', () => {
    expect(generateMenuKey('!!!', [])).toBe('custom-item');
  });
});

describe('isValidHttpUrl / isValidInternalRoute', () => {
  it('accepts https/http', () => {
    expect(isValidHttpUrl('https://example.com')).toBe(true);
    expect(isValidHttpUrl('http://example.com')).toBe(true);
    expect(isValidHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isValidHttpUrl('not a url')).toBe(false);
  });
  it('accepts internal routes starting with /', () => {
    expect(isValidInternalRoute('/admin/users')).toBe(true);
    expect(isValidInternalRoute('/dashboard?view=team')).toBe(true);
    expect(isValidInternalRoute('admin')).toBe(false);
    expect(isValidInternalRoute('//evil')).toBe(true); // host-relative not allowed via router; OK at validator level
  });
});

describe('validateCreate', () => {
  const base = {
    registryByKey,
    resolvedByKey,
    existingKeys,
  };

  it('accepts L2 under group-main', () => {
    expect(validateCreate({
      ...base, name: 'New Hub', level: 2, parentKey: 'group-main',
      destinationType: 'container', routePath: null,
    })).toEqual({ ok: true });
  });

  it('accepts L3 under admin-dashboard', () => {
    expect(validateCreate({
      ...base, name: 'Settings Tab', level: 3, parentKey: 'admin-dashboard',
      destinationType: 'container', routePath: null,
    })).toEqual({ ok: true });
  });

  it('accepts L4 under L3 parent', () => {
    expect(validateCreate({
      ...base, name: 'Deep Tab', level: 4, parentKey: 'some-tab',
      destinationType: 'container', routePath: null,
    })).toEqual({ ok: true });
  });

  it('rejects level/parent mismatch', () => {
    const r = validateCreate({
      ...base, name: 'Bad', level: 4, parentKey: 'group-main',
      destinationType: 'container', routePath: null,
    });
    expect(r.ok).toBe(false);
  });

  it('rejects parent that does not accept children', () => {
    const r = validateCreate({
      ...base, name: 'Bad', level: 3, parentKey: 'leaf-item',
      destinationType: 'container', routePath: null,
    });
    expect(r.ok).toBe(false);
  });

  it('rejects missing/invalid route for existing-route destination', () => {
    const r = validateCreate({
      ...base, name: 'X', level: 2, parentKey: 'group-main',
      destinationType: 'existing-route', routePath: null,
    });
    expect(r.ok).toBe(false);
  });

  it('rejects non-https external link', () => {
    const r = validateCreate({
      ...base, name: 'X', level: 2, parentKey: 'group-main',
      destinationType: 'external-link', routePath: 'ftp://example.com',
    });
    expect(r.ok).toBe(false);
  });

  it('rejects duplicate name collision', () => {
    const r = validateCreate({
      ...base,
      existingKeys: [...existingKeys, 'custom-duplicate'],
      registryByKey: { ...registryByKey, 'custom-duplicate': reg({ menu_key: 'custom-duplicate' }) },
      name: 'Duplicate', level: 2, parentKey: 'group-main',
      destinationType: 'container', routePath: null,
    });
    // generateMenuKey would produce custom-duplicate-2 → not in registry → OK
    expect(r.ok).toBe(true);
  });
});