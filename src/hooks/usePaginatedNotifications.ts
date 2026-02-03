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
}

export function usePaginatedNotifications(options: UsePaginatedNotificationsOptions = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { pageSize = 20, filters = {} } = options;
  
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
    queryKey: ['paginated-notifications', user?.id, page, pageSize, filters],
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

  // Reset when filters change
  useEffect(() => {
    setPage(0);
    setAllItems([]);
  }, [filters.search, filters.readStatus, filters.type, filters.dateRange]);

  const totalCount = query.data?.count || 0;
  const hasMore = allItems.length < totalCount;

  const loadMore = useCallback(() => {
    if (hasMore && !query.isFetching) {
      setPage(prev => prev + 1);
    }
  }, [hasMore, query.isFetching]);

  // Subscribe to realtime notifications
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('notifications-paginated-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // Reset pagination and refetch on new notification
          setPage(0);
          setAllItems([]);
          queryClient.invalidateQueries({ queryKey: ['paginated-notifications', user.id] });
          queryClient.invalidateQueries({ queryKey: ['unread-notification-count', user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

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

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
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
