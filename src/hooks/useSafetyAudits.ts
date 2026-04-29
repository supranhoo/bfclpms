import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  SafetyAuditAnswer,
  SafetyAuditRunStatus,
} from '@/lib/safetyAudits';

/**
 * Phase 5 data layer for safety audit checklists.
 *
 * Cache prefix: ['safety','audits']. Realtime sync invalidates on every
 * change to the four audit tables.
 *
 * Lifecycle moves are RPC-only (`submit_audit_run`, `mark_audit_reviewed`).
 * Direct status writes are blocked by a BEFORE UPDATE trigger.
 */

export interface SafetyAuditTemplateRow {
  id: string;
  code: string;
  title: string;
  description: string | null;
  category: string;
  version: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SafetyAuditTemplateItemRow {
  id: string;
  template_id: string;
  section: string;
  prompt: string;
  weight: number;
  is_critical: boolean;
  evidence_required: boolean;
  sort_order: number;
  created_at: string;
}

export interface SafetyAuditRunRow {
  id: string;
  template_id: string;
  business_unit_id: string | null;
  department_id: string | null;
  location: string | null;
  conducted_by: string | null;
  conducted_at: string;
  status: SafetyAuditRunStatus;
  score: number | null;
  critical_failures: number;
  reviewed_by: string | null;
  reviewed_at: string | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface SafetyAuditResponseRow {
  id: string;
  run_id: string;
  item_id: string;
  answer: SafetyAuditAnswer;
  score: number;
  notes: string | null;
  evidence_path: string | null;
  auto_incident_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/* ───────────────────────────────────── lists ─── */

export function useAuditTemplates(filters?: { activeOnly?: boolean; search?: string }) {
  const activeOnly = filters?.activeOnly ?? true;
  const search = filters?.search?.trim() ?? '';
  return useQuery({
    queryKey: ['safety', 'audits', 'templates', { activeOnly, search }],
    queryFn: async (): Promise<SafetyAuditTemplateRow[]> => {
      let q = supabase
        .from('safety_audit_templates')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(500);
      if (activeOnly) q = q.eq('is_active', true);
      if (search.length >= 2) {
        q = q.or(`title.ilike.%${search}%,code.ilike.%${search}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SafetyAuditTemplateRow[];
    },
    staleTime: 60_000,
  });
}

export function useAuditTemplate(templateId: string | undefined) {
  return useQuery({
    queryKey: ['safety', 'audits', 'template', templateId ?? 'none'],
    enabled: !!templateId,
    queryFn: async (): Promise<SafetyAuditTemplateRow> => {
      const { data, error } = await supabase
        .from('safety_audit_templates')
        .select('*')
        .eq('id', templateId!)
        .single();
      if (error) throw error;
      return data as SafetyAuditTemplateRow;
    },
  });
}

export function useAuditTemplateItems(templateId: string | undefined) {
  return useQuery({
    queryKey: ['safety', 'audits', 'items', templateId ?? 'none'],
    enabled: !!templateId,
    queryFn: async (): Promise<SafetyAuditTemplateItemRow[]> => {
      const { data, error } = await supabase
        .from('safety_audit_template_items')
        .select('*')
        .eq('template_id', templateId!)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as SafetyAuditTemplateItemRow[];
    },
  });
}

export function useAuditRuns(filters?: {
  status?: SafetyAuditRunStatus | 'all';
  templateId?: string | 'all';
}) {
  const status = filters?.status ?? 'all';
  const templateId = filters?.templateId ?? 'all';
  return useQuery({
    queryKey: ['safety', 'audits', 'runs', { status, templateId }],
    queryFn: async (): Promise<SafetyAuditRunRow[]> => {
      let q = supabase
        .from('safety_audit_runs')
        .select('*')
        .order('conducted_at', { ascending: false })
        .limit(500);
      if (status !== 'all') q = q.eq('status', status);
      if (templateId !== 'all') q = q.eq('template_id', templateId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SafetyAuditRunRow[];
    },
    staleTime: 30_000,
  });
}

export function useAuditRun(runId: string | undefined) {
  return useQuery({
    queryKey: ['safety', 'audits', 'run', runId ?? 'none'],
    enabled: !!runId,
    queryFn: async (): Promise<SafetyAuditRunRow> => {
      const { data, error } = await supabase
        .from('safety_audit_runs')
        .select('*')
        .eq('id', runId!)
        .single();
      if (error) throw error;
      return data as SafetyAuditRunRow;
    },
  });
}

export function useAuditResponses(runId: string | undefined) {
  return useQuery({
    queryKey: ['safety', 'audits', 'responses', runId ?? 'none'],
    enabled: !!runId,
    queryFn: async (): Promise<SafetyAuditResponseRow[]> => {
      const { data, error } = await supabase
        .from('safety_audit_run_responses')
        .select('*')
        .eq('run_id', runId!);
      if (error) throw error;
      return (data ?? []) as SafetyAuditResponseRow[];
    },
  });
}

/* ───────────────────────────────────── mutations ─── */

export function useCreateAuditTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      code: string;
      title: string;
      description?: string | null;
      category: string;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('safety_audit_templates')
        .insert({ ...input, created_by: u.user?.id ?? null })
        .select('*')
        .single();
      if (error) throw error;
      return data as SafetyAuditTemplateRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['safety', 'audits', 'templates'] }),
  });
}

export function useUpdateAuditTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string } & Partial<SafetyAuditTemplateRow>) => {
      const { id, ...patch } = input;
      const { data, error } = await supabase
        .from('safety_audit_templates')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data as SafetyAuditTemplateRow;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['safety', 'audits', 'templates'] });
      qc.invalidateQueries({ queryKey: ['safety', 'audits', 'template', row.id] });
    },
  });
}

export function useUpsertTemplateItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      templateId: string;
      items: Array<Omit<SafetyAuditTemplateItemRow, 'id' | 'created_at' | 'template_id'> & { id?: string }>;
      removedIds: string[];
    }) => {
      if (input.removedIds.length > 0) {
        const { error } = await supabase
          .from('safety_audit_template_items')
          .delete()
          .in('id', input.removedIds);
        if (error) throw error;
      }
      // Upsert: existing rows by id; new rows get inserted.
      const payload = input.items.map((it, idx) => ({
        ...(it.id ? { id: it.id } : {}),
        template_id: input.templateId,
        section: it.section,
        prompt: it.prompt,
        weight: it.weight,
        is_critical: it.is_critical,
        evidence_required: it.evidence_required,
        sort_order: it.sort_order ?? idx,
      }));
      if (payload.length > 0) {
        const { error } = await supabase
          .from('safety_audit_template_items')
          .upsert(payload, { onConflict: 'id' });
        if (error) throw error;
      }
      return true;
    },
    onSuccess: (_v, vars) => {
      qc.invalidateQueries({ queryKey: ['safety', 'audits', 'items', vars.templateId] });
    },
  });
}

export function useCreateAuditRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      template_id: string;
      business_unit_id?: string | null;
      department_id?: string | null;
      location?: string | null;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('safety_audit_runs')
        .insert({
          ...input,
          conducted_by: u.user?.id ?? null,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as SafetyAuditRunRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['safety', 'audits', 'runs'] }),
  });
}

export function useUpsertResponse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      run_id: string;
      item_id: string;
      answer: SafetyAuditAnswer;
      notes?: string | null;
      evidence_path?: string | null;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('safety_audit_run_responses')
        .upsert(
          {
            ...input,
            created_by: u.user?.id ?? null,
          },
          { onConflict: 'run_id,item_id' },
        );
      if (error) throw error;
      return true;
    },
    onSuccess: (_v, vars) => {
      qc.invalidateQueries({ queryKey: ['safety', 'audits', 'responses', vars.run_id] });
    },
  });
}

export function useSubmitAuditRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (runId: string) => {
      const { data, error } = await supabase.rpc('submit_audit_run', { p_run_id: runId });
      if (error) throw error;
      const result = data as { ok: boolean; error?: string; score?: number; critical_failures?: number };
      if (!result?.ok) throw new Error(result?.error ?? 'submit_failed');
      return result;
    },
    onSuccess: (_v, runId) => {
      qc.invalidateQueries({ queryKey: ['safety', 'audits', 'run', runId] });
      qc.invalidateQueries({ queryKey: ['safety', 'audits', 'runs'] });
      qc.invalidateQueries({ queryKey: ['safety', 'audits', 'responses', runId] });
    },
  });
}

export function useReviewAuditRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { runId: string; summary?: string }) => {
      const { data, error } = await supabase.rpc('mark_audit_reviewed', {
        p_run_id: input.runId,
        p_summary: input.summary ?? null,
      });
      if (error) throw error;
      const result = data as { ok: boolean; error?: string };
      if (!result?.ok) throw new Error(result?.error ?? 'review_failed');
      return result;
    },
    onSuccess: (_v, vars) => {
      qc.invalidateQueries({ queryKey: ['safety', 'audits', 'run', vars.runId] });
      qc.invalidateQueries({ queryKey: ['safety', 'audits', 'runs'] });
    },
  });
}