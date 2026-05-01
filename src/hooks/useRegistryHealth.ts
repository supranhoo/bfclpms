import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CoverageStats {
  total_definitions: number;
  total_aliases: number;
  inscope_kpis_total: number;
  inscope_kpis_linked: number;
  inscope_kpis_unlinked: number;
  inscope_distinct_signatures: number;
  coverage_pct: number;
}

export interface UnlinkedSignature {
  category_id: string;
  category_name: string;
  kra_name: string;
  kpi_name: string;
  occurrence_count: number;
  employee_count: number;
  last_seen: string;
}

export interface AliasDriftRow {
  definition_id: string;
  canonical_kra_name: string;
  canonical_kpi_name: string;
  category_id: string;
  category_name: string;
  variant_kra_count: number;
  variant_kra_names: string[];
  alias_count: number;
}

/**
 * Phase 2c: Read-only governance metrics for the registry.
 * Each loader fails open (returns null/empty) so a transient RPC error
 * never breaks the page.
 */
export function useRegistryHealth() {
  const [stats, setStats] = useState<CoverageStats | null>(null);
  const [unlinked, setUnlinked] = useState<UnlinkedSignature[]>([]);
  const [drift, setDrift] = useState<AliasDriftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, unlinkedRes, driftRes] = await Promise.all([
        (supabase.rpc as any)('get_registry_coverage_stats'),
        (supabase.rpc as any)('get_unlinked_signatures', { p_limit: 100 }),
        (supabase.rpc as any)('detect_alias_drift'),
      ]);
      if (statsRes.error) throw statsRes.error;
      setStats((statsRes.data ?? null) as CoverageStats | null);
      setUnlinked((unlinkedRes.data ?? []) as UnlinkedSignature[]);
      setDrift((driftRes.data ?? []) as AliasDriftRow[]);
    } catch (e: any) {
      console.warn('[useRegistryHealth] failed', e);
      setError(e?.message ?? 'Failed to load registry health');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return { stats, unlinked, drift, loading, error, refresh };
}