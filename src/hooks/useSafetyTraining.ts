import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { SafetyTrainingStatus } from '@/lib/safetyTraining';
import type { SafetyAppRole } from '@/lib/safetyRoles';

/**
 * Phase 3-B Training data layer.
 *
 * - Cache keys live under `['safety','training', ...]` so realtime sync can
 *   mass-invalidate them via the existing pattern.
 * - Status moves go through RPCs only; the BEFORE UPDATE trigger blocks
 *   direct writes.
 * - `correct_index` is NEVER read on the client. Quizzes are scored by
 *   `submit_training_attempt` server-side.
 */

/* ─────────────────────────────────────────────────────────── types ─── */

export interface SafetySopRow {
  id: string;
  code: string;
  title: string;
  version: number;
  category: string | null;
  body_md: string;
  attachments: unknown;
  min_read_seconds: number;
  is_active: boolean;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SafetyQuizRow {
  id: string;
  sop_id: string;
  pass_threshold: number;
  time_limit_seconds: number | null;
  max_attempts: number;
  randomize: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SafetyQuizQuestionRow {
  id: string;
  quiz_id: string;
  prompt: string;
  options: string[];
  correct_index: number; // admin-only; workers never see this
  weight: number;
  sort_order: number;
  created_at: string;
}

export interface SafetyTrainingAssignmentRow {
  id: string;
  user_id: string;
  sop_id: string;
  assigned_by: string | null;
  business_unit_id: string | null;
  due_at: string | null;
  status: SafetyTrainingStatus;
  attempts_count: number;
  last_attempt_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SafetyTrainingAttemptRow {
  id: string;
  assignment_id: string;
  user_id: string;
  started_at: string;
  finished_at: string | null;
  reading_seconds: number;
  question_order: string[];
  answers: Record<string, number>;
  score: number | null;
  passed: boolean | null;
}

export interface AttemptRuntime {
  attempt_id: string;
  quiz: {
    pass_threshold: number;
    time_limit_seconds: number | null;
    max_attempts: number;
    attempts_used: number;
  };
  questions: Array<{
    id: string;
    prompt: string;
    options: string[];
    weight: number;
  }>;
}

/* ─────────────────────────────────────────────────────────── lists ─── */

export function useSafetySops(filters?: { activeOnly?: boolean; search?: string }) {
  const activeOnly = filters?.activeOnly ?? true;
  const search = filters?.search?.trim() ?? '';
  return useQuery({
    queryKey: ['safety', 'training', 'sops', { activeOnly, search }],
    queryFn: async (): Promise<SafetySopRow[]> => {
      let q = supabase
        .from('safety_sops')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(500);
      if (activeOnly) q = q.eq('is_active', true);
      if (search.length >= 2) {
        q = q.or(`title.ilike.%${search}%,code.ilike.%${search}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SafetySopRow[];
    },
    staleTime: 60_000,
  });
}

export function useSafetySop(sopId: string | undefined) {
  return useQuery({
    queryKey: ['safety', 'training', 'sop', sopId ?? 'none'],
    enabled: !!sopId,
    queryFn: async (): Promise<SafetySopRow> => {
      const { data, error } = await supabase
        .from('safety_sops')
        .select('*')
        .eq('id', sopId!)
        .single();
      if (error) throw error;
      return data as SafetySopRow;
    },
  });
}

export function useSafetyQuizForSop(sopId: string | undefined) {
  return useQuery({
    queryKey: ['safety', 'training', 'quiz-for-sop', sopId ?? 'none'],
    enabled: !!sopId,
    queryFn: async (): Promise<SafetyQuizRow | null> => {
      const { data, error } = await supabase
        .from('safety_quizzes')
        .select('*')
        .eq('sop_id', sopId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as SafetyQuizRow | null;
    },
  });
}

/** Admin-only: includes `correct_index`. Workers never call this. */
export function useSafetyQuizQuestions(quizId: string | undefined) {
  return useQuery({
    queryKey: ['safety', 'training', 'questions', quizId ?? 'none'],
    enabled: !!quizId,
    queryFn: async (): Promise<SafetyQuizQuestionRow[]> => {
      const { data, error } = await supabase
        .from('safety_quiz_questions')
        .select('*')
        .eq('quiz_id', quizId!)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        options: Array.isArray(r.options) ? r.options : [],
      })) as SafetyQuizQuestionRow[];
    },
  });
}

/** My assignments (worker view). */
export function useMyTrainingAssignments() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['safety', 'training', 'assignments', 'mine', user?.id ?? 'none'],
    enabled: !!user?.id,
    queryFn: async (): Promise<SafetyTrainingAssignmentRow[]> => {
      const { data, error } = await supabase
        .from('safety_training_assignments')
        .select('*')
        .eq('user_id', user!.id)
        .order('due_at', { ascending: true, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as SafetyTrainingAssignmentRow[];
    },
    staleTime: 30_000,
  });
}

/** Admin/dashboard view: all assignments for a given SOP. */
export function useSopAssignments(sopId: string | undefined) {
  return useQuery({
    queryKey: ['safety', 'training', 'assignments', 'by-sop', sopId ?? 'none'],
    enabled: !!sopId,
    queryFn: async (): Promise<SafetyTrainingAssignmentRow[]> => {
      const { data, error } = await supabase
        .from('safety_training_assignments')
        .select('*')
        .eq('sop_id', sopId!)
        .order('status', { ascending: true })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as SafetyTrainingAssignmentRow[];
    },
  });
}

/* ───────────────────────────────────────────────── SOP / quiz CRUD ─── */

export function useUpsertSop() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      code: string;
      title: string;
      version?: number;
      category?: string | null;
      body_md: string;
      min_read_seconds?: number;
      is_active?: boolean;
    }) => {
      const base = {
        code: input.code,
        title: input.title,
        version: input.version ?? 1,
        category: input.category ?? null,
        body_md: input.body_md,
        min_read_seconds: input.min_read_seconds ?? 60,
        is_active: input.is_active ?? true,
      };
      const q = input.id
        ? supabase.from('safety_sops').update(base).eq('id', input.id).select('*').single()
        : supabase
            .from('safety_sops')
            .insert({ ...base, created_by: user?.id ?? null })
            .select('*')
            .single();
      const { data, error } = await q;
      if (error) throw error;
      return data as SafetySopRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['safety', 'training'] }),
  });
}

export function useDeleteSop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sopId: string) => {
      const { error } = await supabase.from('safety_sops').delete().eq('id', sopId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['safety', 'training'] }),
  });
}

export function useUpsertQuiz() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      sop_id: string;
      pass_threshold?: number;
      time_limit_seconds?: number | null;
      max_attempts?: number;
      randomize?: boolean;
      is_active?: boolean;
    }) => {
      const payload = {
        sop_id: input.sop_id,
        pass_threshold: input.pass_threshold ?? 80,
        time_limit_seconds: input.time_limit_seconds ?? null,
        max_attempts: input.max_attempts ?? 3,
        randomize: input.randomize ?? true,
        is_active: input.is_active ?? true,
      };
      const q = input.id
        ? supabase.from('safety_quizzes').update(payload).eq('id', input.id).select('*').single()
        : supabase.from('safety_quizzes').insert(payload).select('*').single();
      const { data, error } = await q;
      if (error) throw error;
      return data as SafetyQuizRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['safety', 'training'] }),
  });
}

export function useUpsertQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      quiz_id: string;
      prompt: string;
      options: string[];
      correct_index: number;
      weight?: number;
      sort_order?: number;
    }) => {
      const payload = {
        quiz_id: input.quiz_id,
        prompt: input.prompt,
        options: input.options as unknown as never,
        correct_index: input.correct_index,
        weight: input.weight ?? 1,
        sort_order: input.sort_order ?? 0,
      };
      const q = input.id
        ? supabase
            .from('safety_quiz_questions')
            .update(payload)
            .eq('id', input.id)
            .select('*')
            .single()
        : supabase.from('safety_quiz_questions').insert(payload).select('*').single();
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['safety', 'training'] }),
  });
}

export function useDeleteQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('safety_quiz_questions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['safety', 'training'] }),
  });
}

/* ────────────────────────────────────────────────── assignment RPCs ─── */

export function useAssignSopToRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      sopId: string;
      role: SafetyAppRole;
      businessUnitId?: string | null;
      dueInDays?: number;
    }) => {
      const { data, error } = await supabase.rpc('assign_sop_to_role', {
        _sop_id: input.sopId,
        _role: input.role,
        _business_unit_id: input.businessUnitId ?? null,
        _due_in_days: input.dueInDays ?? 7,
      });
      if (error) throw error;
      return data as { ok: boolean; error?: string; result?: { assigned: number; due_at: string } };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['safety', 'training'] }),
  });
}

/* ───────────────────────────────────────────────────── attempt RPCs ─── */

export function useStartTrainingAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (assignmentId: string): Promise<AttemptRuntime> => {
      const { data, error } = await supabase.rpc('start_training_attempt', {
        _assignment_id: assignmentId,
      });
      if (error) throw error;
      const env = data as unknown as { ok: boolean; error?: string; result?: AttemptRuntime };
      if (!env?.ok || !env.result) throw new Error(env?.error ?? 'Could not start attempt');
      return env.result;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['safety', 'training'] }),
  });
}

export function useSubmitTrainingAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      attemptId: string;
      answers: Record<string, number>;
      readingSeconds: number;
    }) => {
      const { data, error } = await supabase.rpc('submit_training_attempt', {
        _attempt_id: input.attemptId,
        _answers: input.answers,
        _reading_seconds: input.readingSeconds,
      });
      if (error) throw error;
      const env = data as unknown as {
        ok: boolean;
        error?: string;
        result?: { score: number; passed: boolean; pass_threshold: number };
      };
      if (!env?.ok || !env.result) throw new Error(env?.error ?? 'Submission failed');
      return env.result;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['safety', 'training'] }),
  });
}