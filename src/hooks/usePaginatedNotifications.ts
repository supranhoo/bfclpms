import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  kpi_id: string | null;
  related_user_id: string | null;
  is_read: boolean;
  metadata: Record<string, any>;
  created_at: string;
  snoozed_until: string | null;
  snooze_count: number;
}

export interface NotificationFilters {
  search?: string;
  readStatus?: 'all' | 'unread' | 'read';
  type?: string;
  dateRange?: 'today' | 'week' | 'month' | 'all';
}

export interface UsePaginatedNotificationsOptions {
  pageSize?: number;
  filters?: NotificationFilters;
  showSnoozed?: boolean;
}

export function usePaginatedNotifications(options: UsePaginatedNotificationsOptions = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { pageSize = 20, filters = {}, showSnoozed = false } = options;
  
  const [page, setPage] = useState(0);
  const [allItems, setAllItems] = useState<Notification[]>([]);

  // Build filter date range
  const getDateFilter = useCallback(() => {
    const now = new Date();
    switch (filters.dateRange) {
      case 'today':
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return today.toISOString();
      case 'week':
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return weekAgo.toISOString();
      case 'month':
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return monthAgo.toISOString();
      default:
        return null;
    }
  }, [filters.dateRange]);

  const query = useQuery({
    queryKey: ['paginated-notifications', user?.id, page, pageSize, filters, showSnoozed],
    queryFn: async () => {
      if (!user?.id) return { data: [], count: 0 };
      
      let queryBuilder = supabase
        .from('notifications')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters.readStatus === 'unread') {
        queryBuilder = queryBuilder.eq('is_read', false);
      } else if (filters.readStatus === 'read') {
        queryBuilder = queryBuilder.eq('is_read', true);
      }

      if (filters.type && filters.type !== 'all') {
        queryBuilder = queryBuilder.eq('type', filters.type);
      }

      const dateFilter = getDateFilter();
      if (dateFilter) {
        queryBuilder = queryBuilder.gte('created_at', dateFilter);
      }

      if (filters.search) {
        queryBuilder = queryBuilder.or(
          `title.ilike.%${filters.search}%,message.ilike.%${filters.search}%`
        );
      }

      // Snooze filtering
      const now = new Date().toISOString();
      if (showSnoozed) {
        // Show only currently-snoozed items
        queryBuilder = queryBuilder.gt('snoozed_until', now);
      } else {
        // Exclude currently-snoozed items
        queryBuilder = queryBuilder.or(`snoozed_until.is.null,snoozed_until.lte.${now}`);
      }

      // Apply pagination
      queryBuilder = queryBuilder.range(page * pageSize, (page + 1) * pageSize - 1);

      const { data, error, count } = await queryBuilder;

      if (error) throw error;
      return { data: data as Notification[], count: count || 0 };
    },
    enabled: !!user?.id,
  });

  // Accumulate items for infinite scroll
  useEffect(() => {
    if (query.data?.data) {
      if (page === 0) {
        setAllItems(query.data.data);
      } else {
        setAllItems(prev => {
          const existingIds = new Set(prev.map(item => item.id));
          const newItems = query.data.data.filter(item => !existingIds.has(item.id));
          return [...prev, ...newItems];
        });
      }
    }
  }, [query.data, page]);

  // Reset page when filters change -- don't clear allItems to avoid
  // "No notifications" flash; the accumulation effect replaces them
  // when page === 0 and new data arrives
  useEffect(() => {
    setPage(0);
  }, [filters.search, filters.readStatus, filters.type, filters.dateRange]);

  const totalCount = query.data?.count || 0;
  const hasMore = allItems.length < totalCount;

  const loadMore = useCallback(() => {
    if (hasMore && !query.isFetching) {
      setPage(prev => prev + 1);
    }
  }, [hasMore, query.isFetching]);

  // Realtime notifications are handled by the shared channel in useNotifications.ts
  // which invalidates 'paginated-notifications' query key — no duplicate channel needed

  return {
    notifications: allItems,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    totalCount,
    hasMore,
    loadMore,
    refetch: () => {
      setPage(0);
      setAllItems([]);
      return query.refetch();
    },
  };
}

export function useToggleNotificationRead() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ notificationId, isRead }: { notificationId: string; isRead: boolean }) => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: !isRead })
        .eq('id', notificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paginated-notifications', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['unread-notification-count', user?.id] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paginated-notifications', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['unread-notification-count', user?.id] });
    },
  });
}
