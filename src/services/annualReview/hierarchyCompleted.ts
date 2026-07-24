import { supabase } from '@/integrations/supabase/client';

export interface HierarchyCompletedRow {
  id: string;
  employee_id: string;
  employee_name: string | null;
  employee_code: string | null;
  designation: string | null;
  department_name: string | null;
  business_unit_name: string | null;
  overall_status: string;
  total_score: number | null;
  updated_at: string | null;
  viewer_relationship:
    | 'admin' | 'hr' | 'management' | 'bu_head' | 'dept_head' | 'skip' | 'manager' | 'upline';
}

export interface HierarchyCompletedPage {
  rows: HierarchyCompletedRow[];
  total: number;
}

export interface ListHierarchyArgs {
  cycleId: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

/**
 * ADR-162 — Hierarchy visibility of completed annual reviews.
 * Returns COMPLETED reviews for employees anywhere in the caller's
 * reporting downline (or all — for Admin / HR PMS), restricted to
 * employees that have platform login access.
 */
export async function listHierarchyCompletedReviews(
  args: ListHierarchyArgs,
): Promise<HierarchyCompletedPage> {
  const { data, error } = await supabase.rpc('get_hierarchy_completed_reviews', {
    p_cycle_id:   args.cycleId,
    p_search:     args.search ?? null,
    p_page:       args.page ?? 1,
    p_page_size:  args.pageSize ?? 20,
  });
  if (error) throw error;
  const payload = (data ?? {}) as { rows?: HierarchyCompletedRow[]; total?: number };
  return {
    rows: Array.isArray(payload.rows) ? payload.rows : [],
    total: Number(payload.total ?? 0),
  };
}