import { supabase } from '@/integrations/supabase/client';

export type ReviewNoteStatus = 'pending' | 'in_progress' | 'completed';
export type ReviewNotePriority = 'low' | 'medium' | 'high';
export type ReviewNoteCategory =
  | 'kpi_change'
  | 'weightage_change'
  | 'target_change'
  | 'new_kpi'
  | 'remove_kpi'
  | 'role_realignment'
  | 'training_need'
  | 'other';

export interface ReviewActionNote {
  id: string;
  subject_employee_id: string;
  kpi_id: string | null;
  period_id: string | null;
  category: ReviewNoteCategory;
  title: string;
  details: string | null;
  status: ReviewNoteStatus;
  priority: ReviewNotePriority;
  assignee_id: string | null;
  target_period_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  completed_by: string | null;
}

export interface ReviewActionNoteInput {
  subject_employee_id: string;
  kpi_id?: string | null;
  period_id?: string | null;
  category: ReviewNoteCategory;
  title: string;
  details?: string | null;
  priority?: ReviewNotePriority;
  assignee_id?: string | null;
  target_period_id?: string | null;
}

export interface ListFilters {
  status?: ReviewNoteStatus | 'all';
  subject_employee_id?: string;
  assignee_id?: string;
  period_id?: string;
  category?: ReviewNoteCategory;
  priority?: ReviewNotePriority;
  search?: string;
}

const TABLE = 'review_action_notes' as const;

export async function listReviewNotes(filters: ListFilters = {}): Promise<ReviewActionNote[]> {
  let q = (supabase as any).from(TABLE).select('*').order('updated_at', { ascending: false });
  if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status);
  if (filters.subject_employee_id) q = q.eq('subject_employee_id', filters.subject_employee_id);
  if (filters.assignee_id) q = q.eq('assignee_id', filters.assignee_id);
  if (filters.period_id) q = q.eq('period_id', filters.period_id);
  if (filters.category) q = q.eq('category', filters.category);
  if (filters.priority) q = q.eq('priority', filters.priority);
  if (filters.search && filters.search.trim()) {
    const s = `%${filters.search.trim()}%`;
    q = q.or(`title.ilike.${s},details.ilike.${s}`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data as ReviewActionNote[]) ?? [];
}

export async function createReviewNote(input: ReviewActionNoteInput, createdBy: string): Promise<ReviewActionNote> {
  const payload = {
    subject_employee_id: input.subject_employee_id,
    kpi_id: input.kpi_id ?? null,
    period_id: input.period_id ?? null,
    category: input.category,
    title: input.title.trim(),
    details: input.details?.trim() || null,
    priority: input.priority ?? 'medium',
    assignee_id: input.assignee_id ?? null,
    target_period_id: input.target_period_id ?? null,
    created_by: createdBy,
  };
  const { data, error } = await (supabase as any).from(TABLE).insert(payload).select('*').single();
  if (error) throw error;
  return data as ReviewActionNote;
}

export async function updateReviewNote(id: string, patch: Partial<ReviewActionNoteInput> & { status?: ReviewNoteStatus }): Promise<ReviewActionNote> {
  const { data, error } = await (supabase as any).from(TABLE).update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  return data as ReviewActionNote;
}

export async function setReviewNoteStatus(id: string, status: ReviewNoteStatus): Promise<ReviewActionNote> {
  return updateReviewNote(id, { status });
}

export async function deleteReviewNote(id: string): Promise<void> {
  const { error } = await (supabase as any).from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

export const REVIEW_NOTE_CATEGORY_LABELS: Record<ReviewNoteCategory, string> = {
  kpi_change: 'KPI Change',
  weightage_change: 'Weightage Change',
  target_change: 'Target Change',
  new_kpi: 'New KPI',
  remove_kpi: 'Remove KPI',
  role_realignment: 'Role Realignment',
  training_need: 'Training Need',
  other: 'Other',
};

export const REVIEW_NOTE_STATUS_LABELS: Record<ReviewNoteStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
};

export const REVIEW_NOTE_PRIORITY_LABELS: Record<ReviewNotePriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};