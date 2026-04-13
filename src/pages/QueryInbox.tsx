import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { usePaginatedNotifications, useToggleNotificationRead, useMarkAllNotificationsRead, NotificationFilters } from '@/hooks/usePaginatedNotifications';
import { useUnreadNotificationCount } from '@/hooks/useNotifications';
import { useSnoozeNotification, useUnsnoozeNotification } from '@/hooks/useSnoozeNotification';
import { useRespondToQuery, useAcceptQueryResponse, useSubordinateQueries, QueryStatusExtended } from '@/hooks/useQueryWorkflow';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EvidenceUpload } from '@/components/ui/EvidenceUpload';
import { InboxFilters, InboxFiltersState } from '@/components/inbox/InboxFilters';
import { InboxTable } from '@/components/inbox/InboxTable';
import { InboxDetailSheet } from '@/components/inbox/InboxDetailSheet';
import { InboxStatsCards, buildInboxStats } from '@/components/inbox/InboxStatsCards';
import { InboxItem, filterInboxItems } from '@/lib/inboxUtils';
import { InboxInsights } from '@/components/inbox/InboxInsights';
import { StatsRowSkeleton } from '@/components/ui/LoadingSkeletons';
import { Bell, MessageSquare, Send, Users, CheckCheck, Paperclip, BarChart3, AlarmClock } from 'lucide-react';

interface QueryWithDetails {
  id: string;
  kpi_id: string;
  entity_type: 'kra' | 'kpi';
  raised_by: string;
  raised_to: string;
  reason: string;
  evidence_url: string | null;
  resolution_notes: string | null;
  resolution_evidence_url: string | null;
  status: QueryStatusExtended;
  created_at: string;
  resolved_at: string | null;
  updated_at: string;
  raised_by_profile: { id: string; full_name: string | null; email: string; employee_code?: string | null } | null;
  raised_to_profile: { id: string; full_name: string | null; email: string; employee_code?: string | null } | null;
  kpi: {
    id: string;
    kra_name: string;
    kpi_name: string;
    target_value: number | null;
    uom: string | null;
    review_period: string | null;
    review_year: number | null;
  } | null;
}

export default function QueryInbox() {
  const { user, effectiveRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Filter state
  const [filters, setFilters] = useState<InboxFiltersState>({
    search: '',
    readStatus: 'all',
    dateRange: 'all',
    queryStatus: 'all',
    slaStatus: 'all',
    notificationType: 'all',
  });

  const [activeTab, setActiveTab] = useState<'notifications' | 'received' | 'sent' | 'team' | 'snoozed' | 'insights'>(() => {
    const tabParam = searchParams.get('tab');
    const validTabs = ['notifications', 'received', 'sent', 'team', 'snoozed', 'insights'];
    return validTabs.includes(tabParam || '') ? tabParam as any : 'notifications';
  });
  const [selectedItem, setSelectedItem] = useState<InboxItem | null>(null);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);

  // Response dialog state
  const [selectedQuery, setSelectedQuery] = useState<QueryWithDetails | null>(null);
  const [responseDialogOpen, setResponseDialogOpen] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [responseEvidenceUrl, setResponseEvidenceUrl] = useState('');

  // Query workflow hooks
  const respondToQuery = useRespondToQuery();
  const acceptQueryResponse = useAcceptQueryResponse();
  const { data: subordinateQueries = [], isLoading: loadingSubordinateQueries } = useSubordinateQueries();
  const snoozeNotification = useSnoozeNotification();
  const unsnoozeNotification = useUnsnoozeNotification();

  // Paginated notifications
  const notificationFilters: NotificationFilters = useMemo(() => ({
    search: filters.search,
    readStatus: filters.readStatus,
    dateRange: filters.dateRange,
    type: filters.notificationType,
  }), [filters]);

  const {
    notifications,
    isLoading: loadingNotifications,
    isFetching: fetchingNotifications,
    totalCount: notificationsTotalCount,
    hasMore: hasMoreNotifications,
    loadMore: loadMoreNotifications,
  } = usePaginatedNotifications({ pageSize: 20, filters: notificationFilters });

  // Snoozed notifications
  const {
    notifications: snoozedNotifications,
    isLoading: loadingSnoozed,
    isFetching: fetchingSnoozed,
    totalCount: snoozedTotalCount,
    hasMore: hasMoreSnoozed,
    loadMore: loadMoreSnoozed,
  } = usePaginatedNotifications({ pageSize: 20, filters: notificationFilters, showSnoozed: true });

  const markNotificationRead = useToggleNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const { data: unreadNotificationsCount = 0 } = useUnreadNotificationCount();

  // Fetch all queries for current user (both received and sent)
  const { data: allQueries, isLoading: loadingQueries } = useQuery({
    queryKey: ['my-queries', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('kpi_queries')
        .select(`
          *,
          kpi:kpi_id(id, kra_name, kpi_name, target_value, uom, review_period, review_year)
        `)
        .or(`raised_to.eq.${user.id},raised_by.eq.${user.id}`)
        .eq('query_type', 'query')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch profiles separately
      const userIds = new Set<string>();
      data.forEach(q => {
        userIds.add(q.raised_by);
        userIds.add(q.raised_to);
      });

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
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

  // Derived query lists
  const receivedQueries = useMemo(() =>
    allQueries?.filter(q => q.raised_to === user?.id) || [],
    [allQueries, user?.id]
  );

  const sentQueries = useMemo(() =>
    allQueries?.filter(q => q.raised_by === user?.id) || [],
    [allQueries, user?.id]
  );

  const openQueries = useMemo(() => receivedQueries.filter(q => q.status === 'open'), [receivedQueries]);
  const pendingAcceptanceQueries = useMemo(() => sentQueries.filter(q => q.status === 'responded'), [sentQueries]);
  const totalResolvedQueries = useMemo(() => {
    const resolvedReceived = receivedQueries.filter(q => q.status === 'resolved').length;
    const resolvedSent = sentQueries.filter(q => q.status === 'resolved').length;
    return resolvedReceived + resolvedSent;
  }, [receivedQueries, sentQueries]);

  // Fetch profiles for related_user_id values from notifications
  const relatedUserIds = useMemo(() => {
    const ids = new Set<string>();
    notifications.forEach(n => {
      if (n.related_user_id) ids.add(n.related_user_id);
    });
    snoozedNotifications.forEach(n => {
      if (n.related_user_id) ids.add(n.related_user_id);
    });
    return Array.from(ids);
  }, [notifications, snoozedNotifications]);

  const { data: relatedProfiles } = useQuery({
    queryKey: ['related-profiles', relatedUserIds],
    queryFn: async () => {
      if (relatedUserIds.length === 0) return [];
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', relatedUserIds);
      return data || [];
    },
    enabled: relatedUserIds.length > 0,
  });

  const relatedProfileMap = useMemo(() =>
    new Map(relatedProfiles?.map(p => [p.id, p]) || []),
    [relatedProfiles]
  );

  // Convert notifications to InboxItems with enriched metadata
  const notificationItems: InboxItem[] = useMemo(() =>
    notifications.map(n => {
      const meta = (n.metadata && typeof n.metadata === 'object') ? n.metadata as Record<string, any> : {};
      const relatedProfile = n.related_user_id ? relatedProfileMap.get(n.related_user_id) : null;

      return {
        id: n.id,
        type: 'notification' as const,
        title: n.title,
        message: n.message,
        isRead: n.is_read,
        createdAt: n.created_at,
        notificationType: n.type,
        kpiId: n.kpi_id,
        kpiName: meta.kpi_name || null,
        kraName: meta.kra_name || null,
        fromUser: relatedProfile ? {
          id: relatedProfile.id,
          fullName: relatedProfile.full_name,
          email: relatedProfile.email,
        } : (meta.employee_name ? {
          id: n.related_user_id || '',
          fullName: meta.employee_name,
          email: '',
        } : null),
        metadata: meta,
        snoozedUntil: n.snoozed_until,
        snoozeCount: n.snooze_count,
      };
    }),
    [notifications, relatedProfileMap]
  );

  // Convert snoozed notifications to InboxItems (with same enrichment as regular notifications)
  const snoozedItems: InboxItem[] = useMemo(() =>
    snoozedNotifications.map(n => {
      const meta = (n.metadata && typeof n.metadata === 'object') ? n.metadata as Record<string, any> : {};
      const relatedProfile = n.related_user_id ? relatedProfileMap.get(n.related_user_id) : null;

      return {
        id: n.id,
        type: 'notification' as const,
        title: n.title,
        message: n.message,
        isRead: n.is_read,
        createdAt: n.created_at,
        notificationType: n.type,
        kpiId: n.kpi_id,
        kpiName: meta.kpi_name || null,
        kraName: meta.kra_name || null,
        fromUser: relatedProfile ? {
          id: relatedProfile.id,
          fullName: relatedProfile.full_name,
          email: relatedProfile.email,
        } : (meta.employee_name ? {
          id: n.related_user_id || '',
          fullName: meta.employee_name,
          email: '',
        } : null),
        metadata: meta,
        snoozedUntil: n.snoozed_until,
        snoozeCount: n.snooze_count,
      };
    }),
    [snoozedNotifications, relatedProfileMap]
  );

  // Convert queries to InboxItems
  const queryToInboxItem = useCallback((query: QueryWithDetails, isRaiser: boolean): InboxItem => ({
    id: query.id,
    type: 'query',
    title: query.kpi?.kpi_name || 'Query',
    message: query.reason,
    isRead: query.status === 'resolved',
    createdAt: query.created_at,
    queryStatus: query.status as 'open' | 'responded' | 'resolved',
    kpiId: query.kpi_id,
    kpiName: query.kpi?.kpi_name || null,
    kraName: query.kpi?.kra_name || null,
    fromUser: query.raised_by_profile ? {
      id: query.raised_by_profile.id,
      fullName: query.raised_by_profile.full_name,
      email: query.raised_by_profile.email,
    } : null,
    toUser: query.raised_to_profile ? {
      id: query.raised_to_profile.id,
      fullName: query.raised_to_profile.full_name,
      email: query.raised_to_profile.email,
    } : null,
    resolutionNotes: query.resolution_notes,
    evidenceUrl: query.evidence_url,
    ticketNumber: (query as any).ticket_number || null,
  }), []);

  const receivedQueryItems: InboxItem[] = useMemo(() =>
    receivedQueries.map(q => queryToInboxItem(q, false)),
    [receivedQueries, queryToInboxItem]
  );

  const sentQueryItems: InboxItem[] = useMemo(() =>
    sentQueries.map(q => queryToInboxItem(q, true)),
    [sentQueries, queryToInboxItem]
  );

  const teamQueryItems: InboxItem[] = useMemo(() =>
    subordinateQueries.map(q => queryToInboxItem(q as unknown as QueryWithDetails, false)),
    [subordinateQueries, queryToInboxItem]
  );

  // Apply client-side filters to query items
  const filteredReceivedItems = useMemo(() => filterInboxItems(receivedQueryItems, filters), [receivedQueryItems, filters]);
  const filteredSentItems = useMemo(() => filterInboxItems(sentQueryItems, filters), [sentQueryItems, filters]);
  const filteredTeamItems = useMemo(() => filterInboxItems(teamQueryItems, filters), [teamQueryItems, filters]);

  // Memoized insights data to avoid re-creating objects on every render
  const insightsAllQueries = useMemo(() =>
    (allQueries || []).map(q => ({
      id: q.id,
      status: q.status,
      created_at: q.created_at,
      resolved_at: q.resolved_at,
      updated_at: q.updated_at,
      raised_by: q.raised_by,
      raised_to: q.raised_to,
      kpiName: q.kpi?.kpi_name || null,
      kraName: q.kpi?.kra_name || null,
    })),
    [allQueries]
  );

  const insightsTeamQueries = useMemo(() =>
    (subordinateQueries as unknown as QueryWithDetails[]).map(q => ({
      id: q.id,
      status: q.status,
      created_at: q.created_at,
      resolved_at: q.resolved_at,
      updated_at: q.updated_at,
      raised_by: q.raised_by,
      raised_to: q.raised_to,
    })),
    [subordinateQueries]
  );

  // Handlers
  const handleViewItem = useCallback((item: InboxItem) => {
    setSelectedItem(item);
    setDetailSheetOpen(true);

    // Mark notification as read
    if (item.type === 'notification' && !item.isRead) {
      markNotificationRead.mutate({ notificationId: item.id, isRead: false });
    }
  }, [markNotificationRead]);

  const handleMarkRead = useCallback((item: InboxItem) => {
    if (item.type === 'notification') {
      markNotificationRead.mutate({ notificationId: item.id, isRead: item.isRead });
    }
  }, [markNotificationRead]);

  const handleNavigate = useCallback((path: string) => {
    navigate(path);
  }, [navigate]);

  const handleRespond = useCallback((item: InboxItem) => {
    const query = receivedQueries.find(q => q.id === item.id);
    if (query) {
      setSelectedQuery(query);
      setResolutionNotes('');
      setResponseEvidenceUrl('');
      setResponseDialogOpen(true);
      setDetailSheetOpen(false);
    }
  }, [receivedQueries]);

  const handleAccept = useCallback((item: InboxItem) => {
    const query = sentQueries.find(q => q.id === item.id);
    if (query) {
      acceptQueryResponse.mutate({
        query_id: query.id,
        kpi_id: query.kpi_id,
      });
      setDetailSheetOpen(false);
    }
  }, [sentQueries, acceptQueryResponse]);

  const handleSubmitResponse = () => {
    if (!selectedQuery || !resolutionNotes.trim()) return;
    respondToQuery.mutate({
      query_id: selectedQuery.id,
      kpi_id: selectedQuery.kpi_id,
      resolution_notes: resolutionNotes,
      resolution_evidence_url: responseEvidenceUrl || undefined,
    }, {
      onSuccess: () => {
        setResponseDialogOpen(false);
        setResolutionNotes('');
        setResponseEvidenceUrl('');
      }
    });
  };

  // Inline quick action handlers
  const handleInlineRespond = useCallback((itemId: string, notes: string, evidenceUrl?: string) => {
    const query = receivedQueries.find(q => q.id === itemId);
    if (!query || !notes.trim()) return;
    respondToQuery.mutate({
      query_id: query.id,
      kpi_id: query.kpi_id,
      resolution_notes: notes,
      resolution_evidence_url: evidenceUrl,
    });
  }, [receivedQueries, respondToQuery]);

  const handleInlineAccept = useCallback((item: InboxItem) => {
    const query = sentQueries.find(q => q.id === item.id);
    if (query) {
      acceptQueryResponse.mutate({
        query_id: query.id,
        kpi_id: query.kpi_id,
      });
    }
  }, [sentQueries, acceptQueryResponse]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === 'Escape') {
        // Collapse is handled by child component state, but close dialog if open
        setResponseDialogOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Stats
  const stats = useMemo(() => buildInboxStats({
    unreadCount: unreadNotificationsCount,
    openQueriesCount: openQueries.length,
    resolvedQueriesCount: totalResolvedQueries,
    sentQueriesCount: sentQueries.length,
    pendingAcceptanceCount: pendingAcceptanceQueries.length,
  }), [unreadNotificationsCount, openQueries.length, totalResolvedQueries, sentQueries.length, pendingAcceptanceQueries.length]);

  if (loadingQueries || loadingNotifications) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <div className="h-8 w-36 bg-muted animate-pulse rounded" />
            <div className="h-4 w-56 bg-muted animate-pulse rounded" />
          </div>
        </div>
        <StatsRowSkeleton count={4} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Inbox</h1>
          <p className="text-sm text-muted-foreground">Notifications and queries for your KPIs</p>
        </div>
        {unreadNotificationsCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
          >
            <CheckCheck className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Mark all as read</span>
            <span className="sm:hidden">Read all</span>
          </Button>
        )}
      </div>

      {/* Stats Cards - 2 columns on mobile */}
      <InboxStatsCards stats={stats} />

      {/* Tabs - Scrollable on mobile */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="flex w-full overflow-x-auto scrollbar-none">
          <TabsTrigger value="notifications" className="flex items-center gap-1.5 flex-shrink-0 text-xs sm:text-sm">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Notifications</span>
            <span className="sm:hidden">Notif</span>
            {unreadNotificationsCount > 0 && (
              <Badge variant="destructive" className="ml-0.5 h-4 sm:h-5 min-w-4 sm:min-w-5 px-1 flex items-center justify-center text-[10px] sm:text-xs">
                {unreadNotificationsCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="received" className="flex items-center gap-1.5 flex-shrink-0 text-xs sm:text-sm">
            <MessageSquare className="h-4 w-4" />
            Queries
            {openQueries.length > 0 && (
              <Badge variant="destructive" className="ml-0.5 h-4 sm:h-5 min-w-4 sm:min-w-5 px-1 flex items-center justify-center text-[10px] sm:text-xs">
                {openQueries.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="sent" className="flex items-center gap-1.5 flex-shrink-0 text-xs sm:text-sm">
            <Send className="h-4 w-4" />
            Sent
            {pendingAcceptanceQueries.length > 0 && (
              <Badge variant="outline" className="ml-0.5 h-4 sm:h-5 min-w-4 sm:min-w-5 px-1 flex items-center justify-center text-[10px] sm:text-xs bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                {pendingAcceptanceQueries.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="team" className="flex items-center gap-1.5 flex-shrink-0 text-xs sm:text-sm">
            <Users className="h-4 w-4" />
            Team
            {subordinateQueries.filter(q => q.status !== 'resolved').length > 0 && (
              <Badge variant="outline" className="ml-0.5 h-4 sm:h-5 min-w-4 sm:min-w-5 px-1 flex items-center justify-center text-[10px] sm:text-xs">
                {subordinateQueries.filter(q => q.status !== 'resolved').length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="snoozed" className="flex items-center gap-1.5 flex-shrink-0 text-xs sm:text-sm">
            <AlarmClock className="h-4 w-4" />
            Snoozed
            {snoozedTotalCount > 0 && (
              <Badge variant="outline" className="ml-0.5 h-4 sm:h-5 min-w-4 sm:min-w-5 px-1 flex items-center justify-center text-[10px] sm:text-xs">
                {snoozedTotalCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="insights" className="flex items-center gap-1.5 flex-shrink-0 text-xs sm:text-sm">
            <BarChart3 className="h-4 w-4" />
            Insights
          </TabsTrigger>
        </TabsList>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="mt-6 space-y-4">
          <InboxFilters
            filters={filters}
            onFiltersChange={setFilters}
            totalCount={notificationsTotalCount}
            showingCount={notifications.length}
            activeTab="notifications"
          />
          <InboxTable
            items={notificationItems}
            isLoading={loadingNotifications}
            isFetching={fetchingNotifications}
            hasMore={hasMoreNotifications}
            onLoadMore={loadMoreNotifications}
            onViewItem={handleViewItem}
            onMarkRead={handleMarkRead}
            onNavigate={handleNavigate}
            emptyMessage="No notifications yet"
            emptyDescription="You'll receive notifications when there are updates to your KPIs"
            currentUserId={user?.id}
            currentRole={effectiveRole || undefined}
            onSnooze={(id, until) => snoozeNotification.mutate({ notificationId: id, snoozedUntil: until })}
            isSnoozing={snoozeNotification.isPending}
          />
        </TabsContent>

        {/* Received Queries Tab */}
        <TabsContent value="received" className="mt-6 space-y-4">
          <InboxFilters
            filters={filters}
            onFiltersChange={setFilters}
            totalCount={receivedQueryItems.length}
            showingCount={filteredReceivedItems.length}
            activeTab="received"
          />
          <InboxTable
            items={filteredReceivedItems}
            isLoading={loadingQueries}
            onViewItem={handleViewItem}
            emptyMessage="No queries received"
            emptyDescription="Queries raised to you will appear here"
            enableGrouping={true}
            currentUserId={user?.id}
            onInlineRespond={handleInlineRespond}
            isInlineSubmitting={respondToQuery.isPending}
          />
        </TabsContent>

        {/* Sent Queries Tab */}
        <TabsContent value="sent" className="mt-6 space-y-4">
          <InboxFilters
            filters={filters}
            onFiltersChange={setFilters}
            totalCount={sentQueryItems.length}
            showingCount={filteredSentItems.length}
            activeTab="sent"
          />
          <InboxTable
            items={filteredSentItems}
            isLoading={loadingQueries}
            onViewItem={handleViewItem}
            emptyMessage="No queries sent"
            emptyDescription="Queries you've raised will appear here"
            enableGrouping={true}
            currentUserId={user?.id}
            onInlineAccept={handleInlineAccept}
            isInlineSubmitting={acceptQueryResponse.isPending}
          />
        </TabsContent>

        {/* Team Queries Tab */}
        <TabsContent value="team" className="mt-6 space-y-4">
          <InboxFilters
            filters={filters}
            onFiltersChange={setFilters}
            totalCount={teamQueryItems.length}
            showingCount={filteredTeamItems.length}
            activeTab="team"
          />
          <InboxTable
            items={filteredTeamItems}
            isLoading={loadingSubordinateQueries}
            onViewItem={handleViewItem}
            emptyMessage="No team queries"
            emptyDescription="Queries raised to your direct reports will appear here"
            enableGrouping={true}
            currentUserId={user?.id}
          />
        </TabsContent>

        {/* Snoozed Tab */}
        <TabsContent value="snoozed" className="mt-6 space-y-4">
          {/* Smart suggestion for repeatedly-snoozed items */}
          {snoozedItems.some(i => (i.snoozeCount || 0) >= 3) && (
            <div className="flex items-center gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
              <AlarmClock className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Some items have been snoozed 3+ times. Consider marking them as read to clear your inbox.
              </p>
            </div>
          )}
          <InboxTable
            items={snoozedItems}
            isLoading={loadingSnoozed}
            isFetching={fetchingSnoozed}
            hasMore={hasMoreSnoozed}
            onLoadMore={loadMoreSnoozed}
            onViewItem={handleViewItem}
            onMarkRead={handleMarkRead}
            onNavigate={handleNavigate}
            emptyMessage="No snoozed items"
            emptyDescription="Snooze notifications to defer them for later"
            enableGrouping={false}
            currentUserId={user?.id}
            currentRole={effectiveRole || undefined}
            onUnsnooze={(id) => unsnoozeNotification.mutate(id)}
            isSnoozing={unsnoozeNotification.isPending}
            showSnoozedInfo
          />
        </TabsContent>

        {/* Insights Tab */}
        <TabsContent value="insights" className="mt-6">
          <InboxInsights
            allQueries={insightsAllQueries}
            teamQueries={insightsTeamQueries}
            currentUserId={user?.id}
            notificationsCount={notificationsTotalCount}
            unreadCount={unreadNotificationsCount}
            isLoading={loadingQueries}
          />
        </TabsContent>
      </Tabs>

      {/* Detail Sheet */}
      <InboxDetailSheet
        item={selectedItem}
        open={detailSheetOpen}
        onOpenChange={setDetailSheetOpen}
        onNavigate={handleNavigate}
        onRespond={handleRespond}
        onAccept={handleAccept}
        currentUserId={user?.id}
        currentRole={effectiveRole || undefined}
      />

      {/* Response Dialog */}
      <Dialog open={responseDialogOpen} onOpenChange={setResponseDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Respond to Query</DialogTitle>
            <DialogDescription>
              Provide your response and resolution for this query
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Query Details */}
            <div className="p-4 bg-muted rounded-lg space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">KPI</Label>
                <p className="font-medium">{selectedQuery?.kpi?.kpi_name}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Query</Label>
                <p className="text-sm">{selectedQuery?.reason}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Raised By</Label>
                <p className="text-sm font-medium text-primary">
                  {selectedQuery?.raised_by_profile?.full_name || selectedQuery?.raised_by_profile?.email || 'Unknown'}
                </p>
              </div>
              {selectedQuery?.evidence_url && (
                <div>
                  <Label className="text-xs text-muted-foreground">Query Attachment</Label>
                  <a
                    href={selectedQuery.evidence_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline mt-1"
                  >
                    <Paperclip className="h-4 w-4" />
                    View Attachment
                  </a>
                </div>
              )}
            </div>

            {/* Resolution Notes */}
            <div className="space-y-2">
              <Label>Your Response <span className="text-destructive">*</span></Label>
              <Textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Provide your explanation or clarification..."
                rows={4}
              />
            </div>

            {/* Response Attachment */}
            {user && selectedQuery && (
              <EvidenceUpload
                userId={user.id}
                kpiId={selectedQuery.id}
                existingUrl={responseEvidenceUrl || null}
                onUploadComplete={(url) => setResponseEvidenceUrl(url)}
              />
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setResponseDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitResponse}
              disabled={!resolutionNotes.trim() || respondToQuery.isPending}
            >
              {respondToQuery.isPending ? 'Submitting...' : 'Submit Response'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
