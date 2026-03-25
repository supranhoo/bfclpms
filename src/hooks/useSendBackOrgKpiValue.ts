import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface SendBackParams {
  orgValueId: string;
  categoryId: string;
  kraName: string;
  kpiName: string;
  reason: string;
}

/**
 * Send back an org-level KPI value for resubmission
 * Used by Management to request data correction from the data owner
 */
export function useSendBackOrgKpiValue() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ orgValueId, categoryId, kraName, kpiName, reason }: SendBackParams) => {
      // 1. Update org_kpi_values status
      const { error: updateError } = await supabase
        .from('org_kpi_values')
        .update({
          status: 'sent_back',
          sent_back_by: user?.id,
          sent_back_at: new Date().toISOString(),
          sent_back_reason: reason,
        })
        .eq('id', orgValueId);

      if (updateError) throw updateError;

      // 2. Get data owners to notify
      const { data: owners } = await supabase
        .from('org_kpi_data_owners')
        .select('owner_id')
        .eq('category_id', categoryId)
        .eq('kra_name', kraName)
        .eq('kpi_name', kpiName);

      // 3. Create notifications for data owners
      if (owners && owners.length > 0) {
        const notifications = owners.map(owner => ({
          user_id: owner.owner_id,
          type: 'org_kpi_sent_back',
          title: 'Org KPI Data Sent Back',
          message: `The value for "${kpiName}" has been sent back for resubmission. Reason: ${reason}`,
          metadata: {
            org_value_id: orgValueId,
            category_id: categoryId,
            kra_name: kraName,
            kpi_name: kpiName,
            reason,
          },
        }));

        await supabase.from('notifications').insert(notifications);

        // 3b. Send emails to data owners
        const ownerIds = owners.map(o => o.owner_id);
        const { data: ownerProfiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', ownerIds);

        if (ownerProfiles) {
          for (const profile of ownerProfiles) {
            supabase.functions.invoke('send-email-notification', {
              body: {
                event_type: 'org_kpi_sent_back',
                recipient_email: profile.email,
                recipient_name: profile.full_name || profile.email,
                kpi_name: kpiName,
                kra_name: kraName,
                send_back_reason: reason,
                recipient_role: 'data_owner',
              },
            }).catch(err => console.error('Failed to send email to data owner:', err));
          }
        }
      }

      // 3c. Notify affected employees (those who have this org KPI)
      const { data: affectedKpis } = await supabase
        .from('kpis')
        .select('employee_id')
        .eq('category_id', categoryId)
        .eq('kra_name', kraName)
        .eq('kpi_name', kpiName)
        .eq('is_org_level', true);

      if (affectedKpis && affectedKpis.length > 0) {
        const uniqueEmployeeIds = [...new Set(affectedKpis.map(k => k.employee_id))];

        // Insert app notifications for employees
        const empNotifications = uniqueEmployeeIds.map(empId => ({
          user_id: empId,
          type: 'org_kpi_sent_back',
          title: 'Org KPI Data Under Revision',
          message: `The org-level value for "${kpiName}" has been sent back for revision. You will be notified once it is resubmitted.`,
          metadata: {
            org_value_id: orgValueId,
            category_id: categoryId,
            kra_name: kraName,
            kpi_name: kpiName,
            reason,
          },
        }));

        await supabase.from('notifications').insert(empNotifications);

        // 3d. Send emails to affected employees
        const { data: empProfiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', uniqueEmployeeIds);

        if (empProfiles) {
          for (const profile of empProfiles) {
            supabase.functions.invoke('send-email-notification', {
              body: {
                event_type: 'org_kpi_sent_back',
                recipient_email: profile.email,
                recipient_name: profile.full_name || profile.email,
                kpi_name: kpiName,
                kra_name: kraName,
                send_back_reason: reason,
                recipient_role: 'employee',
              },
            }).catch(err => console.error('Failed to send email to employee:', err));
          }
        }
      }

      // 4. Log audit trail
      await supabase.from('kpi_audit_logs').insert({
        kpi_id: orgValueId, // Using org_value_id as reference
        action: 'ORG_KPI_SENT_BACK',
        performed_by: user?.id || '',
        metadata: {
          reason,
          org_value_id: orgValueId,
          category_id: categoryId,
          kra_name: kraName,
          kpi_name: kpiName,
        },
      });

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-kpi-values'] });
      toast({ title: 'Org KPI value sent back for resubmission' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to send back org KPI value',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Resubmit an org-level KPI value after it was sent back
 */
export function useResubmitOrgKpiValue() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (orgValueId: string) => {
      // First get current submission count
      const { data: current } = await supabase
        .from('org_kpi_values')
        .select('submission_count')
        .eq('id', orgValueId)
        .single();

      const newCount = (current?.submission_count || 1) + 1;

      const { error } = await supabase
        .from('org_kpi_values')
        .update({
          status: 'approved',
          sent_back_by: null,
          sent_back_at: null,
          sent_back_reason: null,
          submission_count: newCount,
        })
        .eq('id', orgValueId);

      if (error) throw error;

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-kpi-values'] });
      toast({ title: 'Org KPI value resubmitted' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to resubmit org KPI value',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Get org KPI values that have been sent back (for data owner dashboard)
 */
export function useSentBackOrgKpiValues(userId?: string) {
  return useQuery({
    queryKey: ['sent-back-org-kpi-values', userId],
    queryFn: async () => {
      let query = supabase
        .from('org_kpi_values')
        .select(`
          *,
          sent_back_by_profile:profiles!org_kpi_values_sent_back_by_fkey(full_name, email)
        `)
        .eq('status', 'sent_back');

      // If userId provided, only get values where user is an owner
      if (userId) {
        const { data: ownerships } = await supabase
          .from('org_kpi_data_owners')
          .select('category_id, kra_name, kpi_name')
          .eq('owner_id', userId);

        if (!ownerships || ownerships.length === 0) {
          return [];
        }

        // Build OR filter for matching KPIs
        const filters = ownerships.map(o => 
          `and(category_id.eq.${o.category_id},kra_name.eq.${o.kra_name},kpi_name.eq.${o.kpi_name})`
        ).join(',');
        
        query = query.or(filters);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: true,
  });
}

// Import useQuery for the last hook
import { useQuery } from '@tanstack/react-query';
