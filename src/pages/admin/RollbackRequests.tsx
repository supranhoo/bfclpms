import { useState, useMemo } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useAllRollbackRequests,
  useRollbackStatusCounts,
  useOrgKpiRollbackLogs,
  useOrgKpiRollbackCount,
  type RollbackStatusFilter,
  type EnrichedRollbackRequest,
  type OrgKpiRollbackLog,
} from '@/hooks/useAllRollbackRequests';
import { useApproveRollbackRequest, useRejectRollbackRequest } from '@/hooks/useKpiRollbackRequests';
import { Clock, CheckCircle2, XCircle, AlertTriangle, Search, Undo2, Timer, Download, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

const STATUS_FILTERS: { value: RollbackStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'expired', label: 'Expired' },
];

const STATUS_BADGE: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }> = {
  pending: { variant: 'outline', className: 'border-amber-500 text-amber-600' },
  approved: { variant: 'default', className: 'bg-green-600' },
  rejected: { variant: 'destructive' },
  expired: { variant: 'secondary' },
};

function formatStatus(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function exportKpiStatusRequests(data: EnrichedRollbackRequest[]) {
  const rows = data.map(r => ({
    'Requester Name': r.requester?.full_name || '',
    'Requester Code': r.requester?.employee_code || '',
    'Employee Name': r.employee?.full_name || '',
    'Employee Code': r.employee?.employee_code || '',
    'KPI': r.kpi?.kpi_name || '',
    'KRA': r.kpi?.kra_name || '',
    'Period': r.kpi?.review_period || '',
    'Year': r.kpi?.review_year ?? '',
    'From Status': formatStatus(r.requested_from_status),
    'To Status': formatStatus(r.target_status),
    'Reason': r.reason,
    'Request Date': format(new Date(r.created_at), 'dd MMM yyyy'),
    'Status': formatStatus(r.status),
    'Actioned Date': r.actioned_at ? format(new Date(r.actioned_at), 'dd MMM yyyy') : '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'KPI Status Requests');
  XLSX.writeFile(wb, `KPI_Status_Rollback_Requests_${format(new Date(), 'yyyyMMdd')}.xlsx`);
}

function exportOrgKpiRollbacks(data: OrgKpiRollbackLog[]) {
  const rows = data.map(r => ({
    'KPI Name': r.kpi_name,
    'KRA': r.kra_name,
    'Review Period': r.review_period,
    'Year': r.review_year,
    'Action Type': r.action === 'bulk_rollback_to_data_entry' ? 'Bulk Rollback' : 'Single Rollback',
    'Performed By': r.performer?.full_name || '',
    'Old Value': r.old_value ?? '',
    'Reason': r.remarks || '',
    'Date': format(new Date(r.created_at), 'dd MMM yyyy HH:mm'),
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Org KPI Rollbacks');
  XLSX.writeFile(wb, `Org_KPI_Rollbacks_${format(new Date(), 'yyyyMMdd')}.xlsx`);
}

export default function RollbackRequests() {
  const [activeTab, setActiveTab] = useState('kpi-status');
  const [statusFilter, setStatusFilter] = useState<RollbackStatusFilter>('pending');
  const [search, setSearch] = useState('');
  const [orgSearch, setOrgSearch] = useState('');

  const { data: requests, isLoading } = useAllRollbackRequests(statusFilter);
  const { data: counts, isLoading: countsLoading } = useRollbackStatusCounts();
  const { data: orgLogs, isLoading: orgLoading } = useOrgKpiRollbackLogs();
  const { data: orgCount, isLoading: orgCountLoading } = useOrgKpiRollbackCount();
  const approveMutation = useApproveRollbackRequest();
  const rejectMutation = useRejectRollbackRequest();

  const filtered = useMemo(() => {
    if (!requests) return [];
    if (!search.trim()) return requests;
    const q = search.toLowerCase();
    return requests.filter(r =>
      r.requester?.full_name?.toLowerCase().includes(q) ||
      r.employee?.full_name?.toLowerCase().includes(q) ||
      r.kpi?.kpi_name?.toLowerCase().includes(q) ||
      r.kpi?.kra_name?.toLowerCase().includes(q) ||
      r.requester?.employee_code?.toLowerCase().includes(q) ||
      r.employee?.employee_code?.toLowerCase().includes(q)
    );
  }, [requests, search]);

  const filteredOrg = useMemo(() => {
    if (!orgLogs) return [];
    if (!orgSearch.trim()) return orgLogs;
    const q = orgSearch.toLowerCase();
    return orgLogs.filter(r =>
      r.kpi_name.toLowerCase().includes(q) ||
      r.kra_name.toLowerCase().includes(q) ||
      r.performer?.full_name?.toLowerCase().includes(q) ||
      r.remarks?.toLowerCase().includes(q)
    );
  }, [orgLogs, orgSearch]);

  const statCards = [
    { label: 'Pending', count: counts?.pending ?? 0, icon: Clock, color: 'text-amber-600' },
    { label: 'Approved', count: counts?.approved ?? 0, icon: CheckCircle2, color: 'text-green-600' },
    { label: 'Rejected', count: counts?.rejected ?? 0, icon: XCircle, color: 'text-destructive' },
    { label: 'Expired', count: counts?.expired ?? 0, icon: Timer, color: 'text-muted-foreground' },
    { label: 'Org Rollbacks', count: orgCount ?? 0, icon: RotateCcw, color: 'text-blue-600', isOrg: true },
  ];

  const handleExport = () => {
    if (activeTab === 'kpi-status') {
      exportKpiStatusRequests(filtered);
    } else {
      exportOrgKpiRollbacks(filteredOrg);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rollback Requests"
        description="Monitor and action KPI rollback requests across the organization"
        backTo="/admin"
      />

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        {statCards.map(({ label, count, icon: Icon, color, isOrg }) => (
          <Card
            key={label}
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => {
              if (isOrg) {
                setActiveTab('org-kpi');
              } else {
                setActiveTab('kpi-status');
                setStatusFilter(label.toLowerCase() as RollbackStatusFilter);
              }
            }}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className={`h-4 w-4 ${color}`} />
            </CardHeader>
            <CardContent>
              {(countsLoading || orgCountLoading) ? <Skeleton className="h-8 w-12" /> : <div className="text-2xl font-bold">{count}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="kpi-status">KPI Status Requests</TabsTrigger>
            <TabsTrigger value="org-kpi">Org KPI Rollbacks</TabsTrigger>
          </TabsList>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1.5" />
            Download Report
          </Button>
        </div>

        {/* Tab 1: KPI Status Requests */}
        <TabsContent value="kpi-status" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex gap-2 flex-wrap">
              {STATUS_FILTERS.map(f => (
                <Button
                  key={f.value}
                  variant={statusFilter === f.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter(f.value)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, code, or KPI..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6 space-y-3">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">
                  <Undo2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p>No rollback requests found</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Requester</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>KPI</TableHead>
                      <TableHead className="hidden lg:table-cell">KRA</TableHead>
                      <TableHead className="hidden md:table-cell">Period</TableHead>
                      <TableHead>Transition</TableHead>
                      <TableHead className="hidden xl:table-cell">Reason</TableHead>
                      <TableHead className="hidden md:table-cell">Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(r => {
                      const isSelfManager = r.employee?.reporting_manager_id === r.requested_by;
                      const badgeConfig = STATUS_BADGE[r.status] || STATUS_BADGE.expired;

                      return (
                        <TableRow key={r.id}>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              {isSelfManager && (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent>Self-manager deadlock — requester is their own reporting manager</TooltipContent>
                                </Tooltip>
                              )}
                              <div>
                                <div className="font-medium text-sm">{r.requester?.full_name || '—'}</div>
                                {r.requester?.employee_code && (
                                  <div className="text-xs text-muted-foreground">{r.requester.employee_code}</div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-sm">{r.employee?.full_name || '—'}</div>
                            {r.employee?.employee_code && (
                              <div className="text-xs text-muted-foreground">{r.employee.employee_code}</div>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[160px]">
                            <div className="text-sm truncate">{r.kpi?.kpi_name || '—'}</div>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell max-w-[140px]">
                            <div className="text-sm truncate text-muted-foreground">{r.kpi?.kra_name || '—'}</div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground whitespace-nowrap">
                            {r.kpi?.review_period || '—'} {r.kpi?.review_year || ''}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-xs">
                              <Badge variant="outline" className="text-xs">{formatStatus(r.requested_from_status)}</Badge>
                              <span className="text-muted-foreground">→</span>
                              <Badge variant="secondary" className="text-xs">{formatStatus(r.target_status)}</Badge>
                            </div>
                          </TableCell>
                          <TableCell className="hidden xl:table-cell max-w-[200px]">
                            <div className="text-sm text-muted-foreground truncate">{r.reason}</div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground whitespace-nowrap">
                            {format(new Date(r.created_at), 'dd MMM yyyy')}
                          </TableCell>
                          <TableCell>
                            <Badge variant={badgeConfig.variant} className={badgeConfig.className}>
                              {formatStatus(r.status)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {r.status === 'pending' ? (
                              <div className="flex gap-1.5">
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="h-7 text-xs"
                                  disabled={approveMutation.isPending || rejectMutation.isPending}
                                  onClick={() => approveMutation.mutate({
                                    request_id: r.id,
                                    kpi_id: r.kpi_id,
                                    target_status: r.target_status,
                                    requested_by: r.requested_by,
                                  })}
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  disabled={approveMutation.isPending || rejectMutation.isPending}
                                  onClick={() => rejectMutation.mutate({
                                    request_id: r.id,
                                    kpi_id: r.kpi_id,
                                    requested_by: r.requested_by,
                                  })}
                                >
                                  Reject
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Org KPI Rollbacks */}
        <TabsContent value="org-kpi" className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by KPI, KRA, or performer..."
              value={orgSearch}
              onChange={e => setOrgSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Card>
            <CardContent className="p-0">
              {orgLoading ? (
                <div className="p-6 space-y-3">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : filteredOrg.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">
                  <RotateCcw className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p>No org KPI rollback records found</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>KPI Name</TableHead>
                      <TableHead className="hidden md:table-cell">KRA</TableHead>
                      <TableHead className="hidden lg:table-cell">Period</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Performed By</TableHead>
                      <TableHead className="hidden md:table-cell">Old Value</TableHead>
                      <TableHead className="hidden xl:table-cell">Reason</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrg.map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="max-w-[180px]">
                          <div className="text-sm font-medium truncate">{r.kpi_name}</div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell max-w-[140px]">
                          <div className="text-sm text-muted-foreground truncate">{r.kra_name}</div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground whitespace-nowrap">
                          {r.review_period} {r.review_year}
                        </TableCell>
                        <TableCell>
                          <Badge variant={r.action === 'bulk_rollback_to_data_entry' ? 'destructive' : 'secondary'} className="text-xs">
                            {r.action === 'bulk_rollback_to_data_entry' ? 'Bulk' : 'Single'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">{r.performer?.full_name || '—'}</div>
                          {r.performer?.employee_code && (
                            <div className="text-xs text-muted-foreground">{r.performer.employee_code}</div>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                          {r.old_value ?? '—'}
                        </TableCell>
                        <TableCell className="hidden xl:table-cell max-w-[200px]">
                          <div className="text-sm text-muted-foreground truncate">{r.remarks || '—'}</div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {format(new Date(r.created_at), 'dd MMM yyyy')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
