import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/**
 * Phase 5: Hooks for the definition split workflow.
 *
 * Wraps three admin-only RPCs:
 *   - preview_split_definition(p_source_id, p_move_alias_ids)
 *   - split_definition(p_source_id, p_keep_alias_ids, p_move_alias_ids,
 *       p_new_kra_name, p_new_kpi_name,
 *       p_rename_source_kra, p_rename_source_kpi, p_reason)
 *   - get_recent_registry_audit(p_limit)
 *
 * All loaders fail open (toast + null/empty result) — same pattern as the
 * Phase 4 hooks.
 */

export interface AliasRow {
  id: string;
  variant_kra_name: string;
  variant_kpi_name: string;
  category_id: string;
}

export interface SplitPreview {
  source_id: string;
  move_count: number;
  stay_count: number;
}

export interface SplitResult {
  success: boolean;
  source_id: string;
  new_id: string;
  moved_aliases: number;
  kept_aliases: number;
  repointed_kpis: number;
  renamed_source: boolean;
}

/**
 * Validates that `keepIds ∪ moveIds` is a partition of `allIds` with no
 * overlap and no orphans, and that `moveIds` is non-empty. Pure function
 * extracted for unit testing — the same checks run server-side as a
 * defense-in-depth pair.
 */
export function validateAliasPartition(
  allIds: string[],
  keepIds: string[],
  moveIds: string[],
): { ok: boolean; reason?: string } {
  if (moveIds.length === 0) {
    return { ok: false, reason: 'At least one alias must move to the new definition.' };
  }
  if (keepIds.length + moveIds.length !== allIds.length) {
    return {
      ok: false,
      reason: `Partition incomplete: ${keepIds.length + moveIds.length} chosen vs ${allIds.length} total.`,
    };
  }
  const seen = new Set<string>();
  for (const id of [...keepIds, ...moveIds]) {
    if (seen.has(id)) return { ok: false, reason: 'An alias is on both sides.' };
    seen.add(id);
  }
  for (const id of allIds) {
    if (!seen.has(id)) return { ok: false, reason: 'An alias is missing from the partition.' };
  }
  for (const id of seen) {
    if (!allIds.includes(id)) return { ok: false, reason: 'Partition references an unknown alias.' };
  }
  return { ok: true };
}

/**
 * Loads the aliases attached to a single canonical definition. Used to
 * populate the split dialog's two-column checkbox list.
 */
export function useDefinitionAliases(definitionId: string | null) {
  const [aliases, setAliases] = useState<AliasRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!definitionId) { setAliases([]); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from('kpi_name_aliases')
          .select('id, variant_kra_name, variant_kpi_name, category_id')
          .eq('definition_id', definitionId)
          .order('variant_kra_name', { ascending: true })
          .order('variant_kpi_name', { ascending: true });
        if (error) throw error;
        if (!cancelled) setAliases((data ?? []) as AliasRow[]);
      } catch (e) {
        console.warn('[useDefinitionAliases] failed', e);
        if (!cancelled) setAliases([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [definitionId]);

  return { aliases, loading };
}

/**
 * Cheap dry-run: returns how many KPI links would move vs stay given the
 * proposed move-alias set. The dialog calls this whenever the partition
 * changes so admins see impact before committing.
 */
export function useSplitPreview(
  sourceId: string | null,
  moveAliasIds: string[],
) {
  const [preview, setPreview] = useState<SplitPreview | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sourceId || moveAliasIds.length === 0) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await (supabase.rpc as any)(
          'preview_split_definition',
          { p_source_id: sourceId, p_move_alias_ids: moveAliasIds },
        );
        if (error) throw error;
        if (!cancelled) setPreview((data ?? null) as SplitPreview | null);
      } catch (e) {
        console.warn('[useSplitPreview] failed', e);
        if (!cancelled) setPreview(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // moveAliasIds is intentionally compared by JSON to avoid array-reference churn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, JSON.stringify(moveAliasIds)]);

  return { preview, loading };
}

export interface SplitArgs {
  sourceId: string;
  keepIds: string[];
  moveIds: string[];
  newKraName: string;
  newKpiName: string;
  renameSourceKra?: string | null;
  renameSourceKpi?: string | null;
  reason: string;
}

export function useSplitDefinition() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const split = useCallback(async (args: SplitArgs): Promise<SplitResult | null> => {
    setLoading(true);
    try {
      const { data, error } = await (supabase.rpc as any)('split_definition', {
        p_source_id: args.sourceId,
        p_keep_alias_ids: args.keepIds,
        p_move_alias_ids: args.moveIds,
        p_new_kra_name: args.newKraName,
        p_new_kpi_name: args.newKpiName,
        p_rename_source_kra: args.renameSourceKra ?? null,
        p_rename_source_kpi: args.renameSourceKpi ?? null,
        p_reason: args.reason,
      });
      if (error) throw error;
      const result = data as SplitResult;
      toast({
        title: 'Definition split',
        description:
          `Moved ${result.moved_aliases} alias(es) and re-pointed ${result.repointed_kpis} KPI link(s) to the new definition.` +
          (result.renamed_source ? ' Source canonical text renamed.' : ''),
      });
      return result;
    } catch (err: any) {
      toast({
        title: 'Split failed',
        description: err?.message || 'Unknown error',
        variant: 'destructive',
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  return { split, loading };
}

// =====================================================================
// Phase 5c: Recent registry activity
// =====================================================================

export interface RegistryAuditEntry {
  id: string;
  action: string;
  performed_by: string | null;
  performer_name: string | null;
  category_id: string | null;
  primary_definition_id: string | null;
  affected_definition_id: string | null;
  payload: Record<string, any>;
  reason: string | null;
  created_at: string;
}

export function useRecentRegistryAudit(limit = 5) {
  const [entries, setEntries] = useState<RegistryAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase.rpc as any)(
        'get_recent_registry_audit',
        { p_limit: limit },
      );
      if (error) throw error;
      setEntries((data ?? []) as RegistryAuditEntry[]);
    } catch (e) {
      console.warn('[useRecentRegistryAudit] failed', e);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { entries, loading, refresh };
}
