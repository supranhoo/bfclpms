import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/**
 * ADR-330 — Apply the canonical registry to real KPI rows across a month range.
 *
 * Building the registry (definitions + aliases) is metadata only: it never
 * rewrites `kpis.kpi_name`, which is why reports such as the KPI-Employee
 * Matrix kept showing the old variant text. These hooks wrap the two server
 * functions that close that gap:
 *
 *  - `correct_kpis_range_dry_run` — read-only, per-month counts.
 *  - `correct_kpis_range`         — one reversible rename action.
 *
 * Forward-only guard (POLICY §88I) is enforced server-side: nothing before
 * May 2026 can be touched. Renames change text and definition binding only —
 * targets, weightages, scores and workflow status are never written.
 */

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export function monthNum(period: string): number {
  return MONTH_NAMES.indexOf(period as (typeof MONTH_NAMES)[number]) + 1;
}

/** Numeric key used for range comparisons: YYYYMM. */
export function periodKey(period: string, year: number): number {
  return year * 100 + monthNum(period);
}

/** Earliest correctable month — May 2026 (POLICY §88I forward-only freeze). */
export const CORRECTION_FLOOR = 202605;

export interface RangeDryRunRow {
  review_period: string;
  review_year: number;
  kpi_rows: number;
  locked_rows: number;
  org_rows: number;
}

export interface RangeApplyResult {
  ok: boolean;
  action_id: string;
  kpi_rows_renamed: number;
  org_rows_renamed: number;
  skipped_locked: number;
}

export interface RangeArgs {
  categoryId: string;
  oldKra: string;
  oldKpi: string;
  fromPeriod: string;
  fromYear: number;
  toPeriod: string;
  toYear: number;
}

export function useKpiRangeCorrection() {
  const { toast } = useToast();
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);

  const dryRun = useCallback(async (args: RangeArgs): Promise<RangeDryRunRow[]> => {
    setPreviewing(true);
    try {
      const { data, error } = await supabase.rpc('correct_kpis_range_dry_run' as any, {
        p_category_id: args.categoryId,
        p_old_kra: args.oldKra,
        p_old_kpi: args.oldKpi,
        p_from_period: args.fromPeriod,
        p_from_year: args.fromYear,
        p_to_period: args.toPeriod,
        p_to_year: args.toYear,
      });
      if (error) throw error;
      return (data ?? []) as RangeDryRunRow[];
    } catch (err: any) {
      toast({ title: 'Preview failed', description: err.message, variant: 'destructive' });
      return [];
    } finally {
      setPreviewing(false);
    }
  }, [toast]);

  const apply = useCallback(async (
    args: RangeArgs & {
      newKra: string;
      newKpi: string;
      definitionId: string | null;
      includeLocked?: boolean;
    },
  ): Promise<RangeApplyResult | null> => {
    setApplying(true);
    try {
      const { data, error } = await supabase.rpc('correct_kpis_range' as any, {
        p_category_id: args.categoryId,
        p_old_kra: args.oldKra,
        p_old_kpi: args.oldKpi,
        p_new_kra: args.newKra,
        p_new_kpi: args.newKpi,
        p_definition_id: args.definitionId,
        p_from_period: args.fromPeriod,
        p_from_year: args.fromYear,
        p_to_period: args.toPeriod,
        p_to_year: args.toYear,
        p_include_locked: args.includeLocked !== false,
      });
      if (error) throw error;
      return data as unknown as RangeApplyResult;
    } catch (err: any) {
      toast({ title: 'Correction failed', description: err.message, variant: 'destructive' });
      return null;
    } finally {
      setApplying(false);
    }
  }, [toast]);

  return { dryRun, apply, previewing, applying };
}

/**
 * Honest coverage counters (ADR-330 §4): linking a name to the registry is not
 * the same as renaming the underlying rows. The Health tab shows both.
 */
export interface ApplyCoverage {
  renameActions: number;
  rowsRenamed: number;
  lastRenameAt: string | null;
}

export async function fetchApplyCoverage(): Promise<ApplyCoverage> {
  const { data, error } = await supabase
    .from('kpi_standardization_actions' as any)
    .select('action_type, affected_row_count, performed_at, reversed_at')
    .in('action_type', ['rename_kpis', 'rename_kpis_range'])
    .is('reversed_at', null);
  if (error) throw error;
  const rows = (data ?? []) as any[];
  return {
    renameActions: rows.length,
    rowsRenamed: rows.reduce((sum, r) => sum + (Number(r.affected_row_count) || 0), 0),
    lastRenameAt: rows.reduce<string | null>(
      (latest, r) => (!latest || r.performed_at > latest ? r.performed_at : latest),
      null,
    ),
  };
}
