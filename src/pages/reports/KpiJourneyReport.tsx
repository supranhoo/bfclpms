import { useState, useMemo, useCallback } from 'react';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { useReportAccess } from '@/hooks/useReportAccess';
import { useKpiJourneyReport, fetchKpiJourneyExportData, KpiJourneyFilters, SendBackEntry } from '@/hooks/useKpiJourneyReport';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Download, Search, ChevronLeft, ChevronRight, FileSpreadsheet, Clock, CheckCircle2, AlertCircle, Timer, Loader2, MinusCircle, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useResolvedReportFields } from '@/hooks/useResolvedReportFields';

const KJN_DEFAULT_FIELDS = [
  { field_key: 'company',            default_label: 'Company',             default_sort: 10 },
  { field_key: 'employee_code',      default_label: 'Emp Code',            default_sort: 20, is_required: true },
  { field_key: 'employee_name',      default_label: 'Employee',            default_sort: 30, is_required: true },
  { field_key: 'department',         default_label: 'Department',          default_sort: 40 },
  { field_key: 'reporting_manager',  default_label: 'Reporting Manager',   default_sort: 50 },
  { field_key: 'category',           default_label: 'Category',            default_sort: 60 },
  { field_key: 'kra',                default_label: 'KRA',                 default_sort: 70 },
  { field_key: 'kpi',                default_label: 'KPI',                 default_sort: 80, is_required: true },
  { field_key: 'frequency',          default_label: 'Frequency',           default_sort: 90 },
  { field_key: 'workflow_chain',     default_label: 'Assigned Workflow',   default_sort: 100 },
  { field_key: 'review_period',      default_label: 'Month',               default_sort: 110 },
  { field_key: 'kra_assigned_at',    default_label: 'KRA Assigned',        default_sort: 120 },
  { field_key: 'self_submitted_at',  default_label: 'Self Submitted',      default_sort: 130 },
  { field_key: 'manager_action_at',  default_label: 'Manager Action',      default_sort: 140 },
  { field_key: 'skip_level_at',      default_label: 'Skip-Level',          default_sort: 150 },
  { field_key: 'hr_pms_at',          default_label: 'HR PMS',              default_sort: 160 },
  { field_key: 'auditor_at',         default_label: 'Auditor',             default_sort: 170 },
  { field_key: 'management_at',      default_label: 'Management',          default_sort: 180 },
  { field_key: 'final_approved_at',  default_label: 'Final Approved',      default_sort: 190 },
  { field_key: 'total_days',         default_label: 'Total Days',          default_sort: 200 },
  { field_key: 'status',             default_label: 'Status',              default_sort: 210 },
  { field_key: 'timeline_compliant', default_label: 'Timeline Compliant',  default_sort: 220 },
  { field_key: 'type',               default_label: 'Type',                default_sort: 230 },
  { field_key: 'send_back_count',    default_label: 'Send-Back Count',     default_sort: 240 },
  { field_key: 'send_back_history',  default_label: 'Send-Back History',   default_sort: 250 },
] as const;

const FULL_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const STATUS_LABELS: Record<string, string> = {
  kra_set: 'KRA Set',
  self_review: 'Self Review',
  manager_check: 'Manager Check',
  skip_level_check: 'Skip-Level',
  hr_pms_review: 'HR PMS',
  audit: 'Audit',
  management_review: 'Mgmt Review',
  approved: 'Approved',
};

const PAGE_SIZE = 50;

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    return format(new Date(dateStr), 'dd MMM yy HH:mm');
  } catch {
    return '—';
  }
}

function DurationBadge({ days, isApproved }: { days: number; isApproved: boolean }) {
  let color = 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
  if (days > 30) color = 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
  else if (days > 15) color = 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';

  return (
    <Badge variant="outline" className={`${color} font-mono text-xs`}>
      {days}d {!isApproved && <span className="opacity-60">(ongoing)</span>}
    </Badge>
  );
}

export default function KpiJourneyReport() {
  const { canDownload } = useReportAccess();
  const { getCompanyCodeByEmpCode } = useCompanyFilter();
  const canExport = canDownload('kpi-journey');
  const currentYear = new Date().getFullYear();
  const currentMonthIdx = new Date().getMonth();

  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [selectedPeriod, setSelectedPeriod] = useState(FULL_MONTHS[currentMonthIdx]);
  const [selectedDept, setSelectedDept] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const resolvedFields = useResolvedReportFields('RPT-KJN-001', KJN_DEFAULT_FIELDS);

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  const filters: KpiJourneyFilters = useMemo(() => ({
    department: selectedDept,
    status: selectedStatus,
    type: selectedType,
    search: searchTerm,
  }), [selectedDept, selectedStatus, selectedType, searchTerm]);

  const { data, isLoading } = useKpiJourneyReport(selectedPeriod, selectedYear, currentPage, filters);

  const rows = data?.rows ?? [];
  const totalCount = data?.totalCount ?? 0;
  const summary = data?.summary ?? { total: 0, pending: 0, avgToSelf: 0, avgToFinal: 0, totalSendBacks: 0 };

  // Fetch departments for filter dropdown
  const { data: departments } = useQuery({
    queryKey: ['kpi-journey-departments', selectedYear, selectedPeriod],
    queryFn: async () => {
      // Fetch departments in batches to avoid 1000-row truncation
      const names = new Set<string>();
      let offset = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data } = await supabase
          .from('kpis')
          .select('employee_id, profiles!inner(department_id, departments(name))')
          .eq('review_year', parseInt(selectedYear))
          .eq('review_period', selectedPeriod)
          .range(offset, offset + batchSize - 1);
        if (!data || data.length === 0) break;
        for (const k of data) {
          const dept = (k as any).profiles?.departments?.name;
          if (dept) names.add(dept);
        }
        hasMore = data.length === batchSize;
        offset += batchSize;
      }
      return [...names].sort();
    },
    enabled: !!selectedPeriod && !!selectedYear,
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const handleExport = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const [XLSX, allRows] = await Promise.all([
        import('xlsx'),
        fetchKpiJourneyExportData(selectedPeriod, selectedYear, filters),
      ]);

      const fmtCell = (dateStr: string | null, isNa: boolean) => {
        if (isNa && !dateStr) return 'N/A';
        return dateStr ? format(new Date(dateStr), 'dd-MMM-yyyy HH:mm') : '';
      };

      const visible = resolvedFields.filter(fld => !fld.is_hidden);
      const valueFor = (r: any, key: string): unknown => {
        switch (key) {
          case 'company':            return getCompanyCodeByEmpCode(r.employeeCode);
          case 'employee_code':      return r.employeeCode;
          case 'employee_name':      return r.employeeName;
          case 'department':         return r.department;
          case 'reporting_manager':  return r.reportingManager;
          case 'category':           return r.category;
          case 'kra':                return r.kraName;
          case 'kpi':                return r.kpiName;
          case 'frequency':          return r.frequency;
          case 'workflow_chain':     return r.workflowChain || '—';
          case 'review_period':      return r.reviewPeriod;
          case 'kra_assigned_at':    return r.kraAssignedAt ? format(new Date(r.kraAssignedAt), 'dd-MMM-yyyy HH:mm') : '';
          case 'self_submitted_at':  return fmtCell(r.selfSubmittedAt, r.isNa);
          case 'manager_action_at':  return fmtCell(r.managerActionAt, r.isNa);
          case 'skip_level_at':      return fmtCell(r.skipLevelAt, r.isNa);
          case 'hr_pms_at':          return fmtCell(r.hrPmsAt, r.isNa);
          case 'auditor_at':         return fmtCell(r.auditorAt, r.isNa);
          case 'management_at':      return fmtCell(r.managementAt, r.isNa);
          case 'final_approved_at':  return fmtCell(r.finalApprovedAt, r.isNa);
          case 'total_days':         return r.isNa ? 'N/A' : r.totalDays;
          case 'status':             return r.isNa ? 'N/A' : (STATUS_LABELS[r.status] ?? r.status);
          case 'timeline_compliant': return r.isCompliant ? 'Yes' : 'No';
          case 'type':               return r.isOrgKpi ? 'Org KPI' : 'Individual';
          case 'send_back_count':    return r.sendBackCount ?? 0;
          case 'send_back_history':  return (r.sendBacks ?? []).map((sb: any) => {
            const d = sb.date ? format(new Date(sb.date), 'dd-MMM-yyyy') : '';
            return `${d} by ${sb.raisedBy}: ${sb.reason}`;
          }).join('; ');
          default: return '';
        }
      };
      const exportData = allRows.map(r => {
        const out: Record<string, unknown> = {};
        for (const fld of visible) out[fld.label] = valueFor(r, fld.field_key);
        return out;
      });
      const ws = XLSX.utils.json_to_sheet(exportData, { header: visible.map(fld => fld.label) });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'KPI Journey');
      XLSX.writeFile(wb, `KPI_Journey_${selectedPeriod}_${selectedYear}.xlsx`);
      toast.success('Export completed');
    } catch (err) {
      console.error('Export failed:', err);
      toast.error('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [selectedPeriod, selectedYear, filters, isExporting, resolvedFields, getCompanyCodeByEmpCode]);

  const resetPage = useCallback(() => setCurrentPage(1), []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="KPI Journey Timeline"
        description="Track the complete lifecycle and timeline compliance of every KPI"
        backTo="/reports"
      />

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Year</Label>
              <Select value={selectedYear} onValueChange={v => { setSelectedYear(v); resetPage(); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Period</Label>
              <Select value={selectedPeriod} onValueChange={v => { setSelectedPeriod(v); resetPage(); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FULL_MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Department</Label>
              <Select value={selectedDept} onValueChange={v => { setSelectedDept(v); resetPage(); }}>
                <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {(departments ?? []).map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={selectedStatus} onValueChange={v => { setSelectedStatus(v); resetPage(); }}>
                <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="na">N/A</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={selectedType} onValueChange={v => { setSelectedType(v); resetPage(); }}>
                <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="org">Org KPI</SelectItem>
                  <SelectItem value="individual">Individual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Search</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Name, code, KPI..."
                  value={searchTerm}
                  onChange={e => { setSearchTerm(e.target.value); resetPage(); }}
                  className="pl-8"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total KPIs</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <span className="text-2xl font-bold">{isLoading ? <Skeleton className="h-7 w-12" /> : summary.total}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Avg Days to Self Review</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-500" />
              <span className="text-2xl font-bold">{isLoading ? <Skeleton className="h-7 w-12" /> : `${summary.avgToSelf}d`}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Avg Days to Final</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Timer className="h-5 w-5 text-green-500" />
              <span className="text-2xl font-bold">{isLoading ? <Skeleton className="h-7 w-12" /> : `${summary.avgToFinal}d`}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Still Pending</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              <span className="text-2xl font-bold">{isLoading ? <Skeleton className="h-7 w-12" /> : summary.pending}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Send-Backs</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-red-500" />
              <span className="text-2xl font-bold">{isLoading ? <Skeleton className="h-7 w-12" /> : summary.totalSendBacks}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Export */}
      {canExport && totalCount > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting}>
            {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            {isExporting ? 'Exporting...' : 'Export Excel'}
          </Button>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">No KPIs found for this period.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background z-10 min-w-[80px]">Emp Code</TableHead>
                    <TableHead className="sticky left-[80px] bg-background z-10 min-w-[140px]">Employee</TableHead>
                     <TableHead className="min-w-[100px]">Dept</TableHead>
                     <TableHead className="min-w-[140px]">Reporting Manager</TableHead>
                     <TableHead className="min-w-[100px]">Category</TableHead>
                    <TableHead className="min-w-[120px]">KRA</TableHead>
                     <TableHead className="min-w-[120px]">KPI</TableHead>
                     <TableHead className="min-w-[100px]">Frequency</TableHead>
                     <TableHead className="min-w-[80px]">Type</TableHead>
                    <TableHead className="min-w-[130px]">KRA Assigned</TableHead>
                    <TableHead className="min-w-[130px]">Self Submitted</TableHead>
                    <TableHead className="min-w-[130px]">Manager</TableHead>
                    <TableHead className="min-w-[130px]">Skip-Level</TableHead>
                    <TableHead className="min-w-[130px]">HR PMS</TableHead>
                    <TableHead className="min-w-[130px]">Auditor</TableHead>
                    <TableHead className="min-w-[130px]">Management</TableHead>
                    <TableHead className="min-w-[130px]">Final</TableHead>
                    <TableHead className="min-w-[90px]">Total Days</TableHead>
                    <TableHead className="min-w-[100px]">Status</TableHead>
                    <TableHead className="min-w-[90px]">Send-Backs</TableHead>
                    <TableHead className="min-w-[60px] text-center">✓</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(row => (
                    <TableRow key={row.kpiId}>
                      <TableCell className="sticky left-0 bg-background z-10 font-mono text-xs">{row.employeeCode}</TableCell>
                      <TableCell className="sticky left-[80px] bg-background z-10 font-medium text-sm">{row.employeeName}</TableCell>
                       <TableCell className="text-xs">{row.department}</TableCell>
                       <TableCell className="text-xs">{row.reportingManager}</TableCell>
                       <TableCell className="text-xs">{row.category}</TableCell>
                      <TableCell className="text-xs">{row.kraName}</TableCell>
                       <TableCell className="text-xs">{row.kpiName}</TableCell>
                       <TableCell className="text-xs">{row.frequency}</TableCell>
                       <TableCell>
                        <Badge variant="outline" className={`text-xs ${row.isOrgKpi
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                          : 'bg-muted text-muted-foreground'
                        }`}>
                          {row.isOrgKpi ? 'Org' : 'Individual'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono">{formatDate(row.kraAssignedAt)}</TableCell>
                      <TableCell className="text-xs font-mono">{formatDate(row.selfSubmittedAt)}</TableCell>
                      <TableCell className="text-xs font-mono">{formatDate(row.managerActionAt)}</TableCell>
                      <TableCell className="text-xs font-mono">{formatDate(row.skipLevelAt)}</TableCell>
                      <TableCell className="text-xs font-mono">{formatDate(row.hrPmsAt)}</TableCell>
                      <TableCell className="text-xs font-mono">{formatDate(row.auditorAt)}</TableCell>
                      <TableCell className="text-xs font-mono">{formatDate(row.managementAt)}</TableCell>
                      <TableCell className="text-xs font-mono">{formatDate(row.finalApprovedAt)}</TableCell>
                      <TableCell>
                        {row.isNa ? (
                          <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 font-mono text-xs">N/A</Badge>
                        ) : (
                          <DurationBadge days={row.totalDays} isApproved={row.status === 'approved'} />
                        )}
                      </TableCell>
                      <TableCell>
                        {row.isNa ? (
                          <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-xs">N/A</Badge>
                        ) : (
                          <Badge variant="outline" className={`text-xs ${row.status === 'approved'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                          }`}>
                            {STATUS_LABELS[row.status] ?? row.status}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.sendBackCount === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button className="cursor-pointer">
                                <Badge variant="outline" className={`text-xs font-mono ${
                                  row.sendBackCount >= 2
                                    ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                                }`}>
                                  {row.sendBackCount}×
                                </Badge>
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80 max-h-60 overflow-y-auto" align="start">
                              <div className="space-y-3">
                                <h4 className="font-semibold text-sm">Send-Back History</h4>
                                {(row.sendBacks ?? []).map((sb: SendBackEntry, idx: number) => (
                                  <div key={idx} className="border-l-2 border-amber-400 pl-3 text-xs space-y-0.5">
                                    <div className="font-medium">{sb.raisedBy}</div>
                                    <div className="text-muted-foreground">{formatDate(sb.date)}</div>
                                    <div className="text-foreground/80">{sb.reason}</div>
                                  </div>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {row.isNa ? (
                          <MinusCircle className="h-4 w-4 text-muted-foreground mx-auto" />
                        ) : row.isCompliant ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-red-500 mx-auto" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">Page {currentPage} of {totalPages}</span>
            <Button variant="outline" size="icon" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
