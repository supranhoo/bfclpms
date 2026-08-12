/**
 * ADR-252 — TNI continuity evaluation.
 *
 * `tni_qualified_kpis` evaluates the "at or below the threshold in EVERY
 * scored month" rule server-side. ADR-255 makes the RPC SECURITY DEFINER with
 * explicit report authorization and KPI-row scope checks, so RLS cannot turn a
 * valid organization report into a silent zero while managers remain scoped.
 * Evaluating in SQL keeps the payload small even for a 12-month range.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getTniThreshold } from '@/lib/pmsSettings';
import { getPipPolicySettings } from '@/lib/pip/pipPolicySettings';
import { buildQualifiedIndex, tniRangeKey, type QualifiedKpiRow, type QualifiedIndex } from '@/lib/tni/tniQualification';
import type { TniEmployeeLite } from '@/lib/tni/tniQualification';
import type { PeriodRange } from '@/hooks/useTNI';

export function useTniThreshold() {
  return useQuery({
    queryKey: ['tni-threshold'],
    queryFn: getTniThreshold,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * ADR-254 — qualifying KPIs can belong to employees with no persisted
 * `training_needs` record, so the report resolves their profile directly.
 */
export function useTniEmployeeProfiles(employeeIds: string[]) {
  const ids = Array.from(new Set(employeeIds)).sort();
  return useQuery({
    queryKey: ['tni-employee-profiles', ids],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Map<string, TniEmployeeLite>> => {
      const CHUNK = 200;
      const out = new Map<string, TniEmployeeLite>();
      for (let i = 0; i < ids.length; i += CHUNK) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, employee_code, designation, is_active, department_id, department:departments!profiles_department_fk(id, name)')
          .in('id', ids.slice(i, i + CHUNK));
        if (error) throw error;
        (data ?? []).forEach((p: any) => out.set(p.id, p as TniEmployeeLite));
      }
      return out;
    },
  });
}

/**
 * ADR-252b — the continuity window (`pip_consecutive_months`) also gates TNI:
 * a KPI must have at least this many scored months inside the selected range.
 */
export function useTniMinScoredMonths() {
  return useQuery({
    queryKey: ['pip-policy-settings'],
    queryFn: getPipPolicySettings,
    staleTime: 5 * 60 * 1000,
    select: (p) => p.consecutiveMonths,
  });
}

export function useTniQualifiedKpis(
  periodRanges: PeriodRange[],
  threshold: number | undefined,
  minScoredMonths?: number,
) {
  const rangeKey = tniRangeKey(periodRanges);
  return useQuery({
    queryKey: ['tni-qualified-kpis', periodRanges, threshold, minScoredMonths ?? null],
    enabled: threshold != null && minScoredMonths != null && periodRanges.length > 0,
    staleTime: 2 * 60 * 1000,
    // ADR-252c — never carry the previous filter's result-set over while the
    // new range is fetching. A spinner is correct; stale numbers are not.
    placeholderData: undefined,
    queryFn: async (): Promise<{ rows: QualifiedKpiRow[]; index: QualifiedIndex; rangeKey: string }> => {
      // The window can never exceed the number of months actually selected,
      // otherwise a 3-month policy would empty a 1-month report entirely.
      const minMonths = Math.max(1, Math.min(minScoredMonths ?? 1, periodRanges.length));
      const { data, error } = await (supabase.rpc as any)('tni_qualified_kpis', {
        p_periods: periodRanges.map(r => ({ month: r.month, year: r.year })),
        p_threshold: threshold,
        p_min_scored_months: minMonths,
      });
      if (error) throw error;
      const rows = ((data ?? []) as any[]).map(r => ({
        employee_id: r.employee_id,
        kpi_key: r.kpi_key,
        kra_name: r.kra_name ?? null,
        kpi_name: r.kpi_name ?? null,
        weightage: r.weightage == null ? null : Number(r.weightage),
        months: Array.isArray(r.months) ? r.months : [],
        scored_months: Number(r.scored_months ?? 0),
        worst_score: r.worst_score == null ? null : Number(r.worst_score),
        latest_score: r.latest_score == null ? null : Number(r.latest_score),
      })) as QualifiedKpiRow[];
      return { rows, index: buildQualifiedIndex(rows), rangeKey };
    },
  });
}