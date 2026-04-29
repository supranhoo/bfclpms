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

export function useSafetyAnalytics(businessUnitId?: string | null) {
  return useQuery<SafetyAnalyticsPayload>({
    queryKey: [...KEY, businessUnitId ?? 'all'],
    queryFn: async () => {
      const filter = (q: ReturnType<typeof supabase.from>) =>
        businessUnitId ? q.eq('business_unit_id', businessUnitId) : q;

      const [trir, sev, oc, train, audit, permit] = await Promise.all([
        filter(supabase.from('mv_safety_trir').select('*')),
        filter(supabase.from('mv_safety_severity_rate').select('*')),
        filter(supabase.from('mv_safety_incidents_open_vs_closed').select('*')),
        supabase.from('mv_safety_training_compliance').select('*').limit(1).maybeSingle(),
        filter(supabase.from('mv_safety_audit_scoreboard').select('*')),
        filter(supabase.from('mv_safety_permit_throughput').select('*')),
      ]);

      return {
        trir: (trir.data as SafetyAnalyticsPayload['trir']) ?? [],
        severity: (sev.data as SafetyAnalyticsPayload['severity']) ?? [],
        open_vs_closed: (oc.data as SafetyAnalyticsPayload['open_vs_closed']) ?? [],
        training: (train.data as SafetyAnalyticsPayload['training']) ?? null,
        audit_scoreboard: (audit.data as SafetyAnalyticsPayload['audit_scoreboard']) ?? [],
        permit_throughput: (permit.data as SafetyAnalyticsPayload['permit_throughput']) ?? [],
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
      const { data, error } = await supabase.rpc('refresh_safety_analytics');
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