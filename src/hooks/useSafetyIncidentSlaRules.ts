import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type {
  SafetyIncidentType,
  SafetyIncidentSeverity,
  SafetyIncidentPriority,
} from '@/lib/safetyIncidents';

/**
 * Configurable SLA matrix for safety incidents.
 * Resolution precedence is enforced server-side by
 * `resolve_safety_incident_sla(type, severity, priority)`:
 *   1. exact (type + severity + priority)
 *   2. (type + severity, priority IS NULL)  — applies to any priority
 * Historical incidents are NOT re-resolved when rules change — `sla_due_at`
 * is stamped at insert time and is immutable.
 */
export interface SafetyIncidentSlaRule {
  id: string;
  incident_type: SafetyIncidentType;
  severity: SafetyIncidentSeverity;
  incident_type_id: string | null;
  severity_id: string | null;
  priority: SafetyIncidentPriority | null;
  target_hours: number;
  amber_threshold_pct: number;
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

const KEY = ['safety', 'sla-rules'] as const;

export function useSafetyIncidentSlaRules() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<SafetyIncidentSlaRule[]> => {
      const { data, error } = await supabase
        .from('safety_incident_sla_rules' as never)
        .select('*')
        .order('incident_type', { ascending: true })
        .order('severity', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as SafetyIncidentSlaRule[];
    },
  });
}

export interface SlaRuleInput {
  incident_type: SafetyIncidentType;
  severity: SafetyIncidentSeverity;
  /** Preferred: link to configured type/severity rows. */
  incident_type_id?: string | null;
  severity_id?: string | null;
  priority: SafetyIncidentPriority | null;
  target_hours: number;
  amber_threshold_pct: number;
  notes?: string | null;
  is_active?: boolean;
}

export function useUpsertSafetyIncidentSlaRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: SlaRuleInput }) => {
      const { data: u } = await supabase.auth.getUser();
      const actor = u?.user?.id ?? null;
      if (id) {
        const { error } = await supabase
          .from('safety_incident_sla_rules' as never)
          .update({ ...input, updated_by: actor } as never)
          .eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('safety_incident_sla_rules' as never)
          .insert({ ...input, created_by: actor, updated_by: actor } as never);
        if (error) throw error;
      }
    },
    onSuccess: (_r, vars) => {
      toast.success(vars.id ? 'Rule updated' : 'Rule created');
      qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e: Error) => toast.error(e.message ?? 'Save failed'),
  });
}

export function useToggleSafetyIncidentSlaRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('safety_incident_sla_rules' as never)
        .update({ is_active } as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (e: Error) => toast.error(e.message ?? 'Toggle failed'),
  });
}