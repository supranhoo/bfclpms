import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ReassignableReviewerRole } from '@/services/annualReview/annualReviewService';

export interface ReviewerCandidate {
  id: string;
  full_name: string;
  employee_code: string | null;
}

/**
 * ADR-157 — return active profiles that hold the role required for the given
 * reviewer slot. The Management slot filters to users with the `management`
 * role; HR to `hr_pms`; every other reviewer slot to the `manager` role
 * (existing project convention — see AR directory rules).
 */
function requiredAppRole(role: ReassignableReviewerRole): string {
  if (role === 'management') return 'management';
  if (role === 'hr') return 'hr_pms';
  return 'manager';
}

export function useReviewerCandidates(role: ReassignableReviewerRole | null) {
  return useQuery({
    queryKey: ['ar', 'reviewer-candidates', role],
    enabled: !!role,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ReviewerCandidate[]> => {
      const appRole = requiredAppRole(role!);
      // Two-hop: user_roles -> profiles (active). Cap at 500 rows.
      const { data: rows, error } = await supabase
        .from('user_roles')
        .select('user_id, profiles:profiles!inner(id, full_name, employee_code, is_active)')
        .eq('role', appRole as never)
        .limit(500);
      if (error) throw error;
      const seen = new Set<string>();
      const out: ReviewerCandidate[] = [];
      for (const r of (rows ?? []) as Array<{
        profiles: { id: string; full_name: string; employee_code: string | null; is_active: boolean } | null;
      }>) {
        const p = r.profiles;
        if (!p || !p.is_active || seen.has(p.id)) continue;
        seen.add(p.id);
        out.push({ id: p.id, full_name: p.full_name, employee_code: p.employee_code });
      }
      out.sort((a, b) => a.full_name.localeCompare(b.full_name));
      return out;
    },
  });
}