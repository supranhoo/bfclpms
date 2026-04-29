import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Phase 1.D — Safety notifications hook.
 *
 * - Fetches the current user's safety notifications (50 most recent).
 * - Subscribes to realtime inserts on `safety_notifications` so the bell
 *   updates without a refresh.
 * - All cache keys are namespaced under ['safety','notifications'] per
 *   the Safety shell isolation policy (POLICY §110).
 */

export interface SafetyNotification {
  id: string;
  recipient_id: string;
  incident_id: string | null;
  kind: string;
  title: string;
  body: string | null;
  payload: Record<string, unknown>;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

const KEY = (uid: string | undefined) => ['safety', 'notifications', uid ?? 'anon'];

export function useSafetyNotifications() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: KEY(user?.id),
    enabled: !!user?.id,
    queryFn: async (): Promise<SafetyNotification[]> => {
      const { data, error } = await supabase
        .from('safety_notifications' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as SafetyNotification[];
    },
    staleTime: 30_000,
  });

  // Realtime subscription
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`safety_notifications_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'safety_notifications',
          filter: `recipient_id=eq.${user.id}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: KEY(user.id) });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, qc]);

  const unreadCount = (query.data ?? []).filter((n) => !n.is_read).length;

  return { ...query, unreadCount };
}

export function useMarkSafetyNotificationRead() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('safety_notifications' as any)
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(user?.id) }),
  });
}

export function useMarkAllSafetyNotificationsRead() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      const { error } = await supabase
        .from('safety_notifications' as any)
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('recipient_id', user.id)
        .eq('is_read', false);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(user?.id) }),
  });
}

/**
 * Manually invoke the SLA escalation engine. Restricted server-side to
 * service-role calls and Safety Admin/Head users.
 */
export function useRunSafetySlaCheck() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('check-safety-sla', {
        body: {},
      });
      if (error) throw error;
      return data as { ok: boolean; amber_escalated?: number; red_escalated?: number };
    },
  });
}