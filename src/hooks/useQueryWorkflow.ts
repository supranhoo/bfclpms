import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export type QueryStatusExtended = 'open' | 'responded' | 'resolved';

export interface QueryWithDetails {
  id: string;
  kpi_id: string;
  entity_type: 'kra' | 'kpi';
  raised_by: string;
  raised_to: string;
  reason: string;
  evidence_url: string | null;
  evidence_urls?: string[] | null;
  resolution_notes: string | null;
  resolution_evidence_url: string | null;
  resolution_evidence_urls?: string[] | null;
  status: QueryStatusExtended;
  created_at: string;
  resolved_at: string | null;
  updated_at: string;
  raised_by_profile: { id: string; full_name: string | null; email: string; employee_code?: string | null } | null;
  raised_to_profile: { id: string; full_name: string | null; email: string; employee_code?: string | null } | null;
  kpi?: {
    id: string;
    kra_name: string;
    kpi_name: string;
    target_value: number | null;
    uom: string | null;
    review_period: string | null;
    review_year: number | null;
  } | null;
}

// Submit response (employee action) - changes status from 'open' to 'responded'
export function useRespondToQuery() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ 
      query_id, 
      kpi_id,
      resolution_notes, 
      resolution_evidence_url 
    }: { 
      query_id: string; 
      kpi_id: string;
      resolution_notes: string; 
      resolution_evidence_url?: string;
    }) => {
      const { error } = await supabase
        .from('kpi_queries')
        .update({
          status: 'responded' as const,
          resolution_notes,
          resolution_evidence_url: resolution_evidence_url || null,
          updated_at: new Date().toISOString(),
          // Note: resolved_at is NOT set yet - will be set when raiser accepts
        })
        .eq('id', query_id);

      if (error) throw error;

      // Log the response
      if (user?.id) {
        await supabase.from('kpi_audit_logs').insert({
          kpi_id,
          action: 'QUERY_RESPONDED',
          performed_by: user.id,
          new_value: { resolution_notes, resolution_evidence_url },
          metadata: { query_id },
        });
      }
    },
    onSuccess: async (_data, variables) => {
      // Notify the raiser that a response was submitted
      try {
        // Get the query to find the raiser
        const { data: queryRecord } = await supabase
          .from('kpi_queries')
          .select('raised_by, kpi_id')
          .eq('id', variables.query_id)
          .single();

        if (queryRecord && user?.id) {
          const { data: kpiRecord } = await supabase
            .from('kpis')
            .select('kpi_name')
            .eq('id', queryRecord.kpi_id)
            .single();

          const { data: responderProfile } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', user.id)
            .single();

          const responderName = responderProfile?.full_name || responderProfile?.email || 'Employee';

          await supabase.from('notifications').insert({
            user_id: queryRecord.raised_by,
            type: 'query_response_submitted',
            title: 'Query Response Received',
            message: `${responderName} responded to your query on KPI: ${kpiRecord?.kpi_name || 'Unknown'}`,
            kpi_id: queryRecord.kpi_id,
            related_user_id: user.id,
            metadata: {
              query_id: variables.query_id,
              resolution_notes: variables.resolution_notes,
            },
          });
        }
      } catch (e) {
        console.warn('Failed to send query response notification', e);
      }

      queryClient.invalidateQueries({ queryKey: ['my-queries'] });
      queryClient.invalidateQueries({ queryKey: ['kpi-queries'] });
      queryClient.invalidateQueries({ queryKey: ['subordinate-queries'] });
      queryClient.invalidateQueries({ queryKey: ['query-history'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast({ title: 'Response submitted successfully', description: 'Awaiting acceptance from query raiser' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to submit response', description: error.message, variant: 'destructive' });
    },
  });
}

// Accept response (raiser action) - changes status from 'responded' to 'resolved'
export function useAcceptQueryResponse() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ 
      query_id,
      kpi_id,
    }: { 
      query_id: string;
      kpi_id: string;
    }) => {
      const { error } = await supabase
        .from('kpi_queries')
        .update({
          status: 'resolved' as const,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', query_id);

      if (error) throw error;

      // Log the acceptance
      if (user?.id) {
        await supabase.from('kpi_audit_logs').insert({
          kpi_id,
          action: 'QUERY_RESPONSE_ACCEPTED',
          performed_by: user.id,
          new_value: { status: 'resolved' },
          metadata: { query_id, accepted_by: user.id },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-queries'] });
      queryClient.invalidateQueries({ queryKey: ['kpi-queries'] });
      queryClient.invalidateQueries({ queryKey: ['subordinate-queries'] });
      queryClient.invalidateQueries({ queryKey: ['query-history'] });
      toast({ title: 'Response accepted', description: 'Query has been resolved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to accept response', description: error.message, variant: 'destructive' });
    },
  });
}

// Fetch queries raised to user's subordinates (for FYI/Team Queries tab)
// Includes both direct reports AND skip-level reports (manager's direct reports)
export function useSubordinateQueries() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['subordinate-queries', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Get direct reports (subordinates whose reporting_manager_id = current user)
      const { data: directReports, error: subError } = await supabase
        .from('profiles')
        .select('id')
        .eq('reporting_manager_id', user.id);

      if (subError) throw subError;

      const directIds = directReports?.map(s => s.id) || [];

      // Get skip-level reports: employees whose manager's reporting_manager_id = current user
      // i.e. employees who report to someone who reports to the current user
      let skipLevelIds: string[] = [];
      if (directIds.length > 0) {
        const { data: skipReports } = await supabase
          .from('profiles')
          .select('id')
          .in('reporting_manager_id', directIds);
        skipLevelIds = skipReports?.map(s => s.id) || [];
      }

      const allSubordinateIds = [...new Set([...directIds, ...skipLevelIds])];

      if (allSubordinateIds.length === 0) return [];

      // Get queries raised TO subordinates (but NOT by the current user)
      const { data, error } = await supabase
        .from('kpi_queries')
        .select(`
          *,
          kpi:kpi_id(id, kra_name, kpi_name, target_value, uom, review_period, review_year)
        `)
        .in('raised_to', allSubordinateIds)
        .neq('raised_by', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch profiles for raisers and recipients
      const userIds = new Set<string>();
      data.forEach(q => {
        userIds.add(q.raised_by);
        userIds.add(q.raised_to);
      });

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, employee_code')
        .in('id', Array.from(userIds));

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      return data.map(q => ({
        ...q,
        raised_by_profile: profileMap.get(q.raised_by) || null,
        raised_to_profile: profileMap.get(q.raised_to) || null,
      })) as QueryWithDetails[];
    },
    enabled: !!user?.id,
  });
}

// Fetch query history for a specific KPI
export function useQueryHistory(kpiId: string | undefined) {
  return useQuery({
    queryKey: ['query-history', kpiId],
    queryFn: async () => {
      if (!kpiId) return [];

      const { data, error } = await supabase
        .from('kpi_queries')
        .select('*')
        .eq('kpi_id', kpiId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Fetch profiles for all users involved
      const userIds = new Set<string>();
      data.forEach(q => {
        userIds.add(q.raised_by);
        userIds.add(q.raised_to);
      });

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, employee_code')
        .in('id', Array.from(userIds));

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      return data.map(q => ({
        ...q,
        raised_by_profile: profileMap.get(q.raised_by) || null,
        raised_to_profile: profileMap.get(q.raised_to) || null,
      })) as QueryWithDetails[];
    },
    enabled: !!kpiId,
  });
}
