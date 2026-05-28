import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface ObservationReply {
  id: string;
  observation_id: string;
  reply_by: string;
  reply_text: string;
  evidence_urls: string[] | null;
  created_at: string;
  edited_at?: string | null;
  reply_by_profile?: { full_name: string | null; email: string };
}

export function useObservationReplies(observationId: string | undefined) {
  return useQuery({
    queryKey: ['observation-replies', observationId],
    queryFn: async () => {
      if (!observationId) return [];

      const { data, error } = await supabase
        .from('kpi_observation_replies')
        .select(`
          *,
          reply_by_profile:profiles!kpi_observation_replies_reply_by_fkey(full_name, email)
        `)
        .eq('observation_id', observationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as ObservationReply[];
    },
    enabled: !!observationId,
  });
}

export function useCreateObservationReply() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      observationId,
      replyText,
      evidenceUrls,
      mentionedUserIds,
    }: {
      observationId: string;
      replyText: string;
      evidenceUrls?: string[];
      mentionedUserIds?: string[];
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('kpi_observation_replies')
        .insert({
          observation_id: observationId,
          reply_by: userData.user.id,
          reply_text: replyText,
          evidence_urls: evidenceUrls && evidenceUrls.length > 0 ? evidenceUrls : null,
        })
        .select()
        .single();

      if (error) throw error;

      // Auto-acknowledge the observation if it's still 'open'
      await supabase
        .from('kpi_observations')
        .update({ status: 'acknowledged' })
        .eq('id', observationId)
        .eq('status', 'open');

      // Insert @mention notifications
      if (mentionedUserIds && mentionedUserIds.length > 0) {
        // Get observation details for notification context
        const { data: obsData } = await supabase
          .from('kpi_observations')
          .select('kpi_id, ticket_number')
          .eq('id', observationId)
          .single();

        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', userData.user.id)
          .single();

        const mentionerName = profile?.full_name || profile?.email || 'Someone';

        if (obsData) {
          // Get employee_id from KPI
          const { data: kpiData } = await supabase
            .from('kpis')
            .select('employee_id, kpi_name')
            .eq('id', obsData.kpi_id)
            .single();

          const uniqueIds = [...new Set(mentionedUserIds)].filter(id => id !== userData.user.id);
          // Truncate KPI name to avoid wall-of-text in notifications
          const shortKpiName = (kpiData?.kpi_name || 'a KPI').split(/[\n\r:]/)[0].trim().slice(0, 80);

          if (uniqueIds.length > 0) {
            const notifications = uniqueIds.map(userId => ({
              user_id: userId,
              type: 'observation_mention',
              title: '@Mentioned in Observation',
              message: `${mentionerName} mentioned you in observation ${obsData.ticket_number || ''} on ${shortKpiName}`,
              kpi_id: obsData.kpi_id,
              related_user_id: userData.user.id,
              metadata: {
                employee_id: kpiData?.employee_id || null,
                observation_id: observationId,
                ticket_number: obsData.ticket_number || null,
              },
            }));

            await supabase.from('notifications').insert(notifications);

            // Grant mentioned users read-only access to this KPI
            await supabase.from('kpi_mention_access').upsert(
              uniqueIds.map(userId => ({
                kpi_id: obsData.kpi_id,
                user_id: userId,
                granted_by: userData.user.id,
              })),
              { onConflict: 'kpi_id,user_id', ignoreDuplicates: true }
            );
          }
        }
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['observation-replies', data.observation_id] });
      queryClient.invalidateQueries({ queryKey: ['kpi-observations'] });
      queryClient.invalidateQueries({ queryKey: ['kpi-observations-batch'] });
      toast({ title: 'Reply Added', description: 'Your reply has been posted.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

export function useResolveObservation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ observationId, kpiId }: { observationId: string; kpiId: string }) => {
      const { data, error } = await supabase
        .from('kpi_observations')
        .update({ status: 'resolved' })
        .eq('id', observationId)
        .select()
        .single();

      if (error) throw error;
      return { ...data, kpiId };
    },
    onSuccess: ({ kpiId }) => {
      queryClient.invalidateQueries({ queryKey: ['kpi-observations', kpiId] });
      queryClient.invalidateQueries({ queryKey: ['kpi-observations-batch'] });
      toast({ title: 'Observation Resolved', description: 'The observation has been marked as resolved.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

/**
 * Edit an existing observation reply.
 * Author-only, within 24h (enforced server-side by RLS + guard trigger).
 */
export function useUpdateObservationReply() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      observationId,
      replyText,
    }: {
      id: string;
      observationId: string;
      replyText: string;
    }) => {
      const { data, error } = await supabase
        .from('kpi_observation_replies')
        .update({ reply_text: replyText })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return { ...data, observationId };
    },
    onSuccess: ({ observationId }) => {
      queryClient.invalidateQueries({ queryKey: ['observation-replies', observationId] });
      toast({ title: 'Reply Updated', description: 'Your reply has been edited.' });
    },
    onError: (error: any) => {
      const msg = error?.message?.includes('Only reply text')
        ? 'Only the text can be edited.'
        : error?.message?.includes('row-level security')
        ? 'Edit window has expired (24 hours).'
        : error?.message || 'Failed to update reply';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    },
  });
}
