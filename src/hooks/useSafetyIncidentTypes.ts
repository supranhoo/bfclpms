import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Admin-configurable Incident Types + per-type Severities.
 *
 * Source of truth lives in `safety_incident_types` and
 * `safety_incident_severities` (children). Replaces the hardcoded
 * `SAFETY_TYPE_LABELS` / `SAFETY_SEVERITY_LABELS` for new incidents.
 */

export interface SafetyIncidentTypeRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface SafetyIncidentSeverityRow {
  id: string;
  incident_type_id: string;
  code: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const TYPES_KEY = ['safety', 'incident-types'] as const;
const SEV_KEY = (typeId: string | null) => ['safety', 'incident-severities', typeId] as const;
const ALL_SEV_KEY = ['safety', 'incident-severities', 'all'] as const;

/** All incident types (active + inactive). */
export function useSafetyIncidentTypes(opts?: { activeOnly?: boolean }) {
  return useQuery({
    queryKey: [...TYPES_KEY, opts?.activeOnly ?? false],
    queryFn: async (): Promise<SafetyIncidentTypeRow[]> => {
      let q = supabase
        .from('safety_incident_types' as never)
        .select('*')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (opts?.activeOnly) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as SafetyIncidentTypeRow[];
    },
  });
}

export function useSafetyIncidentSeverities(typeId: string | null, opts?: { activeOnly?: boolean }) {
  return useQuery({
    queryKey: [...SEV_KEY(typeId), opts?.activeOnly ?? false],
    enabled: !!typeId,
    queryFn: async (): Promise<SafetyIncidentSeverityRow[]> => {
      let q = supabase
        .from('safety_incident_severities' as never)
        .select('*')
        .eq('incident_type_id', typeId!)
        .order('sort_order', { ascending: true })
        .order('label', { ascending: true });
      if (opts?.activeOnly) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as SafetyIncidentSeverityRow[];
    },
  });
}

/** All severities across all types (used by admin tools that need a global map). */
export function useAllSafetyIncidentSeverities() {
  return useQuery({
    queryKey: ALL_SEV_KEY,
    queryFn: async (): Promise<SafetyIncidentSeverityRow[]> => {
      const { data, error } = await supabase
        .from('safety_incident_severities' as never)
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as SafetyIncidentSeverityRow[];
    },
  });
}

export interface IncidentTypeInput {
  code: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

export function useUpsertSafetyIncidentType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: IncidentTypeInput }): Promise<SafetyIncidentTypeRow> => {
      const { data: u } = await supabase.auth.getUser();
      const actor = u?.user?.id ?? null;
      if (id) {
        const { data, error } = await supabase
          .from('safety_incident_types' as never)
          .update({ ...input, updated_by: actor } as never)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return data as unknown as SafetyIncidentTypeRow;
      } else {
        const { data, error } = await supabase
          .from('safety_incident_types' as never)
          .insert({ ...input, created_by: actor, updated_by: actor } as never)
          .select()
          .single();
        if (error) throw error;
        return data as unknown as SafetyIncidentTypeRow;
      }
    },
    onSuccess: (_r, v) => {
      toast.success(v.id ? 'Incident type updated' : 'Incident type created');
      qc.invalidateQueries({ queryKey: ['safety', 'incident-types'] });
    },
    onError: (e: Error) => toast.error(e.message ?? 'Save failed'),
  });
}

export function useDeleteSafetyIncidentType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('safety_incident_types' as never)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Incident type deleted');
      qc.invalidateQueries({ queryKey: ['safety', 'incident-types'] });
      qc.invalidateQueries({ queryKey: ['safety', 'incident-severities'] });
    },
    onError: (e: Error) => toast.error(e.message ?? 'Delete failed'),
  });
}

export interface IncidentSeverityInput {
  incident_type_id: string;
  code: string;
  label: string;
  sort_order?: number;
  is_active?: boolean;
}

export function useUpsertSafetyIncidentSeverity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: IncidentSeverityInput }) => {
      const { data: u } = await supabase.auth.getUser();
      const actor = u?.user?.id ?? null;
      if (id) {
        const { error } = await supabase
          .from('safety_incident_severities' as never)
          .update({ ...input, updated_by: actor } as never)
          .eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('safety_incident_severities' as never)
          .insert({ ...input, created_by: actor, updated_by: actor } as never);
        if (error) throw error;
      }
    },
    onSuccess: (_r, v) => {
      toast.success(v.id ? 'Severity updated' : 'Severity added');
      qc.invalidateQueries({ queryKey: ['safety', 'incident-severities'] });
    },
    onError: (e: Error) => toast.error(e.message ?? 'Save failed'),
  });
}

export function useReorderSafetyIncidentSeverities() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: { id: string; sort_order: number }[]) => {
      // Wave 2: fire the N updates in parallel so a 6-item reorder takes one
      // round-trip worth of latency instead of N. RLS evaluation is per-row
      // so this is safe — Postgres serialises the writes server-side.
      const results = await Promise.all(
        rows.map((r) =>
          supabase
            .from('safety_incident_severities' as never)
            .update({ sort_order: r.sort_order } as never)
            .eq('id', r.id),
        ),
      );
      const firstErr = results.find((r) => r.error)?.error;
      if (firstErr) throw firstErr;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['safety', 'incident-severities'] }),
    onError: (e: Error) => toast.error(e.message ?? 'Reorder failed'),
  });
}

export function useDeleteSafetyIncidentSeverity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Try a hard delete first. If it fails because incidents reference it
      // (FK has ON DELETE SET NULL — so this only fails if the constraint
      // posture changes), fall back to soft-deactivate.
      const { error } = await supabase
        .from('safety_incident_severities' as never)
        .delete()
        .eq('id', id);
      if (error) {
        const { error: e2 } = await supabase
          .from('safety_incident_severities' as never)
          .update({ is_active: false } as never)
          .eq('id', id);
        if (e2) throw e2;
        return { soft: true };
      }
      return { soft: false };
    },
    onSuccess: (res) => {
      if (res.soft) toast.success('Severity deactivated (in use by existing incidents)');
      else toast.success('Severity deleted');
      qc.invalidateQueries({ queryKey: ['safety', 'incident-severities'] });
    },
    onError: (e: Error) => toast.error(e.message ?? 'Delete failed'),
  });
}

/** Slug helper used by the admin form to suggest a code from the label. */
export function slugifyCode(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}