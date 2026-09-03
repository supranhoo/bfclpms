/**
 * ADR-352a — detect "one KPI stored under several legacy names".
 *
 * The Performance Console rewrites the structured columns (`kpi_title` …) but
 * never `kpi_name` (ADR-334/337), while Org KPI Data Entry still groups cards
 * on `category_id + kra_name + kpi_name`. A definition edited over time
 * therefore splits into several identical-looking cards, each holding a slice
 * of the employees.
 *
 * `list_split_kpi_name_variants()` is read-only and lists those split groups
 * (May 2026+, at least one still-open row). Normalisation itself goes through
 * the existing, reversible `correct_kpis_range` engine (ADR-330).
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SplitVariant {
  kpi_name: string;
  rows: number;
  open_rows: number;
}

export interface SplitVariantGroup {
  category_id: string;
  category_name: string | null;
  kra_name: string;
  kpi_title: string;
  variant_count: number;
  open_rows: number;
  total_rows: number;
  canonical_kpi_name: string;
  variants: SplitVariant[];
}

export function useSplitKpiNameVariants() {
  const [groups, setGroups] = useState<SplitVariantGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('list_split_kpi_name_variants' as any);
      if (rpcError) throw rpcError;
      setGroups(((data ?? []) as any[]).map((r) => ({
        ...r,
        variants: Array.isArray(r.variants) ? r.variants : [],
      })) as SplitVariantGroup[]);
    } catch (err: any) {
      setError(err?.message ?? 'Could not load split KPI names');
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return { groups, loading, error, refresh };
}

/** Variants that still need renaming (everything except the canonical name). */
export function nonCanonicalVariants(group: SplitVariantGroup): SplitVariant[] {
  return group.variants.filter(
    (v) => v.kpi_name !== group.canonical_kpi_name && v.open_rows > 0,
  );
}
