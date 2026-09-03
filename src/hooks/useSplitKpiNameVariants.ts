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

/* ------------------------------------------------------------------ */
/* ADR-354 — same KPI title split across two categories                */
/* ------------------------------------------------------------------ */

export interface CrossCategoryEntry {
  category_id: string;
  category_name: string | null;
  rows: number;
  open_rows: number;
  name_variants: number;
}

export interface CrossCategorySplitGroup {
  kra_name: string;
  kpi_title: string;
  category_count: number;
  open_rows: number;
  total_rows: number;
  categories: CrossCategoryEntry[];
}

/**
 * Read-only detector for the shape ADR-352a could not see: one structured KPI
 * title whose rows live under more than one category. Renaming alone does not
 * merge those cards — the rows have to be moved to a single category, which is
 * an explicit admin decision, so this list is informational.
 */
export function useCrossCategoryKpiTitleSplits() {
  const [groups, setGroups] = useState<CrossCategorySplitGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('list_cross_category_kpi_title_splits' as any);
      if (rpcError) throw rpcError;
      setGroups(((data ?? []) as any[]).map((r) => ({
        ...r,
        categories: Array.isArray(r.categories) ? r.categories : [],
      })) as CrossCategorySplitGroup[]);
    } catch (err: any) {
      setError(err?.message ?? 'Could not load cross-category KPI splits');
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return { groups, loading, error, refresh };
}

/** Category that should keep the KPI: the one holding the most rows. */
export function dominantCategory(group: CrossCategorySplitGroup): CrossCategoryEntry | null {
  return group.categories.reduce<CrossCategoryEntry | null>(
    (best, c) => (best === null || c.rows > best.rows ? c : best),
    null,
  );
}
