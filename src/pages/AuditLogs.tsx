import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableSkeleton, StatsRowSkeleton } from '@/components/ui/LoadingSkeletons';
import { ReviewPeriodSelector, useReviewPeriodDefaults } from '@/components/ui/ReviewPeriodSelector';
import { format } from 'date-fns';
import { History, Search, User, CheckCircle2, MessageSquare, Lock, Edit, Send, UserCog } from 'lucide-react';

interface AuditLog {
  id: string;
  kpi_id: string;
  submission_id: string | null;
  action: string;
  performed_by: string;
  on_behalf_of: string | null;
  on_behalf_role: string | null;
  old_value: any;
  new_value: any;
  metadata: any;
  created_at: string;
  performer: { id: string; full_name: string | null; email: string } | null;
  on_behalf_profile: { id: string; full_name: string | null; email: string } | null;
  kpi: {
    id: string;
    kra_name: string;
    kpi_name: string;
    review_period: string | null;
    review_year: number | null;
    employee_id: string;
  } | null;
}

const actionIcons: Record<string, React.ReactNode> = {
  MANAGER_APPROVED: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  QUERY_RAISED: <MessageSquare className="h-4 w-4 text-orange-500" />,
  QUERY_RESOLVED: <CheckCircle2 className="h-4 w-4 text-blue-500" />,
  KPI_LOCKED: <Lock className="h-4 w-4 text-purple-500" />,
  SELF_REVIEW_SUBMITTED: <Send className="h-4 w-4 text-blue-500" />,
  KPI_UPDATED: <Edit className="h-4 w-4 text-gray-500" />,
  // Admin action icons
  ADMIN_DATA_ENTRY_SELF: <UserCog className="h-4 w-4 text-rose-500" />,
  ADMIN_DATA_ENTRY_MANAGER: <UserCog className="h-4 w-4 text-rose-500" />,
  ADMIN_DATA_ENTRY_AUDITOR: <UserCog className="h-4 w-4 text-rose-500" />,
  ADMIN_DATA_ENTRY_MANAGEMENT: <UserCog className="h-4 w-4 text-rose-500" />,
  ADMIN_DAILY_ENTRY_OVERRIDE: <UserCog className="h-4 w-4 text-rose-500" />,
  ADMIN_STATUS_OVERRIDE: <UserCog className="h-4 w-4 text-rose-600" />,
  ADMIN_OVERRIDE: <UserCog className="h-4 w-4 text-rose-500" />,
  MANAGER_DAILY_OVERRIDE: <User className="h-4 w-4 text-purple-500" />,
  SELF_REVIEW_RECALLED: <Send className="h-4 w-4 text-blue-400" />,
};

const actionLabels: Record<string, string> = {
  MANAGER_APPROVED: 'Manager Approved KPI',
  QUERY_RAISED: 'Query Raised',
  QUERY_RESOLVED: 'Query Resolved',
  KPI_LOCKED: 'KPI Locked',
  SELF_REVIEW_SUBMITTED: 'Self Review Submitted',
  KPI_UPDATED: 'KPI Updated',
  // Admin action labels
  ADMIN_DATA_ENTRY_SELF: 'Admin: Self Data Entry',
  ADMIN_DATA_ENTRY_MANAGER: 'Admin: Manager Data Entry',
  ADMIN_DATA_ENTRY_AUDITOR: 'Admin: Auditor Data Entry',
  ADMIN_DATA_ENTRY_MANAGEMENT: 'Admin: Management Data Entry',
  ADMIN_DAILY_ENTRY_OVERRIDE: 'Admin: Daily Override',
  ADMIN_STATUS_OVERRIDE: 'Admin: Status Override',
  ADMIN_OVERRIDE: 'Admin: KPI Override',
  MANAGER_DAILY_OVERRIDE: 'Manager: Daily Override',
  SELF_REVIEW_RECALLED: 'Self Review Recalled',
};

const actionColors: Record<string, string> = {
  MANAGER_APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  QUERY_RAISED: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  QUERY_RESOLVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  KPI_LOCKED: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  SELF_REVIEW_SUBMITTED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  KPI_UPDATED: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  // Admin action colors - Rose/Pink theme
  ADMIN_DATA_ENTRY_SELF: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
  ADMIN_DATA_ENTRY_MANAGER: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
  ADMIN_DATA_ENTRY_AUDITOR: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
  ADMIN_DATA_ENTRY_MANAGEMENT: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
  ADMIN_DAILY_ENTRY_OVERRIDE: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
  ADMIN_STATUS_OVERRIDE: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
  ADMIN_OVERRIDE: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
  MANAGER_DAILY_OVERRIDE: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  SELF_REVIEW_RECALLED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};

export default function AuditLogs() {
  const { role } = useAuth();
  const { defaultPeriod, defaultYear } = useReviewPeriodDefaults();
  const [selectedPeriod, setSelectedPeriod] = useState(defaultPeriod);
  const [selectedYear, setSelectedYear] = useState(defaultYear);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');

  const { data: auditLogs, isLoading } = useQuery({
    queryKey: ['audit-logs', selectedPeriod, selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kpi_audit_logs')
        .select(`
          id, kpi_id, submission_id, action, performed_by, 
          on_behalf_of, on_behalf_role,
          old_value, new_value, metadata, created_at,
          kpi:kpi_id!inner(id, kra_name, kpi_name, review_period, review_year, employee_id)
        `)
        .eq('kpi.review_period', selectedPeriod)
        .eq('kpi.review_year', selectedYear)
        .order('created_at', { ascending: false })
        .limit(1000);

      if (error) throw error;
      
      // Collect all user IDs (performers and on_behalf_of)
      const performerIds = new Set<string>();
      const onBehalfIds = new Set<string>();
      data.forEach(log => {
        performerIds.add(log.performed_by);
        if (log.on_behalf_of) onBehalfIds.add(log.on_behalf_of);
      });
      
      const allUserIds = [...new Set([...performerIds, ...onBehalfIds])];
      
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', allUserIds);
      
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      
      return data.map(log => ({
        ...log,
        performer: profileMap.get(log.performed_by) || null,
        on_behalf_profile: log.on_behalf_of ? profileMap.get(log.on_behalf_of) || null : null,
      })) as AuditLog[];
    },
  });

  // Filter logs
  const filteredLogs = useMemo(() => {
    let logs = auditLogs || [];
    
    // Filter by action
    if (actionFilter !== 'all') {
      logs = logs.filter(log => log.action === actionFilter);
    }
    
    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      logs = logs.filter(log => 
        log.kpi?.kpi_name?.toLowerCase().includes(query) ||
        log.kpi?.kra_name?.toLowerCase().includes(query) ||
        log.performer?.full_name?.toLowerCase().includes(query) ||
        log.performer?.email?.toLowerCase().includes(query) ||
        log.on_behalf_profile?.full_name?.toLowerCase().includes(query) ||
        log.on_behalf_profile?.email?.toLowerCase().includes(query)
      );
    }
    
    return logs;
  }, [auditLogs, selectedPeriod, selectedYear, actionFilter, searchQuery]);

  // Get unique actions for filter
  const uniqueActions = useMemo(() => {
    const actions = new Set<string>();
    auditLogs?.forEach(log => actions.add(log.action));
    return Array.from(actions);
  }, [auditLogs]);

  // Stats
  const todayLogs = filteredLogs.filter(log => {
    const today = new Date().toDateString();
    return new Date(log.created_at).toDateString() === today;
  });

  // Count admin actions
  const adminActions = filteredLogs.filter(log => 
    log.action.startsWith('ADMIN_') || log.on_behalf_of
  );

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <div className="h-8 w-40 bg-muted animate-pulse rounded" />
            <div className="h-4 w-60 bg-muted animate-pulse rounded" />
          </div>
          <div className="h-10 w-48 bg-muted animate-pulse rounded" />
        </div>
        <StatsRowSkeleton count={4} />
        <TableSkeleton rows={8} columns={7} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Audit Logs</h1>
          <p className="text-muted-foreground">View all KPI-level actions and changes</p>
        </div>
        <ReviewPeriodSelector
          selectedPeriod={selectedPeriod}
          selectedYear={selectedYear}
          onPeriodChange={setSelectedPeriod}
          onYearChange={setSelectedYear}
        />
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Actions</p>
                <p className="text-3xl font-bold">{filteredLogs.length}</p>
                <p className="text-xs text-muted-foreground">For {selectedPeriod} {selectedYear}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <History className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Today's Actions</p>
                <p className="text-3xl font-bold text-green-600">{todayLogs.length}</p>
                <p className="text-xs text-muted-foreground">Actions recorded today</p>
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
                <p className="text-sm font-medium text-muted-foreground">Approvals</p>
                <p className="text-3xl font-bold text-blue-600">
                  {filteredLogs.filter(l => l.action === 'MANAGER_APPROVED').length}
                </p>
                <p className="text-xs text-muted-foreground">KPIs approved this period</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-rose-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Admin Actions</p>
                <p className="text-3xl font-bold text-rose-600">{adminActions.length}</p>
                <p className="text-xs text-muted-foreground">On-behalf entries</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-rose-500/10 flex items-center justify-center">
                <UserCog className="h-6 w-6 text-rose-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by KPI, KRA, or user..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {uniqueActions.map(action => (
              <SelectItem key={action} value={action}>
                {actionLabels[action] || action}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
          <CardDescription>{filteredLogs.length} actions found</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>KPI</TableHead>
                <TableHead>Performed By</TableHead>
                <TableHead>On Behalf Of</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map(log => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap">
                    <div className="text-sm">
                      {format(new Date(log.created_at), 'dd MMM yyyy')}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(log.created_at), 'hh:mm a')}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={actionColors[log.action] || 'bg-muted'}>
                      <span className="flex items-center gap-1">
                        {actionIcons[log.action]}
                        {actionLabels[log.action] || log.action}
                      </span>
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{log.kpi?.kpi_name || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">{log.kpi?.kra_name}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        {log.performer?.full_name || log.performer?.email || 'Unknown'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {log.on_behalf_of && log.on_behalf_profile ? (
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-rose-500" />
                        <div>
                          <span className="text-sm text-rose-600 dark:text-rose-400">
                            {log.on_behalf_profile.full_name || log.on_behalf_profile.email}
                          </span>
                          {log.on_behalf_role && (
                            <p className="text-xs text-muted-foreground">
                              {log.on_behalf_role} level
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    {(log.new_value || log.metadata) && (
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        {log.metadata?.reason && (
                          <span className="truncate block text-rose-600 dark:text-rose-400">
                            Reason: {String(log.metadata.reason)}
                          </span>
                        )}
                        {log.new_value?.manager_rating && (
                          <span>Rating: {log.new_value.manager_rating}</span>
                        )}
                        {log.new_value?.reason && (
                          <span className="truncate block">{log.new_value.reason}</span>
                        )}
                        {log.new_value?.resolution_notes && (
                          <span className="truncate block">{log.new_value.resolution_notes}</span>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filteredLogs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No audit logs found for this period
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}