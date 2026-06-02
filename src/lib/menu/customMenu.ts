/**
 * Custom menu item creation — service + pure helpers.
 *
 * Custom items live in `menu_registry` with `is_custom = true`. They:
 *   - never collide with seeded keys (pattern: `custom-<slug>[-N]`)
 *   - must be L2, L3, or L4 with a real parent that `accepts_children`
 *   - default to admin-only visibility via `menu_access_config`
 *
 * Validation here mirrors the DB trigger `menu_registry_custom_validate`.
 */
import { supabase } from '@/integrations/supabase/client';
import type { MenuRegistryRow, ResolvedMenuNode } from './types';

export type DestinationType = 'container' | 'existing-route' | 'custom-page' | 'external-link';

export interface CreateCustomMenuInput {
  name: string;
  level: 2 | 3 | 4;
  parentKey: string;
  destinationType: DestinationType;
  routePath: string | null;
  iconName: string | null;
  color: string | null;
  createdBy?: string | null;
}

export type Validation = { ok: true } | { ok: false; reason: string };

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Returns a stable, unique `custom-<slug>[-N]` key not present in existingKeys. */
export function generateMenuKey(name: string, existingKeys: ReadonlyArray<string>): string {
  const slug = slugify(name) || 'item';
  const base = `custom-${slug}`;
  const set = new Set(existingKeys);
  if (!set.has(base)) return base;
  let n = 2;
  while (set.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export function isValidInternalRoute(value: string): boolean {
  return /^\/[A-Za-z0-9/_\-:?&=.]*$/.test(value);
}

export interface ValidateCreateArgs {
  name: string;
  level: number;
  parentKey: string;
  destinationType: DestinationType;
  routePath: string | null;
  registryByKey: Record<string, MenuRegistryRow>;
  resolvedByKey: Record<string, ResolvedMenuNode>;
  existingKeys: ReadonlyArray<string>;
}

export function validateCreate(args: ValidateCreateArgs): Validation {
  const { name, level, parentKey, destinationType, routePath, registryByKey, resolvedByKey, existingKeys } = args;

  if (!name || !name.trim()) return { ok: false, reason: 'Name is required.' };
  if (name.trim().length > 60) return { ok: false, reason: 'Name must be 60 characters or fewer.' };
  if (![2, 3, 4].includes(level)) return { ok: false, reason: 'Level must be 2, 3, or 4.' };
  if (!parentKey) return { ok: false, reason: 'Parent is required.' };

  const parent = registryByKey[parentKey];
  if (!parent) return { ok: false, reason: 'Selected parent does not exist.' };
  if (!parent.accepts_children) return { ok: false, reason: `Parent "${parent.default_label}" cannot contain children.` };

  const parentLevel = resolvedByKey[parentKey]?.menu_level ?? parent.menu_level;
  if (parentLevel + 1 !== level) {
    return { ok: false, reason: `Level ${level} requires a level-${level - 1} parent (selected is level ${parentLevel}).` };
  }
  if (level > 4) return { ok: false, reason: 'Nesting too deep (max 4 levels).' };

  // Route validation per destination type.
  if (destinationType === 'existing-route') {
    if (!routePath || !isValidInternalRoute(routePath)) {
      return { ok: false, reason: 'Pick a valid existing route.' };
    }
  } else if (destinationType === 'external-link') {
    if (!routePath || !isValidHttpUrl(routePath)) {
      return { ok: false, reason: 'Enter a valid https:// URL.' };
    }
  }

  // Prevent collisions even before key generation.
  const candidate = generateMenuKey(name, existingKeys);
  if (registryByKey[candidate]) {
    return { ok: false, reason: 'A menu item with this name already exists.' };
  }

  return { ok: true };
}

export interface CreateResult {
  menuKey: string;
}

/**
 * Creates the registry row and a default admin-only access row. Caller is
 * responsible for invalidating react-query caches afterwards.
 */
export async function createCustomMenuItem(
  input: CreateCustomMenuInput,
  existingKeys: ReadonlyArray<string>,
): Promise<CreateResult> {
  const menuKey = generateMenuKey(input.name, existingKeys);

  let routePath: string | null = null;
  if (input.destinationType === 'existing-route' || input.destinationType === 'external-link') {
    routePath = input.routePath;
  } else if (input.destinationType === 'custom-page') {
    routePath = `/custom-menu/${menuKey}`;
  }

  const acceptsChildren = input.destinationType === 'container';

  const row: any = {
    menu_key: menuKey,
    default_label: input.name.trim(),
    module_key: 'pms',
    default_parent_key: input.parentKey,
    menu_level: input.level,
    route_path: routePath,
    icon_name: input.iconName,
    default_sort_order: 1000, // appended; admin can re-order via DnD afterwards
    accepts_children: acceptsChildren,
    is_renamable: true,
    is_movable: true,
    is_cross_app_movable: false,
    is_system_required: false,
    feature_key: null,
    permission_key: null,
    is_custom: true,
    color: input.color,
    created_by: input.createdBy ?? null,
  };

  const { error: regErr } = await supabase.from('menu_registry' as any).insert(row);
  if (regErr) throw regErr;

  // Default access: admin-only. Section uses the parent key for grouping.
  const { error: accessErr } = await supabase.from('menu_access_config' as any).upsert(
    {
      menu_key: menuKey,
      menu_name: input.name.trim(),
      section: input.parentKey,
      allowed_roles: ['admin'],
      display_order: 1000,
    },
    { onConflict: 'menu_key' },
  );
  if (accessErr) throw accessErr;

  return { menuKey };
}