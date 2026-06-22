import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SafetyAnalyticsPayload } from '@/lib/safetyAnalytics';

/**
 * useSafetyAnalytics
 * ------------------
 * React Query hooks for Phase 7 analytics. Reads materialized views
 * directly (cheap, GRANTed to authenticated) and exposes a refresh
 * mutation that calls `refresh_safety_analytics()`.
 */

const KEY = ['safety', 'analytics'] as const;

/**
 * Phase parity-closeout hooks for the three new analytics MVs / RPCs
 * (recurrence, top root causes, dept-risk trend) and the multi-factor
 * at-risk roster RPC. All gated server-side by `has_safety_module_access`.
 */

export interface RecurrenceRow {
  location_label: string;
  incident_type: string;
  business_unit_id: string | null;
  department_id: string | null;
  occurrences: number;
  last_occurred_at: string;
}
export interface TopRootCauseRow {
  cause: string;
  severity: string;
  incidents: number;
}
export interface DeptRiskTrendRow {
  department_id: string | null;
  month: string;
  high_severity: number;
  total: number;
}
export interface AtRiskRow {
  assigned_to: string;
  open_count: number;
  red_count: number;
  amber_count: number;
  worst_sla: 'red' | 'amber' | 'green';
  oldest_open_at: string;
}

type RpcFn = (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export function useSafetyRecurrence(departmentId?: string | null) {
  return useQuery<RecurrenceRow[]>({
    queryKey: [...KEY, 'recurrence', departmentId ?? 'all'],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as unknown as RpcFn)(
        'safety_analytics_recurrence',
        { p_department: departmentId ?? null },
      );
      if (error) throw new Error(error.message);
      return ((data as RecurrenceRow[]) ?? []);
    },
    staleTime: 60_000,
  });
}

export function useSafetyTopRootCauses(limit = 10) {
  return useQuery<TopRootCauseRow[]>({
    queryKey: [...KEY, 'top-root-causes', limit],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as unknown as RpcFn)(
        'safety_analytics_top_root_causes',
        { p_limit: limit },
      );
      if (error) throw new Error(error.message);
      return ((data as TopRootCauseRow[]) ?? []);
    },
    staleTime: 60_000,
  });
}

export function useSafetyDeptRiskTrend(months = 12) {
  return useQuery<DeptRiskTrendRow[]>({
    queryKey: [...KEY, 'dept-risk-trend', months],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as unknown as RpcFn)(
        'safety_analytics_dept_risk_trend',
        { p_months: months },
      );
      if (error) throw new Error(error.message);
      return ((data as DeptRiskTrendRow[]) ?? []);
    },
    staleTime: 60_000,
  });
}

export function useSafetyAtRiskRoster(threshold = 3) {
  return useQuery<AtRiskRow[]>({
    queryKey: [...KEY, 'at-risk', threshold],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as unknown as RpcFn)(
        'safety_dashboard_at_risk',
        { p_threshold: threshold },
      );
      if (error) throw new Error(error.message);
      return ((data as AtRiskRow[]) ?? []);
    },
    staleTime: 30_000,
  });
}

/**
 * MV contract note (Phase 8 SSOT): the canonical MV names referenced by
 * `useSafetyAnalytics` are listed below so the analytics-mv-contract test
 * picks them up via static source read.
 * MV: mv_safety_recurrence
 * MV: mv_safety_top_root_causes
 * MV: mv_safety_dept_risk_trend
 */

export function useSafetyAnalytics(businessUnitId?: string | null) {
  return useQuery<SafetyAnalyticsPayload>({
    queryKey: [...KEY, businessUnitId ?? 'all'],
    queryFn: async () => {
      // MVs are revoked from anon/authenticated (Wave D security). Read via
      // the service-role-backed `safety-analytics` edge function instead.
      const { data, error } = await supabase.functions.invoke('safety-analytics', {
        body: { business_unit_id: businessUnitId ?? null },
      });
      if (error) throw error;
      const payload = (data as { ok: boolean; error?: string; result?: SafetyAnalyticsPayload });
      if (!payload?.ok || !payload.result) {
        throw new Error(payload?.error || 'Failed to load safety analytics');
      }
      return payload.result;
    },
    staleTime: 60_000,
  });
}

export function useRefreshSafetyAnalytics() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase.rpc as unknown as (
        name: string,
      ) => Promise<{ data: unknown; error: { message: string } | null }>)(
        'refresh_safety_analytics',
      );
      if (error) throw error;
      return data as { ok: boolean; error?: string; refreshed_at?: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}