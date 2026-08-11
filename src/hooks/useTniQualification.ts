/**
 * ADR-252 — TNI continuity evaluation.
 *
 * `tni_qualified_kpis` evaluates the "at or below the threshold in EVERY
 * scored month" rule server-side (SECURITY INVOKER — the caller's RLS still
 * applies) and returns only the qualifying (employee, KPI) identities with
 * their per-month evidence. Evaluating in SQL keeps the payload small even for
 * a 12-month, org-wide range.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getTniThreshold } from '@/lib/pmsSettings';
import { buildQualifiedIndex, type QualifiedKpiRow, type QualifiedIndex } from '@/lib/tni/tniQualification';
import type { PeriodRange } from '@/hooks/useTNI';

export function useTniThreshold() {
  return useQuery({
    queryKey: ['tni-threshold'],
    queryFn: getTniThreshold,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTniQualifiedKpis(periodRanges: PeriodRange[], threshold: number | undefined) {
  return useQuery({
    queryKey: ['tni-qualified-kpis', periodRanges, threshold],
    enabled: threshold != null && periodRanges.length > 0,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<{ rows: QualifiedKpiRow[]; index: QualifiedIndex }> => {
      const { data, error } = await (supabase.rpc as any)('tni_qualified_kpis', {
        p_periods: periodRanges.map(r => ({ month: r.month, year: r.year })),
        p_threshold: threshold,
      });
      if (error) throw error;
      const rows = ((data ?? []) as any[]).map(r => ({
        employee_id: r.employee_id,
        kpi_key: r.kpi_key,
        kra_name: r.kra_name ?? null,
        kpi_name: r.kpi_name ?? null,
        months: Array.isArray(r.months) ? r.months : [],
        scored_months: Number(r.scored_months ?? 0),
        worst_score: r.worst_score == null ? null : Number(r.worst_score),
        latest_score: r.latest_score == null ? null : Number(r.latest_score),
      })) as QualifiedKpiRow[];
      return { rows, index: buildQualifiedIndex(rows) };
    },
  });
}