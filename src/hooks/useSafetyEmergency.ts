import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  SafetyDrillStatus,
  SafetyDrillType,
  SafetyEmergencyContactType,
} from '@/lib/safetyEmergency';

/**
 * Phase 6 data layer. Cache prefix `['safety','emergency',...]`.
 * Lifecycle moves are RPC-only (`start_drill`, `complete_drill`, `review_drill`).
 */

export interface SafetyDrillRow {
  id: string;
  drill_code: string;
  type: SafetyDrillType;
  scenario: string;
  business_unit_id: string | null;
  location: string | null;
  scheduled_at: string;
  started_at: string | null;
  completed_at: string | null;
  evacuation_seconds: number | null;
  score: number | null;
  status: SafetyDrillStatus;
  conducted_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface SafetyDrillParticipantRow {
  id: string;
  drill_id: string;
  user_id: string;
  role: string | null;
  mustered_at: string | null;
  accounted_for: boolean;
  notes: string | null;
}

export interface SafetyDrillFindingRow {
  id: string;
  drill_id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  observation: string;
  corrective_action: string | null;
  owner_id: string | null;
  due_date: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface SafetyEmergencyContactRow {
  id: string;
  name: string;
  role_title: string | null;
  phone_primary: string;
  phone_alt: string | null;
  email: string | null;
  business_unit_id: string | null;
  location: string | null;
  contact_type: SafetyEmergencyContactType;
  sort_order: number;
  is_active: boolean;
}

/* ───────────────────────────── drills ─── */

export function useDrills(filters?: {
  status?: SafetyDrillStatus | 'all';
  type?: SafetyDrillType | 'all';
}) {
  const status = filters?.status ?? 'all';
  const type = filters?.type ?? 'all';
  return useQuery({
    queryKey: ['safety', 'emergency', 'drills', { status, type }],
    queryFn: async (): Promise<SafetyDrillRow[]> => {
      let q = supabase
        .from('safety_emergency_drills')
        .select('*')
        .order('scheduled_at', { ascending: false })
        .limit(500);
      if (status !== 'all') q = q.eq('status', status);
      if (type !== 'all') q = q.eq('type', type);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SafetyDrillRow[];
    },
    staleTime: 30_000,
  });
}

export function useDrill(drillId: string | undefined) {
  return useQuery({
    queryKey: ['safety', 'emergency', 'drill', drillId ?? 'none'],
    enabled: !!drillId,
    queryFn: async (): Promise<SafetyDrillRow> => {
      const { data, error } = await supabase
        .from('safety_emergency_drills')
        .select('*')
        .eq('id', drillId!)
        .single();
      if (error) throw error;
      return data as SafetyDrillRow;
    },
  });
}

export function useDrillParticipants(drillId: string | undefined) {
  return useQuery({
    queryKey: ['safety', 'emergency', 'participants', drillId ?? 'none'],
    enabled: !!drillId,
    queryFn: async (): Promise<SafetyDrillParticipantRow[]> => {
      const { data, error } = await supabase
        .from('safety_drill_participants')
        .select('*')
        .eq('drill_id', drillId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as SafetyDrillParticipantRow[];
    },
  });
}

export function useDrillFindings(drillId: string | undefined) {
  return useQuery({
    queryKey: ['safety', 'emergency', 'findings', drillId ?? 'none'],
    enabled: !!drillId,
    queryFn: async (): Promise<SafetyDrillFindingRow[]> => {
      const { data, error } = await supabase
        .from('safety_drill_findings')
        .select('*')
        .eq('drill_id', drillId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SafetyDrillFindingRow[];
    },
  });
}

export function useCreateDrill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      drill_code: string;
      type: SafetyDrillType;
      scenario: string;
      business_unit_id?: string | null;
      location?: string | null;
      scheduled_at: string;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('safety_emergency_drills')
        .insert({ ...input, created_by: u.user?.id ?? null })
        .select('*')
        .single();
      if (error) throw error;
      return data as SafetyDrillRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['safety', 'emergency', 'drills'] }),
  });
}

export function useUpsertParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      drill_id: string;
      user_id: string;
      role?: string | null;
      accounted_for?: boolean;
      mustered_at?: string | null;
      notes?: string | null;
    }) => {
      const { error } = await supabase
        .from('safety_drill_participants')
        .upsert(input, { onConflict: 'drill_id,user_id' });
      if (error) throw error;
      return true;
    },
    onSuccess: (_v, vars) =>
      qc.invalidateQueries({ queryKey: ['safety', 'emergency', 'participants', vars.drill_id] }),
  });
}

export function useAddFinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      drill_id: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      observation: string;
      corrective_action?: string | null;
      owner_id?: string | null;
      due_date?: string | null;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('safety_drill_findings')
        .insert({ ...input, created_by: u.user?.id ?? null });
      if (error) throw error;
      return true;
    },
    onSuccess: (_v, vars) =>
      qc.invalidateQueries({ queryKey: ['safety', 'emergency', 'findings', vars.drill_id] }),
  });
}

export function useStartDrill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (drillId: string) => {
      const { data, error } = await supabase.rpc('start_drill', { p_drill_id: drillId });
      if (error) throw error;
      const r = data as { ok: boolean; error?: string };
      if (!r?.ok) throw new Error(r?.error ?? 'start_failed');
      return r;
    },
    onSuccess: (_v, drillId) => {
      qc.invalidateQueries({ queryKey: ['safety', 'emergency', 'drill', drillId] });
      qc.invalidateQueries({ queryKey: ['safety', 'emergency', 'drills'] });
    },
  });
}

export function useCompleteDrill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { drillId: string; evacuationSeconds?: number; score?: number }) => {
      const { data, error } = await supabase.rpc('complete_drill', {
        p_drill_id: input.drillId,
        p_evacuation_seconds: input.evacuationSeconds ?? null,
        p_score: input.score ?? null,
      });
      if (error) throw error;
      const r = data as { ok: boolean; error?: string };
      if (!r?.ok) throw new Error(r?.error ?? 'complete_failed');
      return r;
    },
    onSuccess: (_v, vars) => {
      qc.invalidateQueries({ queryKey: ['safety', 'emergency', 'drill', vars.drillId] });
      qc.invalidateQueries({ queryKey: ['safety', 'emergency', 'drills'] });
    },
  });
}

export function useReviewDrill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { drillId: string; summary?: string }) => {
      const { data, error } = await supabase.rpc('review_drill', {
        p_drill_id: input.drillId,
        p_summary: input.summary ?? null,
      });
      if (error) throw error;
      const r = data as { ok: boolean; error?: string };
      if (!r?.ok) throw new Error(r?.error ?? 'review_failed');
      return r;
    },
    onSuccess: (_v, vars) => {
      qc.invalidateQueries({ queryKey: ['safety', 'emergency', 'drill', vars.drillId] });
      qc.invalidateQueries({ queryKey: ['safety', 'emergency', 'drills'] });
    },
  });
}

/* ───────────────────────────── contacts ─── */

export function useEmergencyContacts(filters?: {
  type?: SafetyEmergencyContactType | 'all';
  activeOnly?: boolean;
}) {
  const type = filters?.type ?? 'all';
  const activeOnly = filters?.activeOnly ?? true;
  return useQuery({
    queryKey: ['safety', 'emergency', 'contacts', { type, activeOnly }],
    queryFn: async (): Promise<SafetyEmergencyContactRow[]> => {
      let q = supabase
        .from('safety_emergency_contacts')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })
        .limit(500);
      if (activeOnly) q = q.eq('is_active', true);
      if (type !== 'all') q = q.eq('contact_type', type);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SafetyEmergencyContactRow[];
    },
    staleTime: 60_000,
  });
}

export function useUpsertEmergencyContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<SafetyEmergencyContactRow> & { id?: string }) => {
      const payload = { ...input };
      if (input.id) {
        const { id, ...patch } = payload;
        const { error } = await supabase
          .from('safety_emergency_contacts')
          .update(patch)
          .eq('id', id);
        if (error) throw error;
        return true;
      }
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('safety_emergency_contacts')
        .insert({ ...payload, created_by: u.user?.id ?? null } as any);
      if (error) throw error;
      return true;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['safety', 'emergency', 'contacts'] }),
  });
}

export function useDeleteEmergencyContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('safety_emergency_contacts').delete().eq('id', id);
      if (error) throw error;
      return true;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['safety', 'emergency', 'contacts'] }),
  });
}
