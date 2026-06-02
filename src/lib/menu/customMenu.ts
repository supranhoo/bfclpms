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
import { SETTINGS_SECTION_KEY_TO_MENU_KEY } from './catalog';

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

  // Depth = position in the parent_key chain (root = 1). This matches how the
  // sidebar actually nests items and is independent of the historical
  // `menu_level` column (where seeded groups + items can both be level 2).
  const parentDepth = computeDepth(parentKey, registryByKey, resolvedByKey);
  if (parentDepth + 1 !== level) {
    return { ok: false, reason: `Level ${level} requires a depth-${level - 1} parent (selected is depth ${parentDepth}).` };
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

/**
 * Computes the depth of a registry node by walking its `default_parent_key`
 * chain. Root nodes (no parent) have depth 1. Resolved overrides take
 * precedence over default parent. Cycle-safe (cap 10).
 */
export function computeDepth(
  menuKey: string,
  registryByKey: Record<string, MenuRegistryRow>,
  resolvedByKey: Record<string, ResolvedMenuNode>,
): number {
  let depth = 1;
  let current: string | null | undefined = menuKey;
  const seen = new Set<string>();
  for (let i = 0; i < 10 && current; i++) {
    if (seen.has(current)) break;
    seen.add(current);
    const parent =
      resolvedByKey[current]?.parent_key ?? registryByKey[current]?.default_parent_key ?? null;
    if (!parent) return depth;
    depth += 1;
    current = parent;
  }
  return depth;
}

export interface CreateResult {
  menuKey: string;
}

// ---------------------------------------------------------------------------
// Delete — custom menu items only. Guarded both in TS and by DB trigger
// `menu_registry_protect_seeded_delete`. Cleans up access + override + audit.
// ---------------------------------------------------------------------------

export async function deleteCustomMenuItem(
  menuKey: string,
  registryRow: MenuRegistryRow,
  performedBy: string | null,
): Promise<void> {
  if (!registryRow || registryRow.menu_key !== menuKey) {
    throw new Error('Menu item not found.');
  }
  if (!registryRow.is_custom) {
    throw new Error('Only custom menu tabs can be deleted.');
  }
  if (registryRow.is_system_required) {
    throw new Error('System-required menu tabs cannot be deleted.');
  }

  // Capture pre-delete snapshot for audit.
  const snapshot = JSON.stringify(registryRow);

  // 1. User-level access overrides
  const { error: uoErr } = await supabase
    .from('menu_access_user_overrides' as any)
    .delete()
    .eq('menu_key', menuKey);
  if (uoErr) throw uoErr;

  // 2. Role-level access config
  const { error: acErr } = await supabase
    .from('menu_access_config' as any)
    .delete()
    .eq('menu_key', menuKey);
  if (acErr) throw acErr;

  // 3. Menu Setting overrides (label / parent / sort)
  const { error: ovErr } = await supabase
    .from('menu_overrides' as any)
    .delete()
    .eq('menu_key', menuKey);
  if (ovErr) throw ovErr;

  // 4. Registry row (DB trigger enforces is_custom)
  const { error: regErr } = await supabase
    .from('menu_registry' as any)
    .delete()
    .eq('menu_key', menuKey);
  if (regErr) throw regErr;

  // 5. Audit
  const { error: auErr } = await supabase
    .from('menu_override_audit' as any)
    .insert({
      menu_key: menuKey,
      client_id: null,
      field: 'delete_custom_menu_item',
      old_value: snapshot,
      new_value: null,
      changed_by: performedBy,
    });
  if (auErr) throw auErr;
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

// ---------------------------------------------------------------------------
// Shortcuts — safe re-exposure of locked / system-required menu items under
// any valid container. Original registry row is left untouched; we insert a
// NEW custom row that mirrors label/route/icon but is fully movable.
// ---------------------------------------------------------------------------

/** Reverse map: menu_key -> System Settings ?section= key. */
const MENU_KEY_TO_SETTINGS_SECTION: Record<string, string> = Object.fromEntries(
  Object.entries(SETTINGS_SECTION_KEY_TO_MENU_KEY).map(([k, v]) => [v, k]),
);

/**
 * Derives a navigable route for a shortcut pointing at `source`.
 *   1. source.route_path wins when present (most items).
 *   2. Settings tabs (no route_path) map to `/admin/settings?section=<key>`.
 *   3. Group / pure-container nodes return null → shortcut becomes container-only.
 */
export function deriveShortcutRoute(source: MenuRegistryRow): string | null {
  if (source.route_path && source.route_path.trim() !== '') return source.route_path;
  const section = MENU_KEY_TO_SETTINGS_SECTION[source.menu_key];
  if (section) return `/admin/settings?section=${section}`;
  return null;
}

/** Generates `custom-shortcut-<sourceKey>[-N]` not already in existingKeys. */
export function generateShortcutKey(
  sourceMenuKey: string,
  existingKeys: ReadonlyArray<string>,
): string {
  // sourceMenuKey already follows the slug pattern; prepend custom-shortcut-.
  const base = `custom-shortcut-${sourceMenuKey}`;
  const set = new Set(existingKeys);
  if (!set.has(base)) return base;
  let n = 2;
  while (set.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export interface CreateShortcutInput {
  source: MenuRegistryRow;
  parentKey: string;
  createdBy?: string | null;
  /** Optional override label; defaults to `source.default_label`. */
  label?: string;
}

export interface ValidateShortcutArgs {
  source: MenuRegistryRow;
  parentKey: string;
  registryByKey: Record<string, MenuRegistryRow>;
  resolvedByKey: Record<string, ResolvedMenuNode>;
}

/** Mirrors DB trigger checks for shortcut placement. */
export function validateShortcut(args: ValidateShortcutArgs): Validation {
  const { source, parentKey, registryByKey, resolvedByKey } = args;
  if (!source) return { ok: false, reason: 'Source item missing.' };
  if (!parentKey) return { ok: false, reason: 'Parent is required.' };
  const parent = registryByKey[parentKey];
  if (!parent) return { ok: false, reason: 'Parent does not exist.' };
  if (!parent.accepts_children) {
    return { ok: false, reason: `Parent "${parent.default_label}" cannot contain children.` };
  }
  const parentDepth = computeDepth(parentKey, registryByKey, resolvedByKey);
  if (parentDepth + 1 > 4) {
    return { ok: false, reason: 'Nesting too deep (max 4 levels).' };
  }
  // Prevent shortcut-to-self chain (parent === source)
  if (parent.menu_key === source.menu_key) {
    return { ok: false, reason: 'A shortcut cannot live inside itself.' };
  }
  return { ok: true };
}

/**
 * Creates a shortcut registry row + admin-only access entry. Returns the new
 * menu_key. Caller invalidates react-query caches.
 */
export async function createShortcutMenuItem(
  input: CreateShortcutInput,
  existingKeys: ReadonlyArray<string>,
  parentDepth: number,
): Promise<CreateResult> {
  const { source, parentKey, createdBy, label } = input;
  const menuKey = generateShortcutKey(source.menu_key, existingKeys);
  const menuLevel = Math.min(4, parentDepth + 1) as 2 | 3 | 4;
  const route = deriveShortcutRoute(source);
  const resolvedLabel = (label?.trim() || source.default_label).slice(0, 60);

  const row: any = {
    menu_key: menuKey,
    default_label: resolvedLabel,
    module_key: 'pms',
    default_parent_key: parentKey,
    menu_level: menuLevel,
    route_path: route,
    icon_name: source.icon_name,
    default_sort_order: 1000,
    accepts_children: false,
    is_renamable: true,
    is_movable: true,
    is_cross_app_movable: false,
    is_system_required: false,
    feature_key: null,
    permission_key: null,
    is_custom: true,
    color: null,
    created_by: createdBy ?? null,
  };

  const { error: regErr } = await supabase.from('menu_registry' as any).insert(row);
  if (regErr) throw regErr;

  const { error: accessErr } = await supabase.from('menu_access_config' as any).upsert(
    {
      menu_key: menuKey,
      menu_name: resolvedLabel,
      section: parentKey,
      allowed_roles: ['admin'],
      display_order: 1000,
    },
    { onConflict: 'menu_key' },
  );
  if (accessErr) throw accessErr;

  return { menuKey };
}