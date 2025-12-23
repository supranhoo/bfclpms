import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ReviewPeriodSelector, useReviewPeriodDefaults } from '@/components/ui/ReviewPeriodSelector';
import { format } from 'date-fns';
import { History, Search, User, CheckCircle2, MessageSquare, Lock, Edit, Send } from 'lucide-react';

interface AuditLog {
  id: string;
  kpi_id: string;
  submission_id: string | null;
  action: string;
  performed_by: string;
  old_value: any;
  new_value: any;
  metadata: any;
  created_at: string;
  performer: { id: string; full_name: string | null; email: string } | null;
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
};

const actionLabels: Record<string, string> = {
  MANAGER_APPROVED: 'Manager Approved KPI',
  QUERY_RAISED: 'Query Raised',
  QUERY_RESOLVED: 'Query Resolved',
  KPI_LOCKED: 'KPI Locked',
  SELF_REVIEW_SUBMITTED: 'Self Review Submitted',
  KPI_UPDATED: 'KPI Updated',
};

const actionColors: Record<string, string> = {
  MANAGER_APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  QUERY_RAISED: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  QUERY_RESOLVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  KPI_LOCKED: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  SELF_REVIEW_SUBMITTED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  KPI_UPDATED: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

export default function AuditLogs() {
  const { role } = useAuth();
  const { defaultPeriod, defaultYear } = useReviewPeriodDefaults();
  const [selectedPeriod, setSelectedPeriod] = useState(defaultPeriod);
  const [selectedYear, setSelectedYear] = useState(defaultYear);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');

  const { data: auditLogs, isLoading } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kpi_audit_logs')
        .select(`
          *,
          kpi:kpi_id(id, kra_name, kpi_name, review_period, review_year, employee_id)
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      
      // Fetch performer profiles separately
      const performerIds = new Set<string>();
      data.forEach(log => performerIds.add(log.performed_by));
      
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', Array.from(performerIds));
      
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      
      return data.map(log => ({
        ...log,
        performer: profileMap.get(log.performed_by) || null,
      })) as AuditLog[];
    },
  });

  // Filter logs
  const filteredLogs = useMemo(() => {
    let logs = auditLogs || [];
    
    // Filter by period - ensure proper string comparison
    logs = logs.filter(log => {
      const periodMatch = log.kpi?.review_period?.trim().toLowerCase() === selectedPeriod?.trim().toLowerCase();
      const yearMatch = log.kpi?.review_year === selectedYear;
      return periodMatch && yearMatch;
    });
    
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
        log.performer?.email?.toLowerCase().includes(query)
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

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
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
      <div className="grid gap-4 md:grid-cols-3">
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
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map(log => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap">
                    <div className="text-sm">
                      {format(new Date(log.created_at), 'MMM d, yyyy')}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(log.created_at), 'h:mm a')}
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
                  <TableCell className="max-w-[200px]">
                    {log.new_value && (
                      <div className="text-xs text-muted-foreground">
                        {log.new_value.manager_rating && (
                          <span>Rating: {log.new_value.manager_rating}</span>
                        )}
                        {log.new_value.reason && (
                          <span className="truncate block">{log.new_value.reason}</span>
                        )}
                        {log.new_value.resolution_notes && (
                          <span className="truncate block">{log.new_value.resolution_notes}</span>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filteredLogs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
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
