import { useState, useMemo } from 'react';
import { useReportAccess } from '@/hooks/useReportAccess';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { Download, Search, ClipboardList, CheckCircle2, AlertTriangle, Edit, UserCog, User } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

interface AuditLog {
  id: string;
  kpi_id: string;
  action: string;
  performed_by: string;
  on_behalf_of: string | null;
  on_behalf_role: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  kpi?: {
    kpi_name: string;
    kra_name: string;
    review_period: string;
    review_year: number;
  };
  performer?: {
    full_name: string;
    email: string;
  };
  on_behalf_profile?: {
    full_name: string;
    email: string;
  } | null;
}

const actionLabels: Record<string, string> = {
  'self_review_submitted': 'Self Review',
  'SELF_REVIEW_SUBMITTED': 'Self Review',
  'manager_approved': 'Manager Approved',
  'MANAGER_APPROVED': 'Manager Approved',
  'manager_sent_back': 'Sent Back',
  'MANAGER_SENT_BACK': 'Manager Sent Back',
  'auditor_approved': 'Auditor Approved',
  'AUDITOR_APPROVED': 'Auditor Approved',
  'AUDITOR_SENT_BACK': 'Auditor Sent Back',
  'management_approved': 'Management Approved',
  'MANAGEMENT_APPROVED': 'Management Approved',
  'MANAGEMENT_SENT_BACK': 'Management Sent Back',
  'skip_level_approved': 'Skip-Level Approved',
  'SKIP_LEVEL_APPROVED': 'Skip-Level Approved',
  'SKIP_LEVEL_SENT_BACK': 'Skip-Level Sent Back',
  'hr_pms_approved': 'HR PMS Approved',
  'HR_PMS_APPROVED': 'HR PMS Approved',
  'HR_PMS_SENT_BACK': 'HR PMS Sent Back',
  'query_raised': 'Query Raised',
  'QUERY_RAISED': 'Query Raised',
  'query_resolved': 'Query Resolved',
  'QUERY_RESOLVED': 'Query Resolved',
  'kpi_created': 'KPI Created',
  'KPI_CREATED': 'KPI Created',
  'kpi_updated': 'KPI Updated',
  'KPI_UPDATED': 'KPI Updated',
  'admin_override': 'Admin Override',
  'kra_accepted': 'KRA Accepted',
  // Admin action labels
  'ADMIN_DATA_ENTRY_SELF': 'Admin: Self Data Entry',
  'ADMIN_DATA_ENTRY_MANAGER': 'Admin: Manager Data Entry',
  'ADMIN_DATA_ENTRY_SKIP_LEVEL': 'Admin: Skip-Level Data Entry',
  'ADMIN_DATA_ENTRY_HR_PMS': 'Admin: HR PMS Data Entry',
  'ADMIN_DATA_ENTRY_AUDITOR': 'Admin: Auditor Data Entry',
  'ADMIN_DATA_ENTRY_MANAGEMENT': 'Admin: Management Data Entry',
  'ADMIN_DAILY_ENTRY_OVERRIDE': 'Admin: Daily Override',
  'ADMIN_STATUS_OVERRIDE': 'Admin: Status Override',
  'ADMIN_OVERRIDE': 'Admin: KPI Override',
  'MANAGER_DAILY_OVERRIDE': 'Manager: Daily Override',
  'SELF_REVIEW_RECALLED': 'Self Review Recalled',
};

const actionColors: Record<string, string> = {
  'self_review_submitted': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'SELF_REVIEW_SUBMITTED': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'manager_approved': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  'MANAGER_APPROVED': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  'manager_sent_back': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'auditor_approved': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  'AUDITOR_APPROVED': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  'management_approved': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  'MANAGEMENT_APPROVED': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  'query_raised': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  'QUERY_RAISED': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  'query_resolved': 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  'QUERY_RESOLVED': 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  'kpi_created': 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  'KPI_CREATED': 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  'kpi_updated': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  'KPI_UPDATED': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  'admin_override': 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  'kra_accepted': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  // Skip-Level and HR PMS action colors
  'skip_level_approved': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  'SKIP_LEVEL_APPROVED': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  'SKIP_LEVEL_SENT_BACK': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'hr_pms_approved': 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  'HR_PMS_APPROVED': 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  'HR_PMS_SENT_BACK': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'MANAGER_SENT_BACK': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'AUDITOR_SENT_BACK': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'MANAGEMENT_SENT_BACK': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  // Admin action colors - Rose/Pink theme
  'ADMIN_DATA_ENTRY_SELF': 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
  'ADMIN_DATA_ENTRY_MANAGER': 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
  'ADMIN_DATA_ENTRY_SKIP_LEVEL': 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
  'ADMIN_DATA_ENTRY_HR_PMS': 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
  'ADMIN_DATA_ENTRY_AUDITOR': 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
  'ADMIN_DATA_ENTRY_MANAGEMENT': 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
  'ADMIN_DAILY_ENTRY_OVERRIDE': 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
  'ADMIN_STATUS_OVERRIDE': 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
  'ADMIN_OVERRIDE': 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
  'MANAGER_DAILY_OVERRIDE': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  'SELF_REVIEW_RECALLED': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};

export default function AuditTrailReport() {
  const { canDownload } = useReportAccess();
  const canExport = canDownload('audit-trail');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch audit logs with paginated fetching to avoid 1000-row truncation
  const { data: auditLogs = [], isLoading } = useQuery({
    queryKey: ['audit-trail-report'],
    queryFn: async () => {
      const allLogs: AuditLog[] = [];
      const batchSize = 1000;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('kpi_audit_logs')
          .select(`
            id,
            kpi_id,
            action,
            performed_by,
            on_behalf_of,
            on_behalf_role,
            old_value,
            new_value,
            metadata,
            created_at
          `)
          .order('created_at', { ascending: false })
          .range(offset, offset + batchSize - 1);

        if (error) throw error;
        allLogs.push(...(data as AuditLog[]));
        hasMore = data.length === batchSize;
        offset += batchSize;
      }

      return allLogs;
    },
  });

  // Fetch KPIs for context
  const { data: kpis = [] } = useQuery({
    queryKey: ['audit-kpis'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kpis')
        .select('id, kpi_name, kra_name, review_period, review_year');
      if (error) throw error;
      return data;
    },
  });

  // Fetch profiles for performer and on_behalf_of names
  const { data: profiles = [] } = useQuery({
    queryKey: ['audit-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email');
      if (error) throw error;
      return data;
    },
  });

  // Create lookup maps
  const kpiMap = useMemo(() => new Map(kpis.map(k => [k.id, k])), [kpis]);
  const profileMap = useMemo(() => new Map(profiles.map(p => [p.id, p])), [profiles]);

  // Enrich logs with KPI, performer, and on_behalf_profile data
  const enrichedLogs = useMemo(() => {
    return auditLogs.map(log => ({
      ...log,
      kpi: kpiMap.get(log.kpi_id),
      performer: profileMap.get(log.performed_by),
      on_behalf_profile: log.on_behalf_of ? profileMap.get(log.on_behalf_of) : null,
    }));
  }, [auditLogs, kpiMap, profileMap]);

  // Get unique periods and years
  const { periods, years } = useMemo(() => {
    const periodSet = new Set<string>();
    const yearSet = new Set<number>();
    enrichedLogs.forEach(log => {
      if (log.kpi?.review_period) periodSet.add(log.kpi.review_period);
      if (log.kpi?.review_year) yearSet.add(log.kpi.review_year);
    });
    return {
      periods: Array.from(periodSet).sort(),
      years: Array.from(yearSet).sort((a, b) => b - a),
    };
  }, [enrichedLogs]);

  // Get unique actions
  const uniqueActions = useMemo(() => {
    const actionSet = new Set<string>();
    auditLogs.forEach(log => actionSet.add(log.action));
    return Array.from(actionSet).sort();
  }, [auditLogs]);

  // Filter logs
  const filteredLogs = useMemo(() => {
    return enrichedLogs.filter(log => {
      if (selectedPeriod !== 'all' && log.kpi?.review_period !== selectedPeriod) return false;
      if (selectedYear !== 'all' && log.kpi?.review_year !== parseInt(selectedYear)) return false;
      if (selectedAction !== 'all' && log.action !== selectedAction) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesKpi = log.kpi?.kpi_name?.toLowerCase().includes(query) ||
                          log.kpi?.kra_name?.toLowerCase().includes(query);
        const matchesPerformer = log.performer?.full_name?.toLowerCase().includes(query) ||
                                 log.performer?.email?.toLowerCase().includes(query);
        const matchesOnBehalf = log.on_behalf_profile?.full_name?.toLowerCase().includes(query) ||
                                log.on_behalf_profile?.email?.toLowerCase().includes(query);
        if (!matchesKpi && !matchesPerformer && !matchesOnBehalf) return false;
      }
      return true;
    });
  }, [enrichedLogs, selectedPeriod, selectedYear, selectedAction, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const approvalActions = ['manager_approved', 'auditor_approved', 'management_approved', 
                             'MANAGER_APPROVED', 'AUDITOR_APPROVED', 'MANAGEMENT_APPROVED'];
    const modificationActions = ['kpi_updated', 'admin_override', 'self_review_submitted',
                                 'KPI_UPDATED', 'ADMIN_OVERRIDE', 'SELF_REVIEW_SUBMITTED'];
    const adminActions = filteredLogs.filter(l => 
      l.action.startsWith('ADMIN_') || l.on_behalf_of
    );
    
    return {
      totalActions: filteredLogs.length,
      todayActions: filteredLogs.filter(l => new Date(l.created_at).toDateString() === today).length,
      approvals: filteredLogs.filter(l => approvalActions.includes(l.action)).length,
      adminActions: adminActions.length,
    };
  }, [filteredLogs]);

  // Export to Excel - include on_behalf info
  const handleExport = () => {
    const exportData = filteredLogs.map(log => ({
      'Timestamp': format(new Date(log.created_at), 'yyyy-MM-dd HH:mm:ss'),
      'Action': actionLabels[log.action] || log.action,
      'KPI Name': log.kpi?.kpi_name || 'N/A',
      'KRA Name': log.kpi?.kra_name || 'N/A',
      'Review Period': log.kpi?.review_period || 'N/A',
      'Review Year': log.kpi?.review_year || 'N/A',
      'Performed By': log.performer?.full_name || 'N/A',
      'Performer Email': log.performer?.email || 'N/A',
      'On Behalf Of': log.on_behalf_profile?.full_name || '',
      'On Behalf Role': log.on_behalf_role || '',
      'Admin Reason': log.metadata?.reason ? String(log.metadata.reason) : '',
      'Details': log.new_value ? JSON.stringify(log.new_value) : '',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Audit Trail');
    XLSX.writeFile(wb, `Audit_Trail_Report_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Trail Report"
        description="Complete history of all KPI modifications and approvals"
        backTo="/reports"
        actions={
          canExport ? (
            <Button onClick={handleExport} className="gap-2">
              <Download className="h-4 w-4" />
              Export Excel
            </Button>
          ) : undefined
        }
      />

      {/* Statistics Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Total Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalActions}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Today's Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.todayActions}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Approvals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.approvals}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <UserCog className="h-4 w-4 text-rose-500" />
              Admin Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-600">{stats.adminActions}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Periods</SelectItem>
                {periods.map(period => (
                  <SelectItem key={period} value={period}>{period}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {years.map(year => (
                  <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedAction} onValueChange={setSelectedAction}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Action Type" />
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
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search KPI, performer, or on-behalf..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Log Table */}
      <Card>
        <CardContent className="p-0">
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
              {filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No audit logs found
                  </TableCell>
                </TableRow>
              ) : (
                filteredLogs.slice(0, 100).map(log => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {format(new Date(log.created_at), 'dd MMM yyyy HH:mm')}
                    </TableCell>
                    <TableCell>
                      <Badge className={actionColors[log.action] || 'bg-gray-100 text-gray-800'}>
                        {actionLabels[log.action] || log.action}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[200px]">
                        <p className="font-medium truncate">{log.kpi?.kpi_name || 'N/A'}</p>
                        <p className="text-xs text-muted-foreground truncate">{log.kpi?.kra_name}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{log.performer?.full_name || 'System'}</p>
                      <p className="text-xs text-muted-foreground">{log.performer?.email}</p>
                    </TableCell>
                    <TableCell>
                      {log.on_behalf_of && log.on_behalf_profile ? (
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-rose-500" />
                          <div>
                            <p className="font-medium text-rose-600 dark:text-rose-400">
                              {log.on_behalf_profile.full_name || log.on_behalf_profile.email}
                            </p>
                            {log.on_behalf_role && (
                              <p className="text-xs text-muted-foreground">{log.on_behalf_role} level</p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <div className="text-sm text-muted-foreground space-y-0.5">
                        {log.metadata?.reason && (
                          <p className="truncate text-rose-600 dark:text-rose-400">
                            Reason: {String(log.metadata.reason)}
                          </p>
                        )}
                        <p className="truncate">
                          {String(log.new_value?.remarks || log.new_value?.reason || 
                           (log.new_value?.score ? `Score: ${log.new_value.score}` : '-'))}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {filteredLogs.length > 100 && (
            <div className="p-4 text-center text-sm text-muted-foreground border-t">
              Showing 100 of {filteredLogs.length} records. Export to Excel for complete data.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}