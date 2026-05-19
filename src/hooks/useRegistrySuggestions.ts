import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/**
 * Phase 4a/4b: Hooks for fuzzy auto-merge suggestions.
 *
 * Wraps the admin-only RPCs:
 *   - suggest_definition_merges(p_min_similarity, p_limit)
 *   - suggest_alias_candidates(p_min_similarity, p_limit)
 *   - dismiss_suggestion(p_kind, p_left_id, p_right_id, p_reason)
 *
 * Both loaders fail open (set error state, return empty arrays) so a
 * transient RPC error never blanks the Suggestions tab — same pattern as
 * useRegistryHealth.
 */

export interface DefinitionMergeSuggestion {
  left_id: string;
  right_id: string;
  category_id: string;
  category_name: string;
  left_kra_name: string;
  left_kpi_name: string;
  right_kra_name: string;
  right_kpi_name: string;
  similarity: number;
  left_alias_count: number;
  right_alias_count: number;
  left_linked_kpi_count: number;
  right_linked_kpi_count: number;
  // Phase 4d: enrichment (mode of linked kpis). May be null when a definition
  // has no linked KPI rows yet — UI renders "—" in that case.
  left_frequency: string | null;
  left_frequency_mixed: boolean;
  left_r0: string | null;
  left_r1: string | null;
  left_r2: string | null;
  left_r3: string | null;
  left_r4: string | null;
  left_r5: string | null;
  left_r_mixed: boolean;
  right_frequency: string | null;
  right_frequency_mixed: boolean;
  right_r0: string | null;
  right_r1: string | null;
  right_r2: string | null;
  right_r3: string | null;
  right_r4: string | null;
  right_r5: string | null;
  right_r_mixed: boolean;
}

export interface AliasCandidateSuggestion {
  signature_id: string;
  category_id: string;
  category_name: string;
  signature_kra_name: string;
  signature_kpi_name: string;
  occurrence_count: number;
  last_seen: string;
  definition_id: string;
  canonical_kra_name: string;
  canonical_kpi_name: string;
  similarity: number;
}

export type SuggestionKind = 'definition_merge' | 'alias_candidate';

const STORAGE_KEY_DEF = 'pms.registry.suggestions.minSimilarity.defMerge';
const STORAGE_KEY_ALI = 'pms.registry.suggestions.minSimilarity.alias';

/**
 * Read a persisted threshold from localStorage. Falls back to the supplied
 * default when the value is missing or out of range.
 */
export function readPersistedThreshold(key: string, fallback: number): number {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
    if (raw == null) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 1) return fallback;
    return n;
  } catch {
    return fallback;
  }
}

function persistThreshold(key: string, value: number) {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, String(value));
    }
  } catch {
    /* localStorage unavailable; non-fatal */
  }
}

export function useRegistrySuggestions() {
  const [defMerges, setDefMerges] = useState<DefinitionMergeSuggestion[]>([]);
  const [aliasCandidates, setAliasCandidates] = useState<AliasCandidateSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [defMergeThreshold, setDefMergeThresholdState] = useState<number>(() =>
    readPersistedThreshold(STORAGE_KEY_DEF, 0.55),
  );
  const [aliasThreshold, setAliasThresholdState] = useState<number>(() =>
    readPersistedThreshold(STORAGE_KEY_ALI, 0.6),
  );

  const setDefMergeThreshold = useCallback((v: number) => {
    setDefMergeThresholdState(v);
    persistThreshold(STORAGE_KEY_DEF, v);
  }, []);
  const setAliasThreshold = useCallback((v: number) => {
    setAliasThresholdState(v);
    persistThreshold(STORAGE_KEY_ALI, v);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mergeRes, aliasRes] = await Promise.all([
        (supabase.rpc as any)('suggest_definition_merges', {
          p_min_similarity: defMergeThreshold,
          p_limit: 100,
        }),
        (supabase.rpc as any)('suggest_alias_candidates', {
          p_min_similarity: aliasThreshold,
          p_limit: 200,
        }),
      ]);
      if (mergeRes.error) throw mergeRes.error;
      if (aliasRes.error) throw aliasRes.error;
      setDefMerges((mergeRes.data ?? []) as DefinitionMergeSuggestion[]);
      setAliasCandidates((aliasRes.data ?? []) as AliasCandidateSuggestion[]);
    } catch (e: any) {
      console.warn('[useRegistrySuggestions] failed', e);
      setError(e?.message ?? 'Failed to load registry suggestions');
      setDefMerges([]);
      setAliasCandidates([]);
    } finally {
      setLoading(false);
    }
  }, [defMergeThreshold, aliasThreshold]);

  useEffect(() => { void refresh(); }, [refresh]);

  return {
    defMerges,
    aliasCandidates,
    loading,
    error,
    refresh,
    defMergeThreshold,
    aliasThreshold,
    setDefMergeThreshold,
    setAliasThreshold,
  };
}

export function useDismissSuggestion() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const dismiss = useCallback(async (
    kind: SuggestionKind,
    leftId: string,
    rightId: string,
    reason?: string,
  ): Promise<boolean> => {
    setLoading(true);
    try {
      const { error } = await (supabase.rpc as any)('dismiss_suggestion', {
        p_kind: kind,
        p_left_id: leftId,
        p_right_id: rightId,
        p_reason: reason ?? null,
      });
      if (error) throw error;
      toast({
        title: 'Suggestion dismissed',
        description: 'It will not appear again until you remove the dismissal from the database.',
      });
      return true;
    } catch (err: any) {
      toast({
        title: 'Could not dismiss suggestion',
        description: err?.message || 'Unknown error',
        variant: 'destructive',
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  return { dismiss, loading };
}

/**
 * Phase 4c: Wraps merge_definitions(p_keep_id, p_drop_id, p_reason).
 *
 * The RPC is transactional; it re-parents aliases, re-points kpis, deletes
 * the dropped definition, writes one row to kpi_registry_audit_log, and
 * auto-dismisses the suggestion pair so it does not resurface.
 */
export interface MergeDefinitionsResult {
  success: boolean;
  kept_id: string;
  dropped_id: string;
  reparented_aliases: number;
  dropped_alias_conflicts: number;
  repointed_kpis: number;
  backfill_alias_id: string | null;
}

export function useMergeDefinitions() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const merge = useCallback(async (
    keepId: string,
    dropId: string,
    reason?: string,
  ): Promise<MergeDefinitionsResult | null> => {
    setLoading(true);
    try {
      const { data, error } = await (supabase.rpc as any)('merge_definitions', {
        p_keep_id: keepId,
        p_drop_id: dropId,
        p_reason: reason ?? null,
      });
      if (error) throw error;
      const result = data as MergeDefinitionsResult;
      toast({
        title: 'Definitions merged',
        description:
          `Re-parented ${result.reparented_aliases} alias(es) and re-pointed ${result.repointed_kpis} KPI link(s).` +
          (result.dropped_alias_conflicts > 0
            ? ` ${result.dropped_alias_conflicts} duplicate alias(es) discarded.`
            : ''),
      });
      return result;
    } catch (err: any) {
      toast({
        title: 'Merge failed',
        description: err?.message || 'Unknown error',
        variant: 'destructive',
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  return { merge, loading };
}

/**
 * Phase 4c: Lightweight badge data for the Health dashboard.
 * Always fails open (returns zeroes) so a transient RPC error does not
 * blank the Health tab.
 */
export interface PendingSuggestionCount {
  merge_count: number;
  alias_count: number;
  total: number;
}

export function usePendingSuggestionCount() {
  const [counts, setCounts] = useState<PendingSuggestionCount>({
    merge_count: 0, alias_count: 0, total: 0,
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase.rpc as any)(
        'get_registry_pending_suggestion_count',
      );
      if (error) throw error;
      if (data && typeof data === 'object') {
        setCounts({
          merge_count: Number((data as any).merge_count ?? 0),
          alias_count: Number((data as any).alias_count ?? 0),
          total: Number((data as any).total ?? 0),
        });
      }
    } catch (e) {
      console.warn('[usePendingSuggestionCount] failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return { counts, loading, refresh };
}