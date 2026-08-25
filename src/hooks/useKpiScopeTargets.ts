/**
 * ADR-320 — the picker's data layer.
 *
 * A grouped scope (business unit, location, division, PMS grade, level,
 * department, employee) must name the one target it applies to. Both the list
 * of targets and the live reach come from the server so the UI never has to
 * know how a scope resolves to people (Zero-Hardcoding Rule).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { scopeNeedsTarget } from '@/lib/review/kpiScope';

export interface KpiScopeOption {
  target_id: string;
  label: string;
  code: string | null;
  employee_count: number;
}

export interface KpiScopePopulationSummary {
  scope: string;
  target_id: string | null;
  needs_target: boolean;
  employees: number;
  missing_key_employees: number;
}

/** Targets a scope can address, each with the number of active people it reaches. */
export function useKpiScopeOptions(scope: string | null | undefined) {
  const enabled = !!scope && scopeNeedsTarget(scope);
  return useQuery({
    queryKey: ['kpi-scope-options', scope],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<KpiScopeOption[]> => {
      const { data, error } = await supabase.rpc('kpi_scope_options' as never, {
        p_scope: scope,
      } as never);
      if (error) throw error;
      return (data ?? []) as unknown as KpiScopeOption[];
    },
  });
}

/** Live reach for one chosen target, plus employees missing that master-data key. */
export function useKpiScopePopulation(scope: string | null | undefined, targetId: string | null) {
  const enabled = !!scope && (!scopeNeedsTarget(scope) || !!targetId);
  return useQuery({
    queryKey: ['kpi-scope-population', scope, targetId],
    enabled,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<KpiScopePopulationSummary | null> => {
      const { data, error } = await supabase.rpc('kpi_scope_population_summary' as never, {
        p_scope: scope,
        p_target_id: targetId,
      } as never);
      if (error) throw error;
      return (data ?? null) as unknown as KpiScopePopulationSummary | null;
    },
  });
}
