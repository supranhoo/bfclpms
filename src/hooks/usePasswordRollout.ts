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
  eligibility_type: 'has_kras' | 'reporting_manager' | 'auditor' | 'both';
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

export function usePasswordRolloutMutation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ userIds, sendEmail }: { userIds: string[]; sendEmail: boolean }) => {
      const { data, error } = await supabase.functions.invoke('password-rollout', {
        body: { user_ids: userIds, send_email: sendEmail },
      });

      if (error) throw error;
      return data as { total: number; succeeded: number; failed: number; details: any[] };
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
