import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

export function useSnoozeNotification() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ notificationId, snoozedUntil }: { notificationId: string; snoozedUntil: Date }) => {
      const { error } = await supabase
        .from('notifications')
        .update({
          snoozed_until: snoozedUntil.toISOString(),
          snooze_count: undefined, // handled by raw increment below
        })
        .eq('id', notificationId);

      if (error) throw error;

      // Increment snooze_count via rpc or raw update
      const { error: incError } = await supabase.rpc('increment_snooze_count' as any, { notification_id: notificationId });
      // If rpc doesn't exist, fall back to manual increment
      if (incError) {
        const { data: current } = await supabase
          .from('notifications')
          .select('snooze_count')
          .eq('id', notificationId)
          .single();
        
        await supabase
          .from('notifications')
          .update({ snooze_count: (current?.snooze_count || 0) + 1 })
          .eq('id', notificationId);
      }
    },
    onSuccess: (_, { snoozedUntil }) => {
      toast({
        title: 'Snoozed',
        description: `Will re-appear ${format(snoozedUntil, 'MMM d, h:mm a')}`,
      });
      queryClient.invalidateQueries({ queryKey: ['paginated-notifications', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['unread-notification-count', user?.id] });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to snooze notification', variant: 'destructive' });
    },
  });
}

export function useUnsnoozeNotification() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ snoozed_until: null })
        .eq('id', notificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Un-snoozed', description: 'Item moved back to inbox' });
      queryClient.invalidateQueries({ queryKey: ['paginated-notifications', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['unread-notification-count', user?.id] });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to un-snooze notification', variant: 'destructive' });
    },
  });
}
