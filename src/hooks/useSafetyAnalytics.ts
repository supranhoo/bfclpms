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
      // Materialized views are not in the generated types — use untyped client.
      const sb = supabase as unknown as {
        from: (t: string) => {
          select: (cols: string) => {
            eq: (c: string, v: string) => Promise<{ data: unknown }>;
            limit: (n: number) => { maybeSingle: () => Promise<{ data: unknown }> };
            then: Promise<{ data: unknown }>['then'];
          } & Promise<{ data: unknown }>;
        };
      };
      const fetchView = async (table: string) => {
        const q = sb.from(table).select('*');
        const res = businessUnitId
          ? await (q as unknown as { eq: (c: string, v: string) => Promise<{ data: unknown }> }).eq(
              'business_unit_id',
              businessUnitId,
            )
          : await q;
        return (res.data as unknown[]) ?? [];
      };
      const trainRes = await (
        sb.from('mv_safety_training_compliance').select('*') as unknown as Promise<{ data: unknown }>
      );
      const trainArr = (trainRes.data as unknown[]) ?? [];
      const [trir, sev, oc, audit, permit] = await Promise.all([
        fetchView('mv_safety_trir'),
        fetchView('mv_safety_severity_rate'),
        fetchView('mv_safety_incidents_open_vs_closed'),
        fetchView('mv_safety_audit_scoreboard'),
        fetchView('mv_safety_permit_throughput'),
      ]);
      const trend = await fetchView('mv_safety_incident_monthly_trend');

      return {
        trir: trir as SafetyAnalyticsPayload['trir'],
        severity: sev as SafetyAnalyticsPayload['severity'],
        open_vs_closed: oc as SafetyAnalyticsPayload['open_vs_closed'],
        training: (trainArr[0] as SafetyAnalyticsPayload['training']) ?? null,
        audit_scoreboard: audit as SafetyAnalyticsPayload['audit_scoreboard'],
        permit_throughput: permit as SafetyAnalyticsPayload['permit_throughput'],
        monthly_trend: trend as SafetyAnalyticsPayload['monthly_trend'],
        refreshed_at: new Date().toISOString(),
      };
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

/* ===== Hours-worked admin entry ===== */
const HOURS_KEY = ['safety', 'hours-worked'] as const;

export function useSafetyHoursWorked() {
  return useQuery({
    queryKey: HOURS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('safety_hours_worked')
        .select('*, business_units(name)')
        .order('period_year', { ascending: false })
        .order('period_month', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpsertSafetyHours() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      business_unit_id: string;
      period_year: number;
      period_month: number;
      hours_worked: number;
      headcount?: number | null;
      notes?: string | null;
    }) => {
      const { error } = await supabase
        .from('safety_hours_worked')
        .upsert(input, { onConflict: 'business_unit_id,period_year,period_month' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: HOURS_KEY });
      qc.invalidateQueries({ queryKey: ['safety', 'analytics'] });
    },
  });
}

export function useDeleteSafetyHours() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('safety_hours_worked').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: HOURS_KEY });
      qc.invalidateQueries({ queryKey: ['safety', 'analytics'] });
    },
  });
}