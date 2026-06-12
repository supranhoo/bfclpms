import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type {
  SafetyIncidentStatus,
  SafetyIncidentSeverity,
  SafetyIncidentType,
  SafetyIncidentPriority,
  SafetySlaStatus,
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
  routed_bu_head_id?: string | null;
  routed_manager_id?: string | null;
  routed_second_manager_id?: string | null;
  routing_status?: 'dept' | 'division' | 'unrouted' | 'legacy' | null;
  safety_head_id?: string | null;
  verifier_id?: string | null;
  priority?: SafetyIncidentPriority | null;
  sla_rule_id?: string | null;
  sla_start_at?: string | null;
  sla_due_at?: string | null;
  sla_target_hours?: number | null;
  sla_amber_threshold_pct?: number | null;
  sla_status?: SafetySlaStatus | null;
  /** Optional: employee on whose behalf the incident was filed. Display/audit only. */
  actual_reporter_id?: string | null;
}

export const SAFETY_INCIDENTS_KEY = ['safety', 'incidents'] as const;

/**
 * @deprecated POLICY §113 / ADR-050 — list hooks must paginate.
 * Do not use in new code. Existing call sites have been migrated to the
 * scoped hooks below (`useSafetySlaQueue`, `useSafetyIncidentsByDrillKey`).
 * Kept as a no-throw shim for one release to allow safe rollback.
 */
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
    // Hard cap: never auto-run on mount (was the source of the unbounded
    // shell-level fetch). Callers must opt in by enabling explicitly.
    enabled: false,
  });
}

/**
 * Scoped query for SafetyHome's At-Risk SLA queue. Returns only open
 * incidents whose `sla_state` is red or amber, ordered by SLA due-time
 * ascending (most urgent first). Capped server-side at 100 rows.
 */
export const SAFETY_SLA_QUEUE_KEY = ['safety', 'incidents', 'sla-queue'] as const;
export function useSafetySlaQueue(enabled = true) {
  return useQuery({
    queryKey: SAFETY_SLA_QUEUE_KEY,
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<SafetyIncidentRow[]> => {
      const { data, error } = await supabase
        .from('safety_incidents_with_sla' as never)
        .select('*')
        .neq('status', 'closed')
        .neq('status', 'orphaned')
        .in('sla_state', ['red', 'amber'])
        .order('sla_due_at', { ascending: true, nullsFirst: false })
        .range(0, 99);
      if (error) throw error;
      return (data ?? []) as unknown as SafetyIncidentRow[];
    },
  });
}

/**
 * Scoped query for the analytics KPI drill-down dialog. Each drill kind
 * maps to a narrow server-side predicate so we never load the whole
 * incidents table into the browser.
 */
export type DrillKey = 'open' | 'closed' | 'critical';
export function useSafetyIncidentsByDrillKey(
  kind: DrillKey | null,
  enabled = true,
) {
  return useQuery({
    queryKey: ['safety', 'incidents', 'drill', kind],
    enabled: enabled && !!kind,
    staleTime: 30_000,
    queryFn: async (): Promise<SafetyIncidentRow[]> => {
      let q = supabase
        .from('safety_incidents_with_sla' as never)
        .select('*')
        .order('created_at', { ascending: false })
        .range(0, 99);
      if (kind === 'open') q = q.not('status', 'in', '(closed,orphaned)');
      else if (kind === 'closed') q = q.eq('status', 'closed');
      else if (kind === 'critical') q = q.eq('severity', 'critical');
      const { data, error } = await q;
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
  /** Legacy enum codes — optional now. Prefer the *_id variants. */
  incident_type?: SafetyIncidentType;
  severity?: SafetyIncidentSeverity;
  /** Configured incident type id (safety_incident_types.id). Preferred. */
  incident_type_id?: string;
  /** Configured severity id (safety_incident_severities.id). Preferred. */
  severity_id?: string;
  priority?: SafetyIncidentPriority;
  business_unit_id?: string | null;
  department_id?: string | null;
  involved_person_id?: string | null;
  involved_person_name?: string | null;
  occurred_at?: string;
  client_submission_id?: string;
  /** Optional: file-on-behalf-of — references a profile id. Server validates. */
  actual_reporter_id?: string | null;
}

export function useReportSafetyIncident() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: ReportIncidentInput) => {
      if (!user) throw new Error('Not authenticated');
      const payload = {
        ...input,
        // crypto.randomUUID is available in modern browsers + RN; falls back to
        // server default if missing.
        client_submission_id:
          input.client_submission_id ?? (typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : undefined),
      };
      // Phase 18: route through SECURITY DEFINER RPC. reporter_id is stamped
      // server-side from auth.uid(); never trusted from the client payload.
      const { data, error } = await supabase.rpc(
        'report_safety_incident' as never,
        { p_payload: payload as never } as never,
      );
      if (error) throw error;
      return data as unknown as { id: string; incident_number: string; reused?: boolean };
    },
    onSuccess: (res) => {
      toast.success(`Incident ${res.incident_number} reported`);
      // Scoped invalidation (Wave 2 / POLICY §110). A new report only affects
      // the SLA queue, dashboard stats, drill-down dialogs, and audit log —
      // never PMS caches or unrelated Safety sub-modules.
      qc.invalidateQueries({ queryKey: SAFETY_SLA_QUEUE_KEY });
      qc.invalidateQueries({ queryKey: ['safety', 'incidents', 'drill'] });
      qc.invalidateQueries({ queryKey: ['safety', 'dashboard-stats'] });
      qc.invalidateQueries({ queryKey: ['safety', 'audit-log'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Failed to report incident'),
  });
}

export interface TransitionInput {
  incidentId: string;
  toStatus: SafetyIncidentStatus;
  notes?: string;
  assignedTo?: string;
  /** Safety Head closure remarks (only used when toStatus === 'closed'). */
  finalRemarks?: string;
}

export function useTransitionSafetyIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ incidentId, toStatus, notes, assignedTo, finalRemarks }: TransitionInput) => {
      const { data, error } = await supabase.rpc('transition_safety_incident', {
        p_incident_id: incidentId,
        p_to_status: toStatus,
        p_notes: notes ?? null,
        p_assigned_to: assignedTo ?? null,
        p_final_remarks: finalRemarks ?? null,
      } as never);
      if (error) throw error;
      const result = data as { ok: boolean; error?: string };
      if (!result?.ok) throw new Error(result?.error ?? 'Transition failed');
      return result;
    },
    onSuccess: (_res, vars) => {
      toast.success(`Moved to ${vars.toStatus}`);
      // Scoped invalidation (Wave 2). A status transition affects only the
      // touched incident's detail, the SLA queue, drill-downs, dashboard
      // tiles, timeline, and audit log.
      qc.invalidateQueries({ queryKey: ['safety', 'incident', vars.incidentId] });
      qc.invalidateQueries({ queryKey: SAFETY_SLA_QUEUE_KEY });
      qc.invalidateQueries({ queryKey: ['safety', 'incidents', 'drill'] });
      qc.invalidateQueries({ queryKey: ['safety', 'dashboard-stats'] });
      qc.invalidateQueries({ queryKey: ['safety', 'incident-detail', vars.incidentId] });
      qc.invalidateQueries({ queryKey: ['safety', 'audit-log'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Transition rejected'),
  });
}

/**
 * Phase 1 / ADR-089 — Orphan revival. Calls the dedicated
 * `revive_orphaned_safety_incident` RPC (Safety Admin / Head only).
 */
export interface ReviveOrphanInput {
  incidentId: string;
  assignedTo: string;
  notes?: string;
}

export function useReviveOrphanedIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ incidentId, assignedTo, notes }: ReviveOrphanInput) => {
      const { data, error } = await supabase.rpc(
        'revive_orphaned_safety_incident' as never,
        {
          p_incident_id: incidentId,
          p_assigned_to: assignedTo,
          p_notes: notes ?? null,
        } as never,
      );
      if (error) throw error;
      const result = data as { ok: boolean; error?: string };
      if (!result?.ok) throw new Error(result?.error ?? 'Revival failed');
      return result;
    },
    onSuccess: (_res, vars) => {
      toast.success('Incident revived and reassigned');
      qc.invalidateQueries({ queryKey: ['safety', 'incident', vars.incidentId] });
      qc.invalidateQueries({ queryKey: ['safety', 'incident-detail', vars.incidentId] });
      qc.invalidateQueries({ queryKey: SAFETY_SLA_QUEUE_KEY });
      qc.invalidateQueries({ queryKey: ['safety', 'incidents', 'drill'] });
      qc.invalidateQueries({ queryKey: ['safety', 'dashboard-stats'] });
      qc.invalidateQueries({ queryKey: ['safety', 'audit-log'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Revival rejected'),
  });
}

// Note: a generic `invalidateAllSafetyQueries` helper used to live here but
// was removed in Wave 2 — broad invalidation of the `['safety']` root is
// an anti-pattern (POLICY §110). Use the scoped sub-keys exposed above.