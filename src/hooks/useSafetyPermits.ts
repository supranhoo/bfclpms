import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type {
  SafetyPermitStatus,
  SafetyPermitType,
} from '@/lib/safetyPermits';
import type { SafetyAppRole } from '@/lib/safetyRoles';

/**
 * Phase 2-B PTW data layer.
 *
 * - All cache keys live under `['safety', 'permits', ...]` so the existing
 *   `useSafetyRealtimeSync` invalidation pattern can mass-clear them.
 * - Lifecycle moves go through RPCs only (status writes are blocked by a
 *   BEFORE UPDATE trigger).
 */

export interface SafetyPermitRow {
  id: string;
  permit_number: string | null;
  permit_type: SafetyPermitType;
  status: SafetyPermitStatus;
  scope: string;
  location: string;
  start_at: string;
  end_at: string;
  current_level: number;
  total_levels: number;
  loto_required: boolean;
  hira_summary: string | null;
  business_unit_id: string | null;
  department_id: string | null;
  requested_by: string;
  rejection_reason: string | null;
  suspended_reason: string | null;
  closed_at: string | null;
  expired_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SafetyPermitApprovalRow {
  id: string;
  permit_id: string;
  level: number;
  approver_role: SafetyAppRole;
  approver_id: string | null;
  decision: string | null;
  notes: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface SafetyPermitTypeConfigRow {
  id: string;
  permit_type: SafetyPermitType;
  level: number;
  approver_role: SafetyAppRole;
  label: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SafetyPermitHiraRow {
  id: string;
  permit_id: string;
  hazard: string;
  risk_before: string;
  controls: string;
  risk_after: string;
  created_at: string;
}

export interface SafetyPermitLotoStepRow {
  id: string;
  permit_id: string;
  step_no: number;
  description: string;
  isolated_by: string | null;
  isolated_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  removed_by: string | null;
  removed_at: string | null;
  created_at: string;
}

/* ────────────────────────────────────────────────────────────── lists ─── */

export function useSafetyPermits(filters?: {
  status?: SafetyPermitStatus | 'all';
  permitType?: SafetyPermitType | 'all';
  search?: string;
}) {
  const status = filters?.status ?? 'all';
  const type = filters?.permitType ?? 'all';
  const search = filters?.search?.trim() ?? '';

  return useQuery({
    queryKey: ['safety', 'permits', 'list', { status, type, search }],
    queryFn: async (): Promise<SafetyPermitRow[]> => {
      let q = supabase
        .from('safety_permits')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (status !== 'all') q = q.eq('status', status);
      if (type !== 'all') q = q.eq('permit_type', type);
      if (search.length >= 2) {
        q = q.or(
          `scope.ilike.%${search}%,location.ilike.%${search}%,permit_number.ilike.%${search}%`,
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SafetyPermitRow[];
    },
    staleTime: 30_000,
  });
}

export function useSafetyPermit(permitId: string | undefined) {
  return useQuery({
    queryKey: ['safety', 'permits', 'detail', permitId ?? 'none'],
    enabled: !!permitId,
    queryFn: async (): Promise<SafetyPermitRow> => {
      const { data, error } = await supabase
        .from('safety_permits')
        .select('*')
        .eq('id', permitId!)
        .single();
      if (error) throw error;
      return data as SafetyPermitRow;
    },
  });
}

export function useSafetyPermitApprovals(permitId: string | undefined) {
  return useQuery({
    queryKey: ['safety', 'permits', 'approvals', permitId ?? 'none'],
    enabled: !!permitId,
    queryFn: async (): Promise<SafetyPermitApprovalRow[]> => {
      const { data, error } = await supabase
        .from('safety_permit_approvals')
        .select('*')
        .eq('permit_id', permitId!)
        .order('level', { ascending: true });
      if (error) throw error;
      return (data ?? []) as SafetyPermitApprovalRow[];
    },
  });
}

export function useSafetyPermitHira(permitId: string | undefined) {
  return useQuery({
    queryKey: ['safety', 'permits', 'hira', permitId ?? 'none'],
    enabled: !!permitId,
    queryFn: async (): Promise<SafetyPermitHiraRow[]> => {
      const { data, error } = await supabase
        .from('safety_permit_hira')
        .select('*')
        .eq('permit_id', permitId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as SafetyPermitHiraRow[];
    },
  });
}

export function useSafetyPermitLotoSteps(permitId: string | undefined) {
  return useQuery({
    queryKey: ['safety', 'permits', 'loto', permitId ?? 'none'],
    enabled: !!permitId,
    queryFn: async (): Promise<SafetyPermitLotoStepRow[]> => {
      const { data, error } = await supabase
        .from('safety_permit_loto_steps')
        .select('*')
        .eq('permit_id', permitId!)
        .order('step_no', { ascending: true });
      if (error) throw error;
      return (data ?? []) as SafetyPermitLotoStepRow[];
    },
  });
}

/* ──────────────────────────────────────────────── type config (admin) ─── */

export function useSafetyPermitTypeConfig(permitType?: SafetyPermitType | 'all') {
  return useQuery({
    queryKey: ['safety', 'permits', 'type-config', permitType ?? 'all'],
    queryFn: async (): Promise<SafetyPermitTypeConfigRow[]> => {
      let q = supabase
        .from('safety_permit_type_config')
        .select('*')
        .order('permit_type', { ascending: true })
        .order('level', { ascending: true });
      if (permitType && permitType !== 'all') q = q.eq('permit_type', permitType);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SafetyPermitTypeConfigRow[];
    },
    staleTime: 60_000,
  });
}

export function useUpsertPermitTypeConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Array<{
      id?: string;
      permit_type: SafetyPermitType;
      level: number;
      approver_role: SafetyAppRole;
      label: string;
      is_active?: boolean;
    }>) => {
      const { error } = await supabase
        .from('safety_permit_type_config')
        .upsert(rows, { onConflict: 'id' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['safety', 'permits', 'type-config'] }),
  });
}

export function useDeletePermitTypeConfigRow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('safety_permit_type_config').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['safety', 'permits', 'type-config'] }),
  });
}

/* ────────────────────────────────────────────────────────────── create ─── */

export interface CreatePermitDraftInput {
  permit_type: SafetyPermitType;
  scope: string;
  location: string;
  start_at: string; // ISO
  end_at: string;   // ISO
  business_unit_id?: string | null;
  department_id?: string | null;
  loto_required?: boolean;
  hira_summary?: string | null;
  hira_rows?: Array<{ hazard: string; risk_before: string; controls: string; risk_after: string }>;
  loto_steps?: Array<{ step_no: number; description: string }>;
}

export function useCreatePermitDraft() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: CreatePermitDraftInput): Promise<SafetyPermitRow> => {
      if (!user) throw new Error('Not signed in');
      const { data, error } = await supabase
        .from('safety_permits')
        .insert({
          permit_type: input.permit_type,
          scope: input.scope,
          location: input.location,
          start_at: input.start_at,
          end_at: input.end_at,
          business_unit_id: input.business_unit_id ?? null,
          department_id: input.department_id ?? null,
          loto_required: input.loto_required ?? false,
          hira_summary: input.hira_summary ?? null,
          requested_by: user.id,
          status: 'draft',
        })
        .select('*')
        .single();
      if (error) throw error;
      const permit = data as SafetyPermitRow;

      if (input.hira_rows?.length) {
        const { error: hErr } = await supabase.from('safety_permit_hira').insert(
          input.hira_rows.map((r) => ({ ...r, permit_id: permit.id })),
        );
        if (hErr) throw hErr;
      }
      if (input.loto_steps?.length) {
        const { error: lErr } = await supabase.from('safety_permit_loto_steps').insert(
          input.loto_steps.map((s) => ({ ...s, permit_id: permit.id })),
        );
        if (lErr) throw lErr;
      }
      return permit;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['safety', 'permits'] }),
  });
}

/* ────────────────────────────────────────────── lifecycle (RPC only) ─── */

function refreshPermit(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['safety', 'permits'] });
}

export function useSubmitPermit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (permitId: string) => {
      const { data, error } = await supabase.rpc('submit_permit', { p_permit_id: permitId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => refreshPermit(qc),
  });
}

export function useDecidePermitLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      permitId: string;
      decision: 'approved' | 'rejected';
      notes?: string;
    }) => {
      const { data, error } = await supabase.rpc('decide_permit_level', {
        p_permit_id: input.permitId,
        p_decision: input.decision,
        p_notes: input.notes ?? '',
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => refreshPermit(qc),
  });
}

export function useActivatePermit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (permitId: string) => {
      const { data, error } = await supabase.rpc('activate_permit', { p_permit_id: permitId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => refreshPermit(qc),
  });
}

export function useSuspendPermit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { permitId: string; reason: string }) => {
      const { data, error } = await supabase.rpc('suspend_permit', {
        p_permit_id: input.permitId,
        p_reason: input.reason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => refreshPermit(qc),
  });
}

export function useClosePermit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { permitId: string; notes?: string }) => {
      const { data, error } = await supabase.rpc('close_permit', {
        p_permit_id: input.permitId,
        p_notes: input.notes ?? '',
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => refreshPermit(qc),
  });
}