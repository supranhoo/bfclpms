import { useState, useMemo } from 'react';
import { useReportAccess } from '@/hooks/useReportAccess';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { CompanyFilter } from '@/components/reports/CompanyFilter';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Download, Search, ChevronLeft, ChevronRight, FileSpreadsheet, Clock, CheckCircle2, AlertCircle, Loader2, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { FrequencyLockToggle } from '@/components/ui/FrequencyLockToggle';
import { isKpiLockedForPeriod } from '@/lib/frequencyUtils';
import { useBulkEmployeeWorkflows } from '@/hooks/useWorkflowConfig';
import * as XLSX from 'xlsx';
import { differenceInDays } from 'date-fns';

const FULL_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const STATUS_LABELS: Record<string, string> = {
  kra_set: 'KRA Set',
  self_review: 'Self Review',
  manager_check: 'Manager Check',
  skip_level_check: 'Skip-Level Check',
  hr_pms_review: 'HR PMS Review',
  audit: 'Audit',
  management_review: 'Management Review',
  approved: 'Approved',
};

const PENDING_AT_MAP: Record<string, string> = {
  kra_set: 'Employee (KRA Not Issued)',
  self_review: 'Employee (Self Review)',
  manager_check: 'Manager',
  skip_level_check: 'Skip-Level Manager',
  hr_pms_review: 'HR PMS',
  audit: 'Auditor',
  management_review: 'Management',
  approved: '—',
};

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'approved') return 'default';
  if (status === 'kra_set') return 'destructive';
  return 'secondary';
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'approved': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    case 'manager_check':
    case 'skip_level_check':
    case 'hr_pms_review':
    case 'audit':
    case 'management_review':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    case 'self_review':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
    case 'kra_set':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    default:
      return '';
  }
}

interface StatusTrackerRow {
  kpiId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  designation: string;
  department: string;
  division: string;
  category: string;
  kraName: string;
  kpiName: string;
  weightage: number;
  frequency: string;
  status: string;
  statusLabel: string;
  pendingAt: string;
  daysPending: number;
  isOrgLevel: boolean;
  reviewPeriod: string;
  isFrequencyLocked: boolean;
  isOrphaned: boolean;
}

const PAGE_SIZE = 50;

export default function KpiStatusTracker() {
  const { canDownload } = useReportAccess();
  const canExport = canDownload('kpi-status-tracker');
  const currentYear = new Date().getFullYear();
  const currentMonthIdx = new Date().getMonth();

  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [selectedPeriod, setSelectedPeriod] = useState(FULL_MONTHS[currentMonthIdx]);
  const [selectedDept, setSelectedDept] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showFreqLocked, setShowFreqLocked] = useState(false);

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  // Main data fetch
  const { data: rows, isLoading } = useQuery({
    queryKey: ['kpi-status-tracker', selectedYear, selectedPeriod],
    queryFn: async () => {
      const year = parseInt(selectedYear);
      const allKpis: any[] = [];
      let offset = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        let q = supabase
          .from('kpis')
          .select(`
            id, employee_id, kra_name, kpi_name, weightage, frequency, status, updated_at,
            review_period, review_year, is_org_level, frequency_cycle_start,
            kra_categories ( name )
          `)
          .eq('review_year', year)
          .eq('review_period', selectedPeriod)
          .range(offset, offset + batchSize - 1);

        const { data: kpis, error } = await q;
        if (error) throw error;

        if (kpis && kpis.length > 0) {
          allKpis.push(...kpis);
          offset += batchSize;
          hasMore = kpis.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      // Fetch profiles with department + division chain
      const { data: profiles, error: profErr } = await supabase
        .from('profiles')
        .select('id, employee_code, full_name, designation, department_id, departments ( name, business_units ( divisions ( name ) ) )');
      if (profErr) throw profErr;

      const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));
      const now = new Date();

      const result: StatusTrackerRow[] = allKpis.map(kpi => {
        const profile = profileMap.get(kpi.employee_id);
        const status = kpi.status ?? 'kra_set';
        const deptData = profile?.departments as any;
        const division = deptData?.business_units?.divisions?.name ?? '—';

        const isFrequencyLocked = isKpiLockedForPeriod(kpi.frequency, selectedPeriod, year);

        return {
          kpiId: kpi.id,
          employeeId: kpi.employee_id,
          employeeCode: profile?.employee_code ?? '—',
          employeeName: profile?.full_name ?? 'Unknown',
          designation: profile?.designation ?? '—',
          department: deptData?.name ?? '—',
          division,
          category: (kpi.kra_categories as any)?.name ?? '—',
          kraName: kpi.kra_name ?? '—',
          kpiName: kpi.kpi_name ?? '—',
          weightage: kpi.weightage ?? 0,
          frequency: kpi.frequency ?? '—',
          status,
          statusLabel: STATUS_LABELS[status] ?? status,
          pendingAt: PENDING_AT_MAP[status] ?? '—',
          daysPending: kpi.updated_at ? differenceInDays(now, new Date(kpi.updated_at)) : 0,
          isOrgLevel: kpi.is_org_level ?? false,
          reviewPeriod: kpi.review_period ?? '—',
          isFrequencyLocked,
          isOrphaned: false, // will be set after workflow data loads
        };
      });

      // Sort by employee name, then KRA, then KPI
      result.sort((a, b) =>
        a.employeeName.localeCompare(b.employeeName) ||
        a.kraName.localeCompare(b.kraName) ||
        a.kpiName.localeCompare(b.kpiName)
      );

      return result;
    },
  });

  // Fetch bulk workflows for orphan detection
  const employeeIds = useMemo(() => {
    if (!rows) return [];
    const ids = new Set<string>();
    rows.forEach(r => ids.add(r.employeeId));
    return Array.from(ids);
  }, [rows]);

  const { data: workflowMap } = useBulkEmployeeWorkflows(
    employeeIds,
    selectedPeriod,
    parseInt(selectedYear)
  );

  // Enrich rows with orphan status
  const enrichedRows = useMemo(() => {
    if (!rows) return [];
    if (!workflowMap) return rows;
    return rows.map(r => {
      if (r.status === 'approved' || r.status === 'kra_set') return r;
      const stages = workflowMap.get(r.employeeId);
      if (!stages) return r;
      const isOrphaned = !stages.includes(r.status);
      return isOrphaned ? { ...r, isOrphaned: true } : r;
    });
  }, [rows, workflowMap]);

  // Derived department list
  const departments = useMemo(() => {
    if (!enrichedRows) return [];
    const s = new Set<string>();
    enrichedRows.forEach(r => { if (r.department !== '—') s.add(r.department); });
    return Array.from(s).sort();
  }, [enrichedRows]);

  // Client-side filtering
  const filteredRows = useMemo(() => {
    if (!enrichedRows) return [];
    const term = searchTerm.toLowerCase();
    return enrichedRows.filter(r => {
      if (!showFreqLocked && r.isFrequencyLocked) return false;
      if (selectedDept !== 'all' && r.department !== selectedDept) return false;
      if (selectedStatus !== 'all' && r.status !== selectedStatus) return false;
      if (term) {
        return (
          r.employeeName.toLowerCase().includes(term) ||
          r.employeeCode.toLowerCase().includes(term) ||
          r.kpiName.toLowerCase().includes(term) ||
          r.kraName.toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [enrichedRows, searchTerm, selectedDept, selectedStatus, showFreqLocked]);

  // Summary stats by status
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.keys(STATUS_LABELS).forEach(k => { counts[k] = 0; });
    filteredRows.forEach(r => {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
    });
    return counts;
  }, [filteredRows]);

  const approvedCount = statusCounts['approved'] ?? 0;
  const pendingCount = filteredRows.filter(r => r.status !== 'approved' && !r.isOrphaned).length;
  const orphanedCount = filteredRows.filter(r => r.isOrphaned).length;

  // Pagination
  const totalPages = Math.ceil(filteredRows.length / PAGE_SIZE);
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, currentPage]);

  // Reset page on filter change
  useMemo(() => { setCurrentPage(1); }, [searchTerm, selectedYear, selectedPeriod, selectedDept, selectedStatus, showFreqLocked]);

  // Excel export
  const handleExport = () => {
    if (!filteredRows.length) return;
    const exportData = filteredRows.map((r, i) => ({
      '#': i + 1,
      'Employee Code': r.employeeCode,
      'Employee Name': r.employeeName,
      'Designation': r.designation,
      'Department': r.department,
      'Division': r.division,
      'Category': r.category,
      'KRA': r.kraName,
      'KPI': r.kpiName,
      'Weightage': r.weightage,
      'Frequency': r.frequency,
      'Current Status': r.statusLabel,
      'Pending At Level': r.pendingAt,
      'Days in Stage': r.daysPending,
      'Org-Level': r.isOrgLevel ? 'Yes' : 'No',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = [
      { wch: 5 }, { wch: 14 }, { wch: 28 }, { wch: 20 }, { wch: 22 }, { wch: 20 },
      { wch: 20 }, { wch: 30 }, { wch: 35 }, { wch: 10 }, { wch: 14 }, { wch: 20 },
      { wch: 22 }, { wch: 12 }, { wch: 10 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'KPI Status Tracker');
    XLSX.writeFile(wb, `KPI_Status_Tracker_${selectedPeriod}_${selectedYear}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="KPI Status Tracker"
        description="Track the workflow status of every KPI for a selected month — see exactly where each record is pending."
        backTo="/reports"
        actions={
          canExport ? (
            <Button onClick={handleExport} disabled={!filteredRows.length}>
              <Download className="mr-2 h-4 w-4" />
              Export Excel
            </Button>
          ) : undefined
        }
      />

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Year</Label>
              <Select value={selectedYear} onValueChange={v => { setSelectedYear(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Month</Label>
              <Select value={selectedPeriod} onValueChange={v => { setSelectedPeriod(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FULL_MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Department</Label>
              <Select value={selectedDept} onValueChange={v => { setSelectedDept(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-44"><SelectValue placeholder="All Departments" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={selectedStatus} onValueChange={v => { setSelectedStatus(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-44"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 flex-1 min-w-[180px]">
              <Label className="text-xs text-muted-foreground">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Name, code, KRA, KPI…"
                  value={searchTerm}
                  onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="pl-8"
                />
              </div>
            </div>

            <FrequencyLockToggle
              checked={showFreqLocked}
              onCheckedChange={v => { setShowFreqLocked(v); setCurrentPage(1); }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
              <FileSpreadsheet className="h-3.5 w-3.5" /> Total KPIs
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <p className="text-2xl font-semibold tabular-nums">{filteredRows.length.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Approved
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <p className="text-2xl font-semibold tabular-nums text-green-600">{approvedCount.toLocaleString()}</p>
            {filteredRows.length > 0 && (
              <p className="text-xs text-muted-foreground">{((approvedCount / filteredRows.length) * 100).toFixed(1)}%</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-amber-500" /> Pending
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <p className="text-2xl font-semibold tabular-nums text-amber-600">{pendingCount.toLocaleString()}</p>
            {filteredRows.length > 0 && (
              <p className="text-xs text-muted-foreground">{((pendingCount / filteredRows.length) * 100).toFixed(1)}%</p>
            )}
          </CardContent>
        </Card>
        <Card className="col-span-2">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" /> By Stage
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(STATUS_LABELS).map(([key, label]) => {
                const count = statusCounts[key] ?? 0;
                if (count === 0) return null;
                return (
                  <Badge key={key} variant="outline" className={`text-xs ${statusBadgeClass(key)} border-0`}>
                    {label}: {count}
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>
        {orphanedCount > 0 && (
          <Card className="border-amber-300 dark:border-amber-700">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> Workflow Mismatch
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <p className="text-2xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">{orphanedCount}</p>
              <p className="text-xs text-muted-foreground">KPIs at a removed stage</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">No KPIs found</p>
              <p className="text-sm mt-1">Try adjusting your filters or selecting a different month.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 text-center">#</TableHead>
                      <TableHead className="min-w-[100px]">Code</TableHead>
                      <TableHead className="min-w-[160px]">Employee Name</TableHead>
                      <TableHead className="min-w-[120px]">Designation</TableHead>
                      <TableHead className="min-w-[140px]">Department</TableHead>
                      <TableHead className="min-w-[120px]">Division</TableHead>
                      <TableHead className="min-w-[120px]">Category</TableHead>
                      <TableHead className="min-w-[160px]">KRA</TableHead>
                      <TableHead className="min-w-[180px]">KPI</TableHead>
                      <TableHead className="w-20 text-center">Wt.</TableHead>
                      <TableHead className="min-w-[120px]">Frequency</TableHead>
                      <TableHead className="min-w-[140px]">Status</TableHead>
                      <TableHead className="min-w-[160px]">Pending At</TableHead>
                      <TableHead className="w-20 text-center">Days</TableHead>
                      <TableHead className="w-16 text-center">Org</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedRows.map((row, idx) => (
                      <TableRow key={row.kpiId}>
                        <TableCell className="text-center text-xs text-muted-foreground">
                          {(currentPage - 1) * PAGE_SIZE + idx + 1}
                        </TableCell>
                        <TableCell className="text-xs font-mono">{row.employeeCode}</TableCell>
                        <TableCell className="text-sm font-medium">{row.employeeName}</TableCell>
                        <TableCell className="text-xs">{row.designation}</TableCell>
                        <TableCell className="text-xs">{row.department}</TableCell>
                        <TableCell className="text-xs">{row.division}</TableCell>
                        <TableCell className="text-xs">{row.category}</TableCell>
                        <TableCell className="text-xs">{row.kraName}</TableCell>
                        <TableCell className="text-xs">{row.kpiName}</TableCell>
                        <TableCell className="text-center text-xs tabular-nums">{row.weightage}</TableCell>
                        <TableCell className="text-xs">{row.frequency}</TableCell>
                        <TableCell>
                          {row.isOrphaned ? (
                            <Badge variant="outline" className="text-xs border-0 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                              Orphaned
                            </Badge>
                          ) : row.isFrequencyLocked ? (
                            <Badge variant="outline" className="text-xs border-0 bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400">
                              Freq. Locked
                            </Badge>
                          ) : (
                            <Badge variant="outline" className={`text-xs border-0 ${statusBadgeClass(row.status)}`}>
                              {row.statusLabel}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-medium">
                          {row.isOrphaned ? (
                            <span className="text-amber-600 dark:text-amber-400 italic">Workflow mismatch</span>
                          ) : row.isFrequencyLocked ? (
                            <span className="text-muted-foreground italic">Not due</span>
                          ) : row.status === 'approved' ? (
                            <span className="text-green-600 dark:text-green-400">✓ Complete</span>
                          ) : (
                            <span className={row.daysPending >= 7 ? 'text-destructive' : row.daysPending >= 4 ? 'text-amber-600' : ''}>
                              {row.pendingAt}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {row.isOrphaned || row.isFrequencyLocked ? (
                            <span className="text-xs text-muted-foreground italic">N/A</span>
                          ) : row.status !== 'approved' ? (
                            <span className={`text-xs tabular-nums font-medium ${
                              row.daysPending >= 7 ? 'text-destructive' : row.daysPending >= 4 ? 'text-amber-600' : 'text-muted-foreground'
                            }`}>
                              {row.daysPending}d
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {row.isOrgLevel && (
                            <Badge variant="outline" className="text-xs px-1.5">Org</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <p className="text-sm text-muted-foreground">
                  Showing {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, filteredRows.length)} of {filteredRows.length.toLocaleString()} KPIs
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm tabular-nums">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
