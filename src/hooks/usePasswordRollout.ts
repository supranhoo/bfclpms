import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { invokeAdminEdgeFunction } from '@/lib/adminEdgeFunction';

export interface EligibleUser {
  id: string;
  full_name: string | null;
  email: string;
  employee_code: string | null;
  designation: string | null;
  department_id: string | null;
  eligibility_type: 'has_kras' | 'reporting_manager' | 'auditor' | 'both' | 'role_holder';
}

export interface PasswordRolloutLog {
  id: string;
  user_id: string;
  employee_code: string | null;
  full_name: string | null;
  email: string | null;
  generated_by: string;
  email_sent: boolean;
  email_error: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

export function useEligibleUsers() {
  return useQuery({
    queryKey: ['eligible-login-users'],
    queryFn: async () => {
      // Query the view - cast to bypass type checking since it's a view
      const { data, error } = await (supabase as any)
        .from('eligible_login_users')
        .select('*');

      if (error) throw error;
      return (data || []) as EligibleUser[];
    },
  });
}

export function usePasswordRolloutLogs() {
  return useQuery({
    queryKey: ['password-rollout-logs'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('password_rollout_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as PasswordRolloutLog[];
    },
  });
}

export const ROLLOUT_HISTORY_PAGE_SIZE = 10;

export interface RolloutHistoryEntry {
  id: string;
  created_at: string;
  status: string;
  email_sent: boolean | null;
  email_error: string | null;
  error_message: string | null;
  generated_by: string | null;
  generated_by_name: string;
}

export interface RolloutHistoryPage {
  rows: RolloutHistoryEntry[];
  totalCount: number;
}

/** Range helper (exported for tests). */
export function rolloutHistoryRange(page: number, pageSize = ROLLOUT_HISTORY_PAGE_SIZE) {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 0;
  const from = safePage * pageSize;
  return { from, to: from + pageSize - 1 };
}

export function performerLabel(
  id: string | null,
  map: Record<string, { full_name: string | null; employee_code: string | null }>,
): string {
  if (!id) return 'System';
  const p = map[id];
  if (!p) return 'System';
  return p.employee_code ? `${p.full_name ?? 'Unknown'} (${p.employee_code})` : (p.full_name ?? 'System');
}

/**
 * Per-user password rollout history — server-side paginated (POLICY: no unbounded log loads).
 */
export function usePasswordRolloutHistory(userId: string | undefined, page: number) {
  return useQuery<RolloutHistoryPage>({
    queryKey: ['password-rollout-history', userId, page],
    enabled: !!userId,
    queryFn: async () => {
      const { from, to } = rolloutHistoryRange(page);
      const { data, error, count } = await (supabase as any)
        .from('password_rollout_logs')
        .select('id, created_at, status, email_sent, email_error, error_message, generated_by', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(from, to);
      if (error) throw error;

      const rows = (data ?? []) as Omit<RolloutHistoryEntry, 'generated_by_name'>[];
      const ids = Array.from(new Set(rows.map(r => r.generated_by).filter(Boolean))) as string[];

      let map: Record<string, { full_name: string | null; employee_code: string | null }> = {};
      if (ids.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, employee_code')
          .in('id', ids);
        map = Object.fromEntries(
          (profs ?? []).map(p => [p.id, { full_name: p.full_name, employee_code: p.employee_code }]),
        );
      }

      return {
        rows: rows.map(r => ({ ...r, generated_by_name: performerLabel(r.generated_by, map) })),
        totalCount: count ?? rows.length,
      };
    },
  });
}

export function usePasswordRolloutMutation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ userIds, sendEmail }: { userIds: string[]; sendEmail: boolean }) => {
      const data = await invokeAdminEdgeFunction<{
        total: number; succeeded: number; failed: number; details: any[];
      }>('password-rollout', { user_ids: userIds, send_email: sendEmail });
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['password-rollout-logs'] });
      toast({
        title: 'Password Rollout Complete',
        description: `${data.succeeded} of ${data.total} passwords generated successfully.${data.failed > 0 ? ` ${data.failed} failed.` : ''}`,
        variant: data.failed > 0 ? 'destructive' : 'default',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Rollout Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
