import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SafetyIncidentRow } from './useSafetyIncidents';
import { SAFETY_INCIDENT_STAGES } from '@/lib/safetyIncidents';

/**
 * useSafetyDashboardStats
 * -----------------------
 * Aggregates open incidents from the SLA-aware view for the SafetyHome
 * dashboard. RLS already restricts what the caller can see, so this hook
 * simply summarizes whatever rows the user is allowed to read — no extra
 * permission gymnastics in the UI layer.
 */

export interface SafetyDashboardStats {
  total: number;
  open: number;
  byStatus: Record<string, number>;
  bySeverity: Record<string, number>;
  bySla: { green: number; amber: number; red: number; closed: number };
  recent: SafetyIncidentRow[];
  overdue: SafetyIncidentRow[];
}

const EMPTY_STATS: SafetyDashboardStats = {
  total: 0,
  open: 0,
  byStatus: {},
  bySeverity: {},
  bySla: { green: 0, amber: 0, red: 0, closed: 0 },
  recent: [],
  overdue: [],
};

export function useSafetyDashboardStats() {
  return useQuery({
    queryKey: ['safety', 'dashboard-stats'],
    queryFn: async (): Promise<SafetyDashboardStats> => {
      const { data, error } = await supabase
        .from('safety_incidents_with_sla' as never)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      const rows = (data ?? []) as unknown as SafetyIncidentRow[];
      if (!rows.length) return EMPTY_STATS;

      const byStatus: Record<string, number> = {};
      const bySeverity: Record<string, number> = {};
      const bySla = { green: 0, amber: 0, red: 0, closed: 0 };
      let open = 0;
      const overdue: SafetyIncidentRow[] = [];

      for (const r of rows) {
        byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
        bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1;
        bySla[r.sla_state] = (bySla[r.sla_state] ?? 0) + 1;
        if (r.status !== 'closed') open += 1;
        if (r.sla_state === 'red' && r.status !== 'closed') overdue.push(r);
      }

      // Ensure every defined stage shows up (zero counts) so UI tiles are stable.
      for (const s of SAFETY_INCIDENT_STAGES) byStatus[s] = byStatus[s] ?? 0;

      return {
        total: rows.length,
        open,
        byStatus,
        bySeverity,
        bySla,
        recent: rows.slice(0, 5),
        overdue: overdue.slice(0, 8),
      };
    },
    staleTime: 30_000,
  });
}
