import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { setLastRpc } from '@/lib/diagnostics/lastRpc';

export interface ReviewPeriodPermissions {
  edit_kpi: boolean;
  submit_self_review: boolean;
  submit_manager_review: boolean;
  approve: boolean;
  edit_scores: boolean;
  add_comments: boolean;
  view_only: boolean;
  isLoading: boolean;
  periodStage: string | null;
}

const DEFAULT_OPEN: ReviewPeriodPermissions = {
  edit_kpi: true,
  submit_self_review: true,
  submit_manager_review: true,
  approve: true,
  edit_scores: true,
  add_comments: true,
  view_only: false,
  isLoading: false,
  periodStage: null,
};

/**
 * Fail-open default per action. `view_only` has INVERTED semantics
 * (true = restrictive), so the permissive default is `false`; every other
 * action's permissive default is `true`. Returning the wrong default here
 * would render a phantom "Governance lock active" badge on any transient
 * RPC error (see ADR-074, May 2026 RCA).
 */
function permissiveDefault(action: string): boolean {
  return action === 'view_only' ? false : true;
}

/**
 * Central hook to check governance permissions for the current user + review period.
 * Uses the `check_review_period_permission` RPC (Employee > Dept > Role > Global hierarchy).
 * Components consume this to gate edit/submit/approve actions.
 */
export function useReviewPeriodPermissions(
  periodName: string | null | undefined,
  reviewYear: number | null | undefined
): ReviewPeriodPermissions {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['review-period-permissions', user?.id, periodName, reviewYear],
    queryFn: async () => {
      if (!user?.id || !periodName || !reviewYear) return null;

      // Check all permission types in parallel
      const actions = [
        'edit_kpi', 'submit_self_review', 'submit_manager_review',
        'approve', 'edit_scores', 'add_comments', 'view_only',
      ];

      const results = await Promise.all(
        actions.map(async (action) => {
          const { data, error } = await supabase.rpc('check_review_period_permission', {
            p_user_id: user.id,
            p_period_name: periodName,
            p_review_year: reviewYear,
            p_action: action,
          });
          if (error) {
            console.warn(`Permission check failed for ${action}:`, error.message);
            setLastRpc('check_review_period_permission', null);
            // Fail-open: use the action-specific permissive default so a
            // failed `view_only` check does NOT flip the UI to read-only.
            return { action, allowed: permissiveDefault(action) };
          }
          // Defensive: a non-boolean payload (null/undefined from a partial
          // PostgREST error) must also fall back to the permissive default.
          const allowed = typeof data === 'boolean' ? data : permissiveDefault(action);
          return { action, allowed };
        })
      );

      const perms: Record<string, boolean> = {};
      results.forEach(r => { perms[r.action] = r.allowed; });

      // Also fetch the period stage
      const { data: periodData } = await supabase
        .from('review_periods')
        .select('current_stage')
        .eq('period_name', periodName)
        .eq('review_year', reviewYear)
        .maybeSingle();

      return {
        edit_kpi: perms.edit_kpi ?? true,
        submit_self_review: perms.submit_self_review ?? true,
        submit_manager_review: perms.submit_manager_review ?? true,
        approve: perms.approve ?? true,
        edit_scores: perms.edit_scores ?? true,
        add_comments: perms.add_comments ?? true,
        view_only: perms.view_only ?? false,
        periodStage: (periodData as any)?.current_stage || null,
      };
    },
    enabled: !!user?.id && !!periodName && !!reviewYear,
    staleTime: 30_000, // Cache for 30s to avoid excessive RPC calls
  });

  if (!data || isLoading) {
    return { ...DEFAULT_OPEN, isLoading };
  }

  return {
    edit_kpi: data.edit_kpi,
    submit_self_review: data.submit_self_review,
    submit_manager_review: data.submit_manager_review,
    approve: data.approve,
    edit_scores: data.edit_scores,
    add_comments: data.add_comments,
    view_only: data.view_only,
    isLoading: false,
    periodStage: data.periodStage as string | null,
  };
}
