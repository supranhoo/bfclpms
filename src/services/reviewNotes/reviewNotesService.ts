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
  applicable_from: string | null;
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
  /** YYYY-MM-01 — month when the change should take effect. Null = no specific cycle. */
  applicable_from?: string | null;
}

export interface ListFilters {
  status?: ReviewNoteStatus | 'all';
  subject_employee_id?: string;
  assignee_id?: string;
  period_id?: string;
  category?: ReviewNoteCategory;
  priority?: ReviewNotePriority;
  search?: string;
  /** Inclusive lower bound on applicable_from (YYYY-MM-01). */
  applicable_from_gte?: string;
  /** Inclusive upper bound on applicable_from (YYYY-MM-01). */
  applicable_from_lte?: string;
}

const TABLE = 'review_action_notes' as const;

export async function listReviewNotes(filters: ListFilters = {}): Promise<ReviewActionNote[]> {
  // Default sort: upcoming target cycles first (nulls last), then most-recently updated.
  let q = (supabase as any)
    .from(TABLE)
    .select('*')
    .order('applicable_from', { ascending: true, nullsFirst: false })
    .order('updated_at', { ascending: false });
  if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status);
  if (filters.subject_employee_id) q = q.eq('subject_employee_id', filters.subject_employee_id);
  if (filters.assignee_id) q = q.eq('assignee_id', filters.assignee_id);
  if (filters.period_id) q = q.eq('period_id', filters.period_id);
  if (filters.category) q = q.eq('category', filters.category);
  if (filters.priority) q = q.eq('priority', filters.priority);
  if (filters.applicable_from_gte) q = q.gte('applicable_from', filters.applicable_from_gte);
  if (filters.applicable_from_lte) q = q.lte('applicable_from', filters.applicable_from_lte);
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
    applicable_from: normaliseToFirstOfMonth(input.applicable_from ?? null),
    created_by: createdBy,
  };
  const { data, error } = await (supabase as any).from(TABLE).insert(payload).select('*').single();
  if (error) throw error;
  return data as ReviewActionNote;
}

export async function updateReviewNote(id: string, patch: Partial<ReviewActionNoteInput> & { status?: ReviewNoteStatus }): Promise<ReviewActionNote> {
  const normalised: any = { ...patch };
  if ('applicable_from' in normalised) {
    normalised.applicable_from = normaliseToFirstOfMonth(normalised.applicable_from ?? null);
  }
  const { data, error } = await (supabase as any).from(TABLE).update(normalised).eq('id', id).select('*').single();
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

/**
 * Snap any YYYY-MM-DD string to the first day of its month so the column always
 * represents a "month" value. Returns null for falsy input.
 */
export function normaliseToFirstOfMonth(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})/.exec(value);
  if (!m) return null;
  return `${m[1]}-${m[2]}-01`;
}

/** First day of next month, formatted YYYY-MM-01. */
export function nextMonthFirstDay(today: Date = new Date()): string {
  const d = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}-01`;
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