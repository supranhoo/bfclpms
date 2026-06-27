import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * v2.66.57 — Server-side paginated reviewer dashboard hook.
 * POLICY §PERF-AUDIT-PANEL-PAGINATION.
 *
 * Wraps the `get_reviewer_dashboard_page` RPC, which returns ONLY the
 * visible page of employee cards plus per-employee badge counts and a
 * window-total count. Replaces the cold-load fan-out used by
 * EmployeeSelectorGrid (full-roster profiles + org-wide period KPIs +
 * org-wide submission scores) for the audit / hr_pms / management /
 * skip_level reviewer views.
 *
 * Round-trips on cold load: ~45+ → 1 per page.
 * Payload: ~14 MB → ~10 KB at 24 cards per page.
 */

export type ReviewerDashboardViewLevel =
  | 'audit'
  | 'management'
  | 'hr_pms'
  | 'skip_level';

export type ReviewerDashboardSort =
  | 'name_asc'
  | 'name_desc'
  | 'updated_desc'
  | 'kpis_desc';

export type ReviewerEmployeeStatus = 'active' | 'inactive' | 'all';

export interface ReviewerDashboardPageParams {
  viewLevel: ReviewerDashboardViewLevel;
  period: string;
  year: number;
  search?: string | null;
  departmentId?: string | null;
  designationId?: string | null;
  gradeId?: string | null;
  managerId?: string | null;
  empStatus?: ReviewerEmployeeStatus;
  sort?: ReviewerDashboardSort;
  page: number;        // 1-indexed
  pageSize: number;
  enabled?: boolean;
}

export interface ReviewerDashboardRow {
  id: string;
  full_name: string;
  email: string | null;
  designation: string | null;
  department: string | null;
  grade: string | null;
  reporting_manager_id: string | null;
  is_active: boolean;
  avatar_url: string | null;
  total_kpis: number;
  cleared_kra_set: number;
  pending_count: number;
  reviewed_count: number;
}

export interface ReviewerDashboardPageResult {
  rows: ReviewerDashboardRow[];
  totalCount: number;
  totalPages: number;
}

export function useReviewerDashboardPage(params: ReviewerDashboardPageParams) {
  const { isReady, user } = useAuth();
  const {
    viewLevel, period, year,
    search, departmentId, designationId, gradeId, managerId,
    empStatus = 'active',
    sort = 'name_asc',
    page, pageSize,
    enabled = true,
  } = params;

  const safePage = Math.max(1, page | 0);
  const safeSize = Math.min(Math.max(pageSize | 0, 1), 200);
  const offset = (safePage - 1) * safeSize;

  return useQuery<ReviewerDashboardPageResult>({
    queryKey: [
      'reviewer-dashboard-page',
      viewLevel, period, year,
      search ?? '', departmentId ?? '', designationId ?? '',
      gradeId ?? '', managerId ?? '',
      empStatus, sort, safePage, safeSize, user?.id,
    ],
    enabled: enabled && isReady && !!user?.id && !!period && !!year,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    queryFn: async (): Promise<ReviewerDashboardPageResult> => {
      const { data, error } = await (supabase as any).rpc(
        'get_reviewer_dashboard_page',
        {
          p_view_level: viewLevel,
          p_period: period,
          p_year: year,
          p_search: search || null,
          p_department_id: departmentId || null,
          p_designation_id: designationId || null,
          p_grade_id: gradeId || null,
          p_manager_id: managerId || null,
          p_emp_status: empStatus,
          p_sort: sort,
          p_offset: offset,
          p_limit: safeSize,
        },
      );
      if (error) throw error;
      const list = (data as any[]) || [];
      const totalCount = list.length > 0 ? Number(list[0].total_count) || 0 : 0;
      const rows: ReviewerDashboardRow[] = list.map((r) => ({
        id: r.id,
        full_name: r.full_name,
        email: r.email,
        designation: r.designation,
        department: r.department,
        grade: r.grade,
        reporting_manager_id: r.reporting_manager_id,
        is_active: !!r.is_active,
        avatar_url: r.avatar_url,
        total_kpis: Number(r.total_kpis) || 0,
        cleared_kra_set: Number(r.cleared_kra_set) || 0,
        pending_count: Number(r.pending_count) || 0,
        reviewed_count: Number(r.reviewed_count) || 0,
      }));
      return {
        rows,
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / safeSize)),
      };
    },
  });
}