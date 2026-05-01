import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Phase 3c: Read-only registry visibility hook.
 *
 * Wraps the `get_public_registry_view` RPC. Returns the canonical KPI
 * taxonomy (definitions, aliases, aggregate usage counts) but never
 * exposes employee identifiers, scores, or any other sensitive
 * performance data.
 *
 * - Authenticated users only (DB enforces). Anonymous calls are blocked.
 * - 5-minute staleTime — registry changes infrequently; the page is
 *   reference data, not a live dashboard.
 * - Fails open: an RPC error returns an empty list with `error` set so
 *   the page can show a non-blocking inline notice instead of crashing.
 */

export interface RegistryAliasPair {
  kra_name: string;
  kpi_name: string;
}

export interface RegistryDefinitionView {
  id: string;
  canonical_kra_name: string;
  canonical_kpi_name: string;
  category_id: string;
  category_name: string | null;
  category_color: string | null;
  aliases: RegistryAliasPair[];
  alias_count: number;
  usage_count: number;
}

export interface RegistryBrowserResult {
  definitions: RegistryDefinitionView[];
  total_count: number;
}

export function useRegistryBrowser(search: string, categoryId: string | null) {
  return useQuery<RegistryBrowserResult>({
    queryKey: ['registry-browser', search.trim().toLowerCase(), categoryId ?? 'all'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_public_registry_view', {
        p_search: search.trim() || null,
        p_category_id: categoryId,
      });
      if (error) {
        // Loud console for diagnostics; UI handles the empty result gracefully.
        console.warn('[useRegistryBrowser] RPC failed:', error.message);
        throw error;
      }
      const result = (data ?? { definitions: [], total_count: 0 }) as RegistryBrowserResult;
      return {
        definitions: result.definitions ?? [],
        total_count: result.total_count ?? 0,
      };
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}