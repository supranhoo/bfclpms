import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type {
  SafetyIncidentStatus,
  SafetyIncidentSeverity,
  SafetyIncidentType,
} from '@/lib/safetyIncidents';

/**
 * useSafetyIncidents
 * ------------------
 * Data layer for the Safety incident workflow. All cache keys live under the
 * `['safety', ...]` prefix so module-scoped invalidation never nukes PMS
 * caches (POLICY §110).
 *
 * The 7-stage FSM is enforced server-side via the `transition_safety_incident`
 * RPC + a BEFORE UPDATE trigger that blocks any direct status write. The
 * frontend calls only the RPC — never `update({ status: ... })` directly.
 */

export interface SafetyIncidentRow {
  id: string;
  incident_number: string | null;
  client_submission_id: string;
  reporter_id: string;
  business_unit_id: string | null;
  department_id: string | null;
  incident_type: SafetyIncidentType;
  severity: SafetyIncidentSeverity;
  status: SafetyIncidentStatus;
  title: string;
  description: string;
  location: string;
  occurred_at: string;
  involved_person_id: string | null;
  involved_person_name: string | null;
  assigned_to: string | null;
  assigned_at: string | null;
  acknowledge_due_at: string;
  close_due_at: string;
  closed_at: string | null;
  closed_by: string | null;
  rca_summary: string | null;
  capa_summary: string | null;
  verification_notes: string | null;
  created_at: string;
  updated_at: string;
  sla_state: 'green' | 'amber' | 'red' | 'closed';
}

export const SAFETY_INCIDENTS_KEY = ['safety', 'incidents'] as const;

export function useSafetyIncidents() {
  return useQuery({
    queryKey: SAFETY_INCIDENTS_KEY,
    queryFn: async (): Promise<SafetyIncidentRow[]> => {
      const { data, error } = await supabase
        .from('safety_incidents_with_sla' as never)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SafetyIncidentRow[];
    },
  });
}

export function useSafetyIncident(incidentId: string | undefined) {
  return useQuery({
    queryKey: ['safety', 'incident', incidentId],
    enabled: !!incidentId,
    queryFn: async (): Promise<SafetyIncidentRow | null> => {
      const { data, error } = await supabase
        .from('safety_incidents_with_sla' as never)
        .select('*')
        .eq('id', incidentId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as SafetyIncidentRow | null;
    },
  });
}

export interface ReportIncidentInput {
  title: string;
  description: string;
  location: string;
  incident_type: SafetyIncidentType;
  severity: SafetyIncidentSeverity;
  business_unit_id?: string | null;
  department_id?: string | null;
  involved_person_id?: string | null;
  involved_person_name?: string | null;
  occurred_at?: string;
  client_submission_id?: string;
}

export function useReportSafetyIncident() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: ReportIncidentInput) => {
      if (!user) throw new Error('Not authenticated');
      const payload = {
        ...input,
        reporter_id: user.id,
        // crypto.randomUUID is available in modern browsers + RN; falls back to
        // server default if missing.
        client_submission_id:
          input.client_submission_id ?? (typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : undefined),
      };
      const { data, error } = await supabase
        .from('safety_incidents')
        .insert(payload as never)
        .select('id, incident_number')
        .single();
      if (error) throw error;
      return data as { id: string; incident_number: string };
    },
    onSuccess: (res) => {
      toast.success(`Incident ${res.incident_number} reported`);
      qc.invalidateQueries({ queryKey: ['safety'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Failed to report incident'),
  });
}

export interface TransitionInput {
  incidentId: string;
  toStatus: SafetyIncidentStatus;
  notes?: string;
  assignedTo?: string;
}

export function useTransitionSafetyIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ incidentId, toStatus, notes, assignedTo }: TransitionInput) => {
      const { data, error } = await supabase.rpc('transition_safety_incident', {
        p_incident_id: incidentId,
        p_to_status: toStatus,
        p_notes: notes ?? null,
        p_assigned_to: assignedTo ?? null,
      });
      if (error) throw error;
      const result = data as { ok: boolean; error?: string };
      if (!result?.ok) throw new Error(result?.error ?? 'Transition failed');
      return result;
    },
    onSuccess: (_res, vars) => {
      toast.success(`Moved to ${vars.toStatus}`);
      qc.invalidateQueries({ queryKey: ['safety'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Transition rejected'),
  });
}

/**
 * Strictly scoped invalidator — never nukes PMS caches.
 * (Per POLICY §110 cache isolation requirement.)
 */
export function invalidateAllSafetyQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['safety'] });
}