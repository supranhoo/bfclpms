import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { applyOverrides, buildLabelMap, groupByParent } from '@/lib/menu/applyOverrides';
import type { MenuOverrideRow, MenuRegistryRow, ResolvedMenuNode } from '@/lib/menu/types';

const STALE_MS = 5 * 60 * 1000;

async function fetchEnabled(): Promise<boolean> {
  const { data, error } = await supabase
    .from('system_settings')
    .select('setting_value')
    .eq('setting_key', 'menu_overrides_enabled')
    .maybeSingle();
  if (error || !data) return false;
  const v = data.setting_value as unknown;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v === 'true' || v === '"true"';
  return false;
}

async function fetchRegistry(): Promise<MenuRegistryRow[]> {
  const { data, error } = await supabase
    .from('menu_registry' as any)
    .select('*');
  if (error) throw error;
  return (data ?? []) as MenuRegistryRow[];
}

async function fetchOverrides(): Promise<MenuOverrideRow[]> {
  const { data, error } = await supabase
    .from('menu_overrides' as any)
    .select('*')
    .eq('is_active', true);
  if (error) throw error;
  return (data ?? []) as MenuOverrideRow[];
}

/** Master switch — when false, the app uses default labels everywhere. */
export function useMenuOverridesEnabled() {
  return useQuery({
    queryKey: ['menu-overrides-enabled'],
    queryFn: fetchEnabled,
    staleTime: STALE_MS,
  });
}

/**
 * Sidebar/Settings consumer hook. Returns the label map (and resolved nodes)
 * when the feature flag is on; otherwise returns empty maps so callers fall
 * back to their hardcoded defaults — making this a NO-OP for non-admin users
 * when the flag is off.
 */
export function useResolvedMenu() {
  const { data: enabled } = useMenuOverridesEnabled();

  return useQuery({
    queryKey: ['resolved-menu', !!enabled],
    enabled: !!enabled,
    staleTime: STALE_MS,
    queryFn: async () => {
      const [registry, overrides] = await Promise.all([fetchRegistry(), fetchOverrides()]);
      const resolved = applyOverrides(registry, overrides);
      return {
        nodes: resolved,
        byKey: Object.fromEntries(resolved.map((n) => [n.menu_key, n])) as Record<string, ResolvedMenuNode>,
        labelByKey: buildLabelMap(resolved),
        byParent: groupByParent(resolved),
      };
    },
  });
}

/** Admin hook — always loads registry + overrides (for the Menu Setting tab). */
export function useMenuRegistryAdmin() {
  const registry = useQuery({
    queryKey: ['menu-registry-admin'],
    queryFn: fetchRegistry,
    staleTime: STALE_MS,
  });
  const overrides = useQuery({
    queryKey: ['menu-overrides-admin'],
    queryFn: async () => {
      const { data, error } = await supabase.from('menu_overrides' as any).select('*');
      if (error) throw error;
      return (data ?? []) as MenuOverrideRow[];
    },
    staleTime: STALE_MS,
  });
  return { registry, overrides };
}

/**
 * Convenience for sidebar/settings callers — returns a label for a given
 * menu_key, falling back to the provided default when no override applies.
 */
export function useLabelFor(): (menuKey: string | undefined, fallback: string) => string {
  const { data } = useResolvedMenu();
  return (menuKey, fallback) => {
    if (!menuKey || !data) return fallback;
    return data.labelByKey[menuKey] ?? fallback;
  };
}

/** Resolved sort_order for a menu_key, falling back to provided default. */
export function useSortFor(): (menuKey: string | undefined, fallback: number) => number {
  const { data } = useResolvedMenu();
  return (menuKey, fallback) => {
    if (!menuKey || !data) return fallback;
    return data.byKey[menuKey]?.sort_order ?? fallback;
  };
}