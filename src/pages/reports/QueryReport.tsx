import { useState, useMemo, useCallback } from 'react';
import { useReportAccess } from '@/hooks/useReportAccess';
import { useAllKpis, useKpiQueries } from '@/hooks/useKpis';
import { useProfiles } from '@/hooks/useOrganization';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { CompanyFilter } from '@/components/reports/CompanyFilter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { AlertTriangle, CheckCircle, Clock, Download, MessageSquare } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import * as XLSX from 'xlsx';
import { useResolvedReportFields } from '@/hooks/useResolvedReportFields';

const QRY_DEFAULT_FIELDS = [
  { field_key: 'company',          default_label: 'Company',          default_sort: 10 },
  { field_key: 'ticket_number',    default_label: 'Ticket #',         default_sort: 20 },
  { field_key: 'kpi',              default_label: 'KPI',              default_sort: 30, is_required: true },
  { field_key: 'kra',              default_label: 'KRA',              default_sort: 40 },
  { field_key: 'employee',         default_label: 'Employee',         default_sort: 50 },
  { field_key: 'raised_by',        default_label: 'Raised By',        default_sort: 60 },
  { field_key: 'raised_to',        default_label: 'Raised To',        default_sort: 70 },
  { field_key: 'reason',           default_label: 'Reason',           default_sort: 80 },
  { field_key: 'status',           default_label: 'Status',           default_sort: 90 },
  { field_key: 'created_date',     default_label: 'Created Date',     default_sort: 100 },
  { field_key: 'days_open',        default_label: 'Days Open',        default_sort: 110 },
  { field_key: 'resolution_notes', default_label: 'Resolution Notes', default_sort: 120 },
] as const;
import { useToast } from '@/hooks/use-toast';

export default function QueryReport() {
  const { canDownload } = useReportAccess();
  const canExport = canDownload('queries');
  const { data: allKpis, isLoading: kpisLoading } = useAllKpis();
  const { data: profiles } = useProfiles();
  const kpiIds = useMemo(() => allKpis?.map(k => k.id) || [], [allKpis]);
  const { data: queries, isLoading: queriesLoading } = useKpiQueries(kpiIds);
  const { toast } = useToast();
  const resolvedFields = useResolvedReportFields('RPT-QRY-001', QRY_DEFAULT_FIELDS);

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { companies, selectedCompanyId, setSelectedCompanyId, filterByCompany, getCompanyCode } = useCompanyFilter();
  // Create lookup maps
  const profileMap = useMemo(() => {
    return new Map(profiles?.map(p => [p.id, p]) || []);
  }, [profiles]);

  const kpiMap = useMemo(() => {
    return new Map(allKpis?.map(k => [k.id, k]) || []);
  }, [allKpis]);

  // Filter and enrich queries
  const enrichedQueries = useMemo(() => {
    if (!queries) return [];

    return queries
      .filter(q => statusFilter === 'all' || q.status === statusFilter)
      .filter(q => {
        const kpi = kpiMap.get(q.kpi_id);
        return filterByCompany(kpi?.employee_id);
      })
      .map(q => {
        const kpi = kpiMap.get(q.kpi_id);
        const raisedBy = profileMap.get(q.raised_by);
        const raisedTo = profileMap.get(q.raised_to);
        const daysSinceCreated = differenceInDays(new Date(), new Date(q.created_at));
        const daysToResolve = q.resolved_at 
          ? differenceInDays(new Date(q.resolved_at), new Date(q.created_at))
          : null;

        return {
          ...q,
          kpiName: kpi?.kpi_name || 'Unknown',
          kraName: kpi?.kra_name || 'Unknown',
          employeeName: kpi?.profiles?.full_name || 'Unknown',
          raisedByName: raisedBy?.full_name || 'Unknown',
          raisedToName: raisedTo?.full_name || 'Unknown',
          daysSinceCreated,
          daysToResolve,
        };
      });
  }, [queries, statusFilter, kpiMap, profileMap, filterByCompany]);

  // Stats
  const stats = useMemo(() => {
    const total = queries?.length || 0;
    const open = queries?.filter(q => q.status === 'open').length || 0;
    const resolved = queries?.filter(q => q.status === 'resolved').length || 0;
    
    // Average resolution time
    const resolvedQueries = queries?.filter(q => q.resolved_at) || [];
    const totalResolutionDays = resolvedQueries.reduce((sum, q) => {
      return sum + differenceInDays(new Date(q.resolved_at!), new Date(q.created_at));
    }, 0);
    const avgResolutionTime = resolvedQueries.length > 0 
      ? Math.round(totalResolutionDays / resolvedQueries.length) 
      : 0;

    return { total, open, resolved, avgResolutionTime };
  }, [queries]);

  const handleExportExcel = useCallback(() => {
    if (enrichedQueries.length === 0) {
      toast({ title: 'No data to export', variant: 'destructive' });
      return;
    }
    const visible = resolvedFields.filter((f) => !f.is_hidden);
    const valueFor = (q: typeof enrichedQueries[number], key: string): string | number => {
      const kpi = kpiMap.get(q.kpi_id);
      switch (key) {
        case 'company':          return getCompanyCode(kpi?.employee_id || '');
        case 'ticket_number':    return (q as any).ticket_number || '';
        case 'kpi':              return q.kpiName;
        case 'kra':              return q.kraName;
        case 'employee':         return q.employeeName;
        case 'raised_by':        return q.raisedByName;
        case 'raised_to':        return q.raisedToName;
        case 'reason':           return q.reason;
        case 'status':           return q.status === 'open' ? 'Open' : 'Resolved';
        case 'created_date':     return format(new Date(q.created_at), 'dd MMM yyyy');
        case 'days_open':        return (q.status === 'open' ? q.daysSinceCreated : q.daysToResolve) ?? '';
        case 'resolution_notes': return q.resolution_notes || '';
        default: return '';
      }
    };
    const exportData = enrichedQueries.map((q) => {
      const row: Record<string, string | number> = {};
      for (const fld of visible) row[fld.label] = valueFor(q, fld.field_key);
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(exportData, { header: visible.map((f) => f.label) });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Queries');
    XLSX.writeFile(wb, `Query_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: 'Report downloaded successfully' });
  }, [enrichedQueries, toast, resolvedFields, kpiMap, getCompanyCode]);

  const isLoading = kpisLoading || queriesLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Query & Issues Report"
        description="Track all queries raised during the review process"
        backTo="/reports"
        actions={
          canExport ? (
            <Button variant="outline" onClick={handleExportExcel}>
              <Download className="h-4 w-4 mr-2" />
              Export Excel
            </Button>
          ) : undefined
        }
      />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Queries</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Open</CardTitle>
            <AlertTriangle className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-warning">{stats.open}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Resolved</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats.resolved}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Resolution Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.avgResolutionTime} days</div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <CompanyFilter companies={companies} selectedCompanyId={selectedCompanyId} onCompanyChange={setSelectedCompanyId} />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Queries</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Query Details</CardTitle>
          <CardDescription>{enrichedQueries.length} queries found</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                 <TableRow>
                   <TableHead className="w-24">Ticket #</TableHead>
                   <TableHead>KPI</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Raised By</TableHead>
                  <TableHead>Raised To</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrichedQueries.map(q => (
                  <TableRow key={q.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{(q as any).ticket_number || '—'}</TableCell>
                    <TableCell>
                      <div className="max-w-[200px]">
                        <div className="font-medium truncate">{q.kpiName}</div>
                        <div className="text-xs text-muted-foreground truncate">{q.kraName}</div>
                      </div>
                    </TableCell>
                    <TableCell>{q.employeeName}</TableCell>
                    <TableCell>{q.raisedByName}</TableCell>
                    <TableCell>{q.raisedToName}</TableCell>
                    <TableCell>
                      <div className="max-w-[200px] truncate" title={q.reason}>
                        {q.reason}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={q.status === 'open' ? 'destructive' : 'default'}>
                        {q.status === 'open' ? 'Open' : 'Resolved'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {q.status === 'open' ? (
                        <span className={q.daysSinceCreated > 7 ? 'text-destructive font-medium' : ''}>
                          {q.daysSinceCreated}d
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{q.daysToResolve}d</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(q.created_at), 'dd MMM yyyy')}
                    </TableCell>
                  </TableRow>
                ))}
                {enrichedQueries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No queries found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
