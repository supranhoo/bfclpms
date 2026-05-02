import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { dedupeScannerGroups } from '@/lib/scanGroupsDedup';

/**
 * Pure helper: given a canonical (kra,kpi), the full variant list, the category,
 * and the aliases already linked to the resolved definition, return the rows
 * that still need to be inserted into kpi_name_aliases. Used to make the
 * "Approve as Canonical" flow idempotent.
 */
export function diffAliasInserts(
  canonical: { kra_name: string; kpi_name: string },
  variants: { kra_name: string; kpi_name: string }[],
  categoryId: string,
  existingAliases: { variant_kra_name: string; variant_kpi_name: string; category_id: string }[]
): { rows: { variant_kra_name: string; variant_kpi_name: string; category_id: string }[]; totalConsidered: number } {
  const key = (kra: string, kpi: string) =>
    `${(kra || '').trim().toLowerCase()}||${(kpi || '').trim().toLowerCase()}`;

  const all = [canonical, ...variants];
  const dedupedMap = new Map<string, { kra_name: string; kpi_name: string }>();
  all.forEach(v => {
    const k = key(v.kra_name, v.kpi_name);
    if (!dedupedMap.has(k)) dedupedMap.set(k, v);
  });
  const deduped = [...dedupedMap.values()];

  const existingSet = new Set(
    existingAliases.map(a => `${key(a.variant_kra_name, a.variant_kpi_name)}||${a.category_id}`)
  );

  const rows = deduped
    .filter(v => !existingSet.has(`${key(v.kra_name, v.kpi_name)}||${categoryId}`))
    .map(v => ({
      variant_kra_name: v.kra_name,
      variant_kpi_name: v.kpi_name,
      category_id: categoryId,
    }));

  return { rows, totalConsidered: deduped.length };
}

export interface KpiDefinition {
  id: string;
  canonical_kra_name: string;
  canonical_kpi_name: string;
  category_id: string;
  created_at: string;
  updated_at: string;
}

export interface KpiNameAlias {
  id: string;
  definition_id: string;
  variant_kra_name: string;
  variant_kpi_name: string;
  category_id: string;
  created_at: string;
}

export interface DuplicateGroup {
  normalized_kpi: string;
  category_id: string;
  category_name: string;
  variants: {
    kra_name: string;
    kpi_name: string;
    employee_count: number;
    row_count: number;
  }[];
}

export interface UnmatchedMayKpi {
  kra_name: string;
  kpi_name: string;
  category_id: string;
  category_name: string;
  employee_count: number;
  suggested_definition_id: string | null;
  suggested_canonical_kra: string | null;
  suggested_canonical_kpi: string | null;
}

export function useKpiDefinitions() {
  const [data, setData] = useState<KpiDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data: defs, error } = await supabase
      .from('kpi_definitions' as any)
      .select('*')
      .order('canonical_kra_name');
    if (!error && defs) setData(defs as any as KpiDefinition[]);
    setLoading(false);
  }, []);

  useEffect(() => { refetch(); }, [refetch]);
  return { data, loading, refetch };
}

export function useKpiAliases(definitionId?: string) {
  const [data, setData] = useState<KpiNameAlias[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('kpi_name_aliases' as any).select('*');
    if (definitionId) query = query.eq('definition_id', definitionId);
    const { data: aliases, error } = await query.order('created_at');
    if (!error && aliases) setData(aliases as any as KpiNameAlias[]);
    setLoading(false);
  }, [definitionId]);

  useEffect(() => { refetch(); }, [refetch]);
  return { data, loading, refetch };
}

export function useScanDuplicates() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const scan = useCallback(async () => {
    setLoading(true);
    try {
      // Find KPI signatures that have multiple KRA name variants
      const { data, error } = await supabase.rpc('scan_kpi_duplicate_groups' as any);
      if (error) throw error;
      // Defensive client-side de-dup: even if a stale/buggy server function
      // ever returns duplicated variants again, the UI must not show them.
      const raw = (data as any as DuplicateGroup[]) || [];
      setGroups(dedupeScannerGroups(raw as any) as DuplicateGroup[]);
    } catch (err: any) {
      toast({ title: 'Scan failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  return { groups, loading, scan };
}

export function useBuildRegistry() {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const createDefinitionWithAliases = useCallback(async (
    canonicalKra: string,
    canonicalKpi: string,
    categoryId: string,
    variants: { kra_name: string; kpi_name: string }[]
  ) => {
    setSaving(true);
    try {
      // Step 1: Look up existing definition (idempotent re-approval)
      const { data: existing, error: lookupErr } = await supabase
        .from('kpi_definitions' as any)
        .select('id')
        .eq('canonical_kra_name', canonicalKra)
        .eq('canonical_kpi_name', canonicalKpi)
        .maybeSingle();
      if (lookupErr) throw lookupErr;

      let defId: string;
      let reused = false;

      if (existing) {
        defId = (existing as any).id;
        reused = true;
      } else {
        const { data: def, error: defErr } = await supabase
          .from('kpi_definitions' as any)
          .insert({ canonical_kra_name: canonicalKra, canonical_kpi_name: canonicalKpi, category_id: categoryId } as any)
          .select()
          .single();
        if (defErr) {
          // Race: another writer created it between lookup and insert
          if ((defErr as any).code === '23505') {
            const { data: retry } = await supabase
              .from('kpi_definitions' as any)
              .select('id')
              .eq('canonical_kra_name', canonicalKra)
              .eq('canonical_kpi_name', canonicalKpi)
              .maybeSingle();
            if (!retry) throw defErr;
            defId = (retry as any).id;
            reused = true;
          } else {
            throw defErr;
          }
        } else {
          defId = (def as any).id;
        }
      }

      // Step 2: Build canonical + variant list, de-duped
      const allVariants = [
        { kra_name: canonicalKra, kpi_name: canonicalKpi },
        ...variants,
      ];
      const variantKey = (kra: string, kpi: string) =>
        `${(kra || '').trim().toLowerCase()}||${(kpi || '').trim().toLowerCase()}`;
      const dedupedMap = new Map<string, { kra_name: string; kpi_name: string }>();
      allVariants.forEach(v => {
        const k = variantKey(v.kra_name, v.kpi_name);
        if (!dedupedMap.has(k)) dedupedMap.set(k, v);
      });
      const deduped = [...dedupedMap.values()];

      // Step 3: Fetch existing aliases for this definition
      const { data: existingAliases, error: aliasFetchErr } = await supabase
        .from('kpi_name_aliases' as any)
        .select('variant_kra_name, variant_kpi_name, category_id')
        .eq('definition_id', defId);
      if (aliasFetchErr) throw aliasFetchErr;

      const existingSet = new Set(
        (existingAliases || []).map((a: any) =>
          `${variantKey(a.variant_kra_name, a.variant_kpi_name)}||${a.category_id}`
        )
      );

      const newAliasRows = deduped
        .filter(v => !existingSet.has(`${variantKey(v.kra_name, v.kpi_name)}||${categoryId}`))
        .map(v => ({
          definition_id: defId,
          variant_kra_name: v.kra_name,
          variant_kpi_name: v.kpi_name,
          category_id: categoryId,
        }));

      let inserted = 0;
      if (newAliasRows.length > 0) {
        const { error: aliasErr } = await supabase
          .from('kpi_name_aliases' as any)
          .insert(newAliasRows as any);
        if (aliasErr && (aliasErr as any).code !== '23505') throw aliasErr;
        if (!aliasErr) inserted = newAliasRows.length;
      }

      const skipped = deduped.length - inserted;
      // Log to action history (best-effort; never block primary write)
      try {
        if (!reused) {
          await supabase.rpc('log_standardization_action' as any, {
            p_action_type: 'create_definition',
            p_definition_id: defId,
            p_category_id: categoryId,
            p_payload: { canonical_kra_name: canonicalKra, canonical_kpi_name: canonicalKpi },
            p_affected_row_count: 1,
          });
        }
        if (inserted > 0) {
          await supabase.rpc('log_standardization_action' as any, {
            p_action_type: 'link_alias',
            p_definition_id: defId,
            p_category_id: categoryId,
            p_payload: { aliases: newAliasRows.map(r => ({
              variant_kra_name: r.variant_kra_name,
              variant_kpi_name: r.variant_kpi_name,
              category_id: r.category_id,
            })) },
            p_affected_row_count: inserted,
          });
        }
      } catch (logErr) {
        console.warn('[standardization] action log failed', logErr);
      }

      toast({
        title: reused ? 'Linked to existing canonical entry' : 'Registry entry created',
        description:
          inserted === 0
            ? `All ${deduped.length} aliases were already linked`
            : `${inserted} alias${inserted === 1 ? '' : 'es'} linked${skipped > 0 ? ` (${skipped} already present)` : ''}`,
      });
      return defId;
    } catch (err: any) {
      toast({ title: 'Failed to create', description: err.message, variant: 'destructive' });
      return null;
    } finally {
      setSaving(false);
    }
  }, [toast]);

  return { createDefinitionWithAliases, saving };
}

/**
 * Edit a canonical definition (rename canonical KRA/KPI). Optionally propagate
 * the rename to current-period KPIs (May 2026 onward) that link to this definition.
 */
export function useEditDefinition() {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const editDefinition = useCallback(async (
    definitionId: string,
    newKra: string,
    newKpi: string,
    propagate: boolean
  ) => {
    setSaving(true);
    try {
      const { data: before, error: readErr } = await supabase
        .from('kpi_definitions' as any)
        .select('id, canonical_kra_name, canonical_kpi_name, category_id')
        .eq('id', definitionId)
        .single();
      if (readErr) throw readErr;
      const beforeRow = before as any;

      const { error: updErr } = await supabase
        .from('kpi_definitions' as any)
        .update({ canonical_kra_name: newKra.trim(), canonical_kpi_name: newKpi.trim() } as any)
        .eq('id', definitionId);
      if (updErr) throw updErr;

      let propagated = 0;
      if (propagate) {
        // Fetch all (period, year) tuples for May 2026+ where rows link to this defId
        const { data: rows, error: kpisErr } = await supabase
          .from('kpis' as any)
          .select('kra_name, kpi_name, review_period, review_year, category_id')
          .eq('kpi_definition_id', definitionId);
        if (kpisErr) throw kpisErr;
        const monthNum = (p: string) => ['January','February','March','April','May','June','July','August','September','October','November','December'].indexOf(p) + 1;
        const seen = new Set<string>();
        for (const r of (rows as any[] || [])) {
          if (r.review_year < 2026 || (r.review_year === 2026 && monthNum(r.review_period) < 5)) continue;
          const k = `${r.category_id}::${r.kra_name}::${r.kpi_name}::${r.review_period}::${r.review_year}`;
          if (seen.has(k)) continue;
          seen.add(k);
          const { data, error } = await supabase.rpc('correct_may_kpis' as any, {
            p_category_id: r.category_id,
            p_old_kra: r.kra_name,
            p_old_kpi: r.kpi_name,
            p_new_kra: newKra.trim(),
            p_new_kpi: newKpi.trim(),
            p_definition_id: definitionId,
            p_review_period: r.review_period,
            p_review_year: r.review_year,
          });
          if (!error && typeof data === 'number') propagated += data;
        }
      }

      await supabase.rpc('log_standardization_action' as any, {
        p_action_type: 'edit_definition',
        p_definition_id: definitionId,
        p_category_id: beforeRow.category_id,
        p_payload: {
          before: { canonical_kra_name: beforeRow.canonical_kra_name, canonical_kpi_name: beforeRow.canonical_kpi_name },
          after: { canonical_kra_name: newKra.trim(), canonical_kpi_name: newKpi.trim() },
          propagate, propagated,
        },
        p_affected_row_count: 1 + propagated,
      });

      toast({
        title: 'Definition updated',
        description: propagate ? `Renamed and propagated to ${propagated} KPI rows` : 'Canonical name updated (no propagation)',
      });
      return true;
    } catch (err: any) {
      toast({ title: 'Edit failed', description: err.message, variant: 'destructive' });
      return false;
    } finally {
      setSaving(false);
    }
  }, [toast]);

  return { editDefinition, saving };
}

/**
 * Delete a single alias and log the action so it can be undone.
 */
export function useUnlinkAlias() {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const unlinkAlias = useCallback(async (alias: KpiNameAlias) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('kpi_name_aliases' as any)
        .delete()
        .eq('id', alias.id);
      if (error) throw error;
      await supabase.rpc('log_standardization_action' as any, {
        p_action_type: 'unlink_alias',
        p_definition_id: alias.definition_id,
        p_category_id: alias.category_id,
        p_payload: { aliases: [{
          variant_kra_name: alias.variant_kra_name,
          variant_kpi_name: alias.variant_kpi_name,
          category_id: alias.category_id,
        }] },
        p_affected_row_count: 1,
      });
      toast({ title: 'Alias unlinked' });
      return true;
    } catch (err: any) {
      toast({ title: 'Unlink failed', description: err.message, variant: 'destructive' });
      return false;
    } finally {
      setSaving(false);
    }
  }, [toast]);

  return { unlinkAlias, saving };
}

/**
 * Delete a definition and capture a snapshot of its aliases for undo.
 */
export function useDeleteDefinition() {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const deleteDefinition = useCallback(async (definitionId: string) => {
    setSaving(true);
    try {
      const { data: def, error: defErr } = await supabase
        .from('kpi_definitions' as any)
        .select('id, canonical_kra_name, canonical_kpi_name, category_id')
        .eq('id', definitionId)
        .single();
      if (defErr) throw defErr;

      const { data: aliases } = await supabase
        .from('kpi_name_aliases' as any)
        .select('variant_kra_name, variant_kpi_name, category_id')
        .eq('definition_id', definitionId);

      const { error: delErr } = await supabase
        .from('kpi_definitions' as any)
        .delete()
        .eq('id', definitionId);
      if (delErr) throw delErr;

      await supabase.rpc('log_standardization_action' as any, {
        p_action_type: 'delete_definition',
        p_definition_id: definitionId,
        p_category_id: (def as any).category_id,
        p_payload: { definition: def, aliases: aliases || [] },
        p_affected_row_count: 1 + ((aliases as any[] | null)?.length || 0),
      });
      toast({ title: 'Definition deleted', description: 'You can undo this from History & Undo' });
      return true;
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
      return false;
    } finally {
      setSaving(false);
    }
  }, [toast]);

  return { deleteDefinition, saving };
}

export interface StandardizationAction {
  id: string;
  action_type: 'create_definition'|'link_alias'|'rename_kpis'|'delete_definition'|'edit_definition'|'unlink_alias';
  definition_id: string | null;
  category_id: string | null;
  payload: any;
  affected_row_count: number;
  performed_by: string | null;
  performed_at: string;
  reversed_at: string | null;
  reversed_by: string | null;
}

export function useStandardizationHistory(limit: number = 200) {
  const [data, setData] = useState<StandardizationAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [reversing, setReversing] = useState<string | null>(null);
  const { toast } = useToast();

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data: rows, error } = await supabase
      .from('kpi_standardization_actions' as any)
      .select('*')
      .order('performed_at', { ascending: false })
      .limit(limit);
    if (!error && rows) setData(rows as any);
    setLoading(false);
  }, [limit]);

  useEffect(() => { refetch(); }, [refetch]);

  const reverseAction = useCallback(async (actionId: string) => {
    setReversing(actionId);
    try {
      const { data, error } = await supabase.rpc('reverse_standardization_action' as any, { p_action_id: actionId });
      if (error) throw error;
      const result = data as any;
      toast({
        title: 'Action reversed',
        description: `${result?.action_type || 'Action'} undone — ${result?.affected || 0} rows affected`,
      });
      await refetch();
      return true;
    } catch (err: any) {
      toast({ title: 'Undo failed', description: err.message, variant: 'destructive' });
      return false;
    } finally {
      setReversing(null);
    }
  }, [refetch, toast]);

  return { data, loading, refetch, reverseAction, reversing };
}

export function useCorrectMayKpis() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const correctKpis = useCallback(async (
    categoryId: string,
    oldKraName: string,
    oldKpiName: string,
    newKraName: string,
    newKpiName: string,
    definitionId: string,
    reviewPeriod: string,
    reviewYear: number
  ) => {
    setLoading(true);
    try {
      const { error } = await supabase.rpc('correct_may_kpis' as any, {
        p_category_id: categoryId,
        p_old_kra: oldKraName,
        p_old_kpi: oldKpiName,
        p_new_kra: newKraName,
        p_new_kpi: newKpiName,
        p_definition_id: definitionId,
        p_review_period: reviewPeriod,
        p_review_year: reviewYear,
      });
      if (error) throw error;
      toast({ title: 'KPIs corrected', description: `Updated to canonical name` });
      return true;
    } catch (err: any) {
      toast({ title: 'Correction failed', description: err.message, variant: 'destructive' });
      return false;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  return { correctKpis, loading };
}