import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, Notification } from '@/hooks/useNotifications';
import { useRespondToQuery, useAcceptQueryResponse, useSubordinateQueries, QueryStatusExtended, QueryWithDetails as WorkflowQueryWithDetails } from '@/hooks/useQueryWorkflow';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatsRowSkeleton, CategoryGridSkeleton } from '@/components/ui/LoadingSkeletons';
import { EvidenceUpload } from '@/components/ui/EvidenceUpload';
import { format } from 'date-fns';
import { MessageSquare, CheckCircle2, Clock, Send, User, Calendar, AlertCircle, Bell, BellOff, CheckCheck, ExternalLink, Paperclip, Eye, Users, MessageCircle } from 'lucide-react';

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
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  
  const [selectedQuery, setSelectedQuery] = useState<QueryWithDetails | null>(null);
  const [responseDialogOpen, setResponseDialogOpen] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [responseEvidenceUrl, setResponseEvidenceUrl] = useState('');
  const [activeTab, setActiveTab] = useState<'notifications' | 'received' | 'sent' | 'team'>('notifications');

  // Query workflow hooks
  const respondToQuery = useRespondToQuery();
  const acceptQueryResponse = useAcceptQueryResponse();
  const { data: subordinateQueries = [], isLoading: loadingSubordinateQueries } = useSubordinateQueries();

  // Fetch notifications
  const { data: notifications, isLoading: loadingNotifications } = useNotifications();
  const markNotificationRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  
  const unreadNotifications = useMemo(() => 
    notifications?.filter(n => !n.is_read) || [], 
    [notifications]
  );
  const readNotifications = useMemo(() => 
    notifications?.filter(n => n.is_read) || [], 
    [notifications]
  );

  // Fetch all queries for current user (both received and sent)
  const { data: allQueries, isLoading } = useQuery({
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
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Fetch profiles separately to avoid ambiguous join
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

  // Note: Query resolution now uses two-step workflow via useRespondToQuery and useAcceptQueryResponse

  // Filter queries by tab
  const receivedQueries = useMemo(() => 
    allQueries?.filter(q => q.raised_to === user?.id) || [], 
    [allQueries, user?.id]
  );
  
  const sentQueries = useMemo(() => 
    allQueries?.filter(q => q.raised_by === user?.id) || [], 
    [allQueries, user?.id]
  );

  const openQueries = receivedQueries.filter(q => q.status === 'open');
  const respondedQueries = receivedQueries.filter(q => q.status === 'responded');
  // Queries awaiting acceptance by the raiser (in Sent tab)
  const pendingAcceptanceQueries = sentQueries.filter(q => q.status === 'responded');
  // Count resolved queries from BOTH received and sent (for accurate stats)
  const resolvedReceivedQueries = receivedQueries.filter(q => q.status === 'resolved');
  const resolvedSentQueries = sentQueries.filter(q => q.status === 'resolved');
  const totalResolvedQueries = resolvedReceivedQueries.length + resolvedSentQueries.length;

  const openResponseDialog = (query: QueryWithDetails) => {
    setSelectedQuery(query);
    setResolutionNotes('');
    setResponseEvidenceUrl('');
    setResponseDialogOpen(true);
  };

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

  const handleAcceptResponse = (query: QueryWithDetails) => {
    acceptQueryResponse.mutate({
      query_id: query.id,
      kpi_id: query.kpi_id,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <div className="h-8 w-36 bg-muted animate-pulse rounded" />
            <div className="h-4 w-56 bg-muted animate-pulse rounded" />
          </div>
        </div>
        <StatsRowSkeleton count={3} />
        <CategoryGridSkeleton count={4} />
      </div>
    );
  }

  const renderQueryCard = (query: QueryWithDetails, options: { showActions?: boolean; isFYI?: boolean; isRaiser?: boolean } = {}) => {
    const { showActions = true, isFYI = false, isRaiser = false } = options;
    
    const getStatusBadge = () => {
      if (query.status === 'open') {
        return (
          <Badge variant="outline" className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
            <Clock className="h-3 w-3 mr-1" /> Open
          </Badge>
        );
      } else if (query.status === 'responded') {
        return (
          <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
            <MessageCircle className="h-3 w-3 mr-1" /> Responded
          </Badge>
        );
      } else {
        return (
          <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
            <CheckCircle2 className="h-3 w-3 mr-1" /> Resolved
          </Badge>
        );
      }
    };

    return (
      <Card key={query.id} className={query.status === 'resolved' ? 'opacity-75' : ''}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                {query.kpi?.kpi_name || 'Unknown KPI'}
              </CardTitle>
              <CardDescription>{query.kpi?.kra_name}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {isFYI && (
                <Badge variant="outline" className="text-blue-600 border-blue-200 dark:border-blue-800">
                  <Eye className="h-3 w-3 mr-1" /> For Info
                </Badge>
              )}
              {getStatusBadge()}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm">{query.reason}</p>
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="h-4 w-4" />
              <span>From: {query.raised_by_profile?.full_name || query.raised_by_profile?.email || 'Unknown'}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>{format(new Date(query.created_at), 'dd MMM yyyy, hh:mm a')}</span>
            </div>
          </div>

          {/* Show recipient for FYI/Sent views */}
          {(isFYI || isRaiser) && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              <span>To: {query.raised_to_profile?.full_name || query.raised_to_profile?.email || 'Unknown'}</span>
            </div>
          )}

          {query.kpi && (
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">
                {query.kpi.review_period} {query.kpi.review_year}
              </Badge>
              <Badge variant="secondary">
                Target: {query.kpi.target_value} {query.kpi.uom}
              </Badge>
            </div>
          )}

          {/* Show query attachment if exists */}
          {query.evidence_url && (
            <a 
              href={query.evidence_url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <Paperclip className="h-4 w-4" />
              View Query Attachment
            </a>
          )}

          {/* Show resolution notes with appropriate styling based on status */}
          {query.resolution_notes && (
            <div className={`p-3 rounded-lg border-2 ${
              query.status === 'resolved' 
                ? 'bg-green-50 dark:bg-green-950 border-green-300 dark:border-green-700'
                : 'bg-amber-50 dark:bg-amber-950 border-amber-300 dark:border-amber-700'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                {query.status === 'resolved' ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                ) : (
                  <MessageCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                )}
                <Label className={`text-sm font-medium ${
                  query.status === 'resolved' 
                    ? 'text-green-700 dark:text-green-300'
                    : 'text-amber-700 dark:text-amber-300'
                }`}>
                  {query.status === 'resolved' ? 'Response Accepted' : 'Response Pending Acceptance'}
                </Label>
              </div>
              <p className="text-sm mt-1 text-foreground">{query.resolution_notes}</p>
              {query.resolution_evidence_url && (
                <a 
                  href={query.resolution_evidence_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-2 text-sm hover:underline mt-2 ${
                    query.status === 'resolved' 
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  <Paperclip className="h-4 w-4" />
                  View Response Attachment
                </a>
              )}
              {query.resolved_at && (
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Resolved on {format(new Date(query.resolved_at), 'dd MMM yyyy, hh:mm a')}
                </p>
              )}
            </div>
          )}

          {/* Actions for employees - only on open queries they received */}
          {showActions && query.status === 'open' && query.raised_to === user?.id && !isFYI && (
            <Button onClick={() => openResponseDialog(query)} className="w-full">
              <Send className="h-4 w-4 mr-2" />
              Submit Response
            </Button>
          )}

          {/* Actions for raisers - accept response on responded queries */}
          {showActions && query.status === 'responded' && query.raised_by === user?.id && (
            <Button 
              onClick={() => handleAcceptResponse(query)} 
              className="w-full"
              disabled={acceptQueryResponse.isPending}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              {acceptQueryResponse.isPending ? 'Accepting...' : 'Accept Response'}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  };

  // Notification type icons and colors
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'kpi_submitted': return <Send className="h-4 w-4 text-blue-500" />;
      case 'kpi_approved': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'kpi_finalized': return <CheckCheck className="h-4 w-4 text-purple-500" />;
      case 'kpi_ready_for_audit':
      case 'kpi_ready_for_management': return <Bell className="h-4 w-4 text-yellow-500" />;
      case 'query_raised': return <AlertCircle className="h-4 w-4 text-orange-500" />;
      case 'query_resolved': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      default: return <Bell className="h-4 w-4 text-muted-foreground" />;
    }
  };

  // Get navigation path based on notification type
  const getNotificationLink = (notification: Notification): string | null => {
    const kpiId = notification.kpi_id;
    
    switch (notification.type) {
      case 'kpi_submitted':
        // Manager should go to Team Review to review the submitted KPI
        return kpiId ? `/team-review?kpi=${kpiId}` : '/team-review';
      case 'kpi_approved':
      case 'kpi_finalized':
        // Employee should go to My KPIs to see their approved KPI
        return kpiId ? `/my-kpis?kpi=${kpiId}` : '/my-kpis';
      case 'kpi_ready_for_audit':
        // Auditor should go to Audit Panel
        return kpiId ? `/audit?kpi=${kpiId}` : '/audit';
      case 'kpi_ready_for_management':
        // Management should go to Management Review
        return kpiId ? `/management-review?kpi=${kpiId}` : '/management-review';
      case 'query_raised':
      case 'query_resolved':
        // Stay on queries page but switch to queries tab
        return null; // Handle separately
      default:
        return '/my-kpis';
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    // Mark as read
    if (!notification.is_read) {
      markNotificationRead.mutate(notification.id);
    }
  };

  const handleOpenNotification = (e: React.MouseEvent, notification: Notification) => {
    e.stopPropagation(); // Prevent card click
    
    // Mark as read
    if (!notification.is_read) {
      markNotificationRead.mutate(notification.id);
    }

    // Handle query notifications - switch to queries tab
    if (notification.type === 'query_raised' || notification.type === 'query_resolved') {
      setActiveTab('received');
      return;
    }

    // Navigate to appropriate page
    const link = getNotificationLink(notification);
    if (link) {
      navigate(link);
    }
  };

  const renderNotificationCard = (notification: Notification) => {
    const link = getNotificationLink(notification);
    const isQueryNotification = notification.type === 'query_raised' || notification.type === 'query_resolved';
    
    return (
      <Card 
        key={notification.id} 
        className={`transition-all hover:shadow-md ${notification.is_read ? 'opacity-60' : 'border-l-4 border-l-primary'}`}
        onClick={() => handleNotificationClick(notification)}
      >
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <div className="mt-1">
              {getNotificationIcon(notification.type)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-sm truncate">{notification.title}</p>
                <div className="flex items-center gap-2 shrink-0">
                  {!notification.is_read && (
                    <Badge variant="default" className="h-5 text-xs">New</Badge>
                  )}
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{notification.message}</p>
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-muted-foreground">
                  {format(new Date(notification.created_at), 'dd MMM yyyy, hh:mm a')}
                </p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-7 text-xs"
                  onClick={(e) => handleOpenNotification(e, notification)}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  {isQueryNotification ? 'View Query' : 'Open'}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inbox</h1>
          <p className="text-muted-foreground">Notifications and queries for your KPIs</p>
        </div>
        {unreadNotifications.length > 0 && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
          >
            <CheckCheck className="h-4 w-4 mr-2" />
            Mark all as read
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Unread</p>
                <p className="text-3xl font-bold text-primary">{unreadNotifications.length}</p>
                <p className="text-xs text-muted-foreground">New notifications</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Bell className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Open Queries</p>
                <p className="text-3xl font-bold text-orange-600">{openQueries.length}</p>
                <p className="text-xs text-muted-foreground">Awaiting response</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-orange-500/10 flex items-center justify-center">
                <Clock className="h-6 w-6 text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Resolved</p>
                <p className="text-3xl font-bold text-green-600">{totalResolvedQueries}</p>
                <p className="text-xs text-muted-foreground">
                  {resolvedReceivedQueries.length} answered, {resolvedSentQueries.length} replies
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Sent</p>
                <p className="text-3xl font-bold text-blue-600">{sentQueries.length}</p>
                <p className="text-xs text-muted-foreground">Queries raised</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Send className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'notifications' | 'received' | 'sent' | 'team')}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Notifications
            {unreadNotifications.length > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1 flex items-center justify-center text-xs">
                {unreadNotifications.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="received" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Queries
            {openQueries.length > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1 flex items-center justify-center text-xs">
                {openQueries.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="sent" className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            Sent
            {pendingAcceptanceQueries.length > 0 && (
              <Badge variant="outline" className="ml-1 h-5 min-w-5 px-1 flex items-center justify-center text-xs bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                {pendingAcceptanceQueries.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="team" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Team Queries
            {subordinateQueries.filter(q => q.status !== 'resolved').length > 0 && (
              <Badge variant="outline" className="ml-1 h-5 min-w-5 px-1 flex items-center justify-center text-xs">
                {subordinateQueries.filter(q => q.status !== 'resolved').length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="notifications" className="mt-6">
          {(notifications?.length || 0) === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <BellOff className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">No notifications yet</p>
                <p className="text-xs text-muted-foreground mt-1">You'll receive notifications when there are updates to your KPIs</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {unreadNotifications.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Bell className="h-5 w-5 text-primary" />
                    New ({unreadNotifications.length})
                  </h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    {unreadNotifications.map(n => renderNotificationCard(n))}
                  </div>
                </div>
              )}
              
              {readNotifications.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-muted-foreground">
                    <BellOff className="h-5 w-5" />
                    Earlier ({readNotifications.length})
                  </h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    {readNotifications.slice(0, 10).map(n => renderNotificationCard(n))}
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="received" className="mt-6">
          {receivedQueries.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">No queries received yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {openQueries.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-orange-500" />
                    Open Queries ({openQueries.length})
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    {openQueries.map(query => renderQueryCard(query))}
                  </div>
                </div>
              )}

              {respondedQueries.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <MessageCircle className="h-5 w-5 text-amber-500" />
                    Awaiting Acceptance ({respondedQueries.length})
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    {respondedQueries.map(query => renderQueryCard(query, { showActions: false }))}
                  </div>
                </div>
              )}
              
              {resolvedReceivedQueries.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    Resolved ({resolvedReceivedQueries.length})
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    {resolvedReceivedQueries.map(query => renderQueryCard(query, { showActions: false }))}
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="sent" className="mt-6">
          {sentQueries.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Send className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">You haven't raised any queries yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {pendingAcceptanceQueries.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <MessageCircle className="h-5 w-5 text-amber-500" />
                    Pending Acceptance ({pendingAcceptanceQueries.length})
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    {pendingAcceptanceQueries.map(query => renderQueryCard(query, { showActions: true, isRaiser: true }))}
                  </div>
                </div>
              )}
              
              {sentQueries.filter(q => q.status !== 'responded').length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Send className="h-5 w-5 text-blue-500" />
                    All Sent ({sentQueries.filter(q => q.status !== 'responded').length})
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    {sentQueries.filter(q => q.status !== 'responded').map(query => renderQueryCard(query, { showActions: false, isRaiser: true }))}
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="team" className="mt-6">
          {subordinateQueries.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">No queries for your team members</p>
                <p className="text-xs text-muted-foreground mt-1">Queries raised to your direct reports will appear here</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {subordinateQueries.filter(q => q.status === 'open').length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-orange-500" />
                    Open ({subordinateQueries.filter(q => q.status === 'open').length})
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    {subordinateQueries.filter(q => q.status === 'open').map(query => renderQueryCard(query, { showActions: false, isFYI: true }))}
                  </div>
                </div>
              )}

              {subordinateQueries.filter(q => q.status === 'responded').length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <MessageCircle className="h-5 w-5 text-amber-500" />
                    Responded ({subordinateQueries.filter(q => q.status === 'responded').length})
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    {subordinateQueries.filter(q => q.status === 'responded').map(query => renderQueryCard(query, { showActions: false, isFYI: true }))}
                  </div>
                </div>
              )}
              
              {subordinateQueries.filter(q => q.status === 'resolved').length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    Resolved ({subordinateQueries.filter(q => q.status === 'resolved').length})
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    {subordinateQueries.filter(q => q.status === 'resolved').map(query => renderQueryCard(query, { showActions: false, isFYI: true }))}
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Respond Dialog */}
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
              <Send className="h-4 w-4 mr-2" />
              {respondToQuery.isPending ? 'Submitting...' : 'Submit Response'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
