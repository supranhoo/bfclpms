import type { MenuOverrideRow, MenuRegistryRow, ResolvedMenuNode } from './types';

/**
 * Merges registry defaults with per-client overrides.
 *
 * Rules (plan §4):
 *   - menu_key is never overridable.
 *   - label/parent/sort_order use the override when present, else default.
 *   - is_active=false override is ignored.
 *   - Only ONE override per (menu_key, client_id) — last-write-wins handled
 *     at DB level via UNIQUE INDEX.
 *
 * CAPA (2026-06-04) — Resolver hardening:
 *   - Dangling `parent_key` (override OR default) referencing a missing
 *     `menu_key` is coerced to the default; if the default is also dangling
 *     the parent is reset to `null`. The tree must never reference a node
 *     that doesn't exist, otherwise sidebar groups silently empty out.
 *   - `menu_level` is clamped to 1..4 to satisfy `ResolvedMenuNode`.
 * This block is part of the temporary CAPA layer documented in
 * `mem://features/admin/menu-setting-capa`. Do not remove until the listed
 * removal criteria are met.
 */
export function applyOverrides(
  registry: MenuRegistryRow[],
  overrides: MenuOverrideRow[],
): ResolvedMenuNode[] {
  const overrideMap = new Map<string, MenuOverrideRow>();
  for (const o of overrides) {
    if (o.is_active) overrideMap.set(o.menu_key, o);
  }

  const knownKeys = new Set(registry.map((r) => r.menu_key));
  const clampLevel = (n: number): 1 | 2 | 3 | 4 => {
    const v = Math.max(1, Math.min(4, Math.trunc(n || 1)));
    return v as 1 | 2 | 3 | 4;
  };
  const safeParent = (
    overriddenParent: string | null,
    defaultParent: string | null,
  ): { parent: string | null; overridden: boolean } => {
    if (overriddenParent !== null && overriddenParent !== defaultParent) {
      if (knownKeys.has(overriddenParent)) {
        return { parent: overriddenParent, overridden: true };
      }
      // dangling override → fall through to default
    }
    if (defaultParent !== null && !knownKeys.has(defaultParent)) {
      return { parent: null, overridden: false };
    }
    return { parent: defaultParent, overridden: false };
  };

  return registry.map((r) => {
    const o = overrideMap.get(r.menu_key);
    const labelOverridden  = !!o && o.custom_label !== null && o.custom_label !== r.default_label;
    const sortOverridden   = !!o && o.custom_sort_order !== null && o.custom_sort_order !== r.default_sort_order;
    const levelOverridden  = !!o && o.custom_menu_level !== null && o.custom_menu_level !== r.menu_level;
    const moduleOverridden = !!o && o.custom_module_key !== null && o.custom_module_key !== r.module_key;

    const { parent: resolvedParent, overridden: parentOverridden } = safeParent(
      o?.custom_parent_key ?? null,
      r.default_parent_key,
    );

    return {
      menu_key: r.menu_key,
      label: labelOverridden ? (o!.custom_label as string) : r.default_label,
      parent_key: resolvedParent,
      sort_order: sortOverridden ? (o!.custom_sort_order as number) : r.default_sort_order,
      module_key: moduleOverridden ? (o!.custom_module_key as string) : r.module_key,
      menu_level: clampLevel(levelOverridden ? (o!.custom_menu_level as number) : r.menu_level),
      route_path: r.route_path,
      icon_name: r.icon_name,
      accepts_children: r.accepts_children,
      is_renamable: r.is_renamable,
      is_movable: r.is_movable,
      is_cross_app_movable: r.is_cross_app_movable,
      is_system_required: r.is_system_required,
      is_overridden: labelOverridden || parentOverridden || sortOverridden || levelOverridden || moduleOverridden,
      is_custom: (r as any).is_custom ?? false,
      color: (r as any).color ?? null,
    };
  });
}

/** Returns a `menu_key → label` lookup map for quick UI consumption. */
export function buildLabelMap(resolved: ResolvedMenuNode[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const n of resolved) m[n.menu_key] = n.label;
  return m;
}

/** Returns a `parent_key → ResolvedMenuNode[]` ordered by sort_order. */
export function groupByParent(resolved: ResolvedMenuNode[]): Map<string | null, ResolvedMenuNode[]> {
  const out = new Map<string | null, ResolvedMenuNode[]>();
  for (const n of resolved) {
    const arr = out.get(n.parent_key) ?? [];
    arr.push(n);
    out.set(n.parent_key, arr);
  }
  for (const arr of out.values()) {
    arr.sort((a, b) => a.sort_order - b.sort_order);
  }
  return out;
}