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

/**
 * ADR-189 / POLICY §OBS-REPLY-ATOMICITY.
 * The reply, the auto-acknowledgement, the @mention notifications and the
 * mention access grant are performed by a single server-side transaction
 * (`post_observation_reply`). Notification permission failures are reported
 * as `skipped` recipients and never block the reply itself.
 */
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
      const { data, error } = await supabase.rpc('post_observation_reply', {
        p_observation_id: observationId,
        p_reply_text: replyText,
        p_evidence_urls:
          evidenceUrls && evidenceUrls.length > 0 ? (evidenceUrls as unknown as never) : null,
        p_mentioned_user_ids:
          mentionedUserIds && mentionedUserIds.length > 0
            ? [...new Set(mentionedUserIds)]
            : null,
      });

      if (error) throw error;

      const result = (data ?? {}) as {
        reply?: ObservationReply;
        notified?: string[];
        skipped?: string[];
      };

      return {
        ...(result.reply as ObservationReply),
        skippedCount: result.skipped?.length ?? 0,
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['observation-replies', data.observation_id] });
      queryClient.invalidateQueries({ queryKey: ['kpi-observations'] });
      queryClient.invalidateQueries({ queryKey: ['kpi-observations-batch'] });
      if (data.skippedCount > 0) {
        toast({
          title: 'Reply Added',
          description: `Your reply has been posted. ${data.skippedCount} participant(s) could not be notified.`,
        });
      } else {
        toast({ title: 'Reply Added', description: 'Your reply has been posted.' });
      }
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
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('kpi_observations')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolved_by: auth?.user?.id ?? null,
        })
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
