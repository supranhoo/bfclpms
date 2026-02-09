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
    }: {
      observationId: string;
      replyText: string;
      evidenceUrls?: string[];
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
