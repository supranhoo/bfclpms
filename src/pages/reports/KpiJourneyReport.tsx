import { useState, useMemo } from 'react';
import { useReportAccess } from '@/hooks/useReportAccess';
import { useKpiJourneyReport, KpiJourneyRow } from '@/hooks/useKpiJourneyReport';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, Search, ChevronLeft, ChevronRight, FileSpreadsheet, Clock, CheckCircle2, AlertCircle, Timer, Loader2, MinusCircle } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

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

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  const { data: rows, isLoading } = useKpiJourneyReport(selectedPeriod, selectedYear);

  const departments = useMemo(() => {
    if (!rows) return [];
    return [...new Set(rows.map(r => r.department))].filter(d => d !== '—').sort();
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    let result = rows;

    if (selectedDept !== 'all') result = result.filter(r => r.department === selectedDept);
    if (selectedStatus === 'na') result = result.filter(r => r.isNa);
    else if (selectedStatus !== 'all') result = result.filter(r => !r.isNa && r.status === selectedStatus);
    if (selectedType === 'org') result = result.filter(r => r.isOrgKpi);
    if (selectedType === 'individual') result = result.filter(r => !r.isOrgKpi);
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(r =>
        r.employeeName.toLowerCase().includes(q) ||
        r.employeeCode.toLowerCase().includes(q) ||
        r.kpiName.toLowerCase().includes(q) ||
        r.kraName.toLowerCase().includes(q)
      );
    }

    return result;
  }, [rows, selectedDept, selectedStatus, selectedType, searchTerm]);

  // Summary stats
  const stats = useMemo(() => {
    if (!filtered.length) return { total: 0, avgToSelf: 0, avgToFinal: 0, pending: 0 };

    const applicable = filtered.filter(r => !r.isNa);
    const withSelf = applicable.filter(r => r.kraAssignedAt && r.selfSubmittedAt);
    const withFinal = applicable.filter(r => r.finalApprovedAt);
    const pending = applicable.filter(r => r.status !== 'approved').length;

    const avgToSelf = withSelf.length > 0
      ? Math.round(withSelf.reduce((sum, r) => {
          const d = Math.max(0, Math.round((new Date(r.selfSubmittedAt!).getTime() - new Date(r.kraAssignedAt!).getTime()) / 86400000));
          return sum + d;
        }, 0) / withSelf.length)
      : 0;

    const avgToFinal = withFinal.length > 0
      ? Math.round(withFinal.reduce((sum, r) => sum + r.totalDays, 0) / withFinal.length)
      : 0;

    return { total: filtered.length, avgToSelf, avgToFinal, pending };
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleExport = () => {
    if (!filtered.length) return;
    const fmtCell = (dateStr: string | null, isNa: boolean) => {
      if (isNa && !dateStr) return 'N/A';
      return dateStr ? format(new Date(dateStr), 'dd-MMM-yyyy HH:mm') : '';
    };
    const exportData = filtered.map(r => ({
      'Emp Code': r.employeeCode,
      'Employee': r.employeeName,
      'Department': r.department,
      'Category': r.category,
      'KRA': r.kraName,
      'KPI': r.kpiName,
      'Month': r.reviewPeriod,
      'KRA Assigned': r.kraAssignedAt ? format(new Date(r.kraAssignedAt), 'dd-MMM-yyyy HH:mm') : '',
      'Self Submitted': fmtCell(r.selfSubmittedAt, r.isNa),
      'Manager Action': fmtCell(r.managerActionAt, r.isNa),
      'Skip-Level': fmtCell(r.skipLevelAt, r.isNa),
      'HR PMS': fmtCell(r.hrPmsAt, r.isNa),
      'Auditor': fmtCell(r.auditorAt, r.isNa),
      'Management': fmtCell(r.managementAt, r.isNa),
      'Final Approved': fmtCell(r.finalApprovedAt, r.isNa),
      'Total Days': r.isNa ? 'N/A' : r.totalDays,
      'Status': r.isNa ? 'N/A' : (STATUS_LABELS[r.status] ?? r.status),
      'Timeline Compliant': r.isCompliant ? 'Yes' : 'No',
      'Type': r.isOrgKpi ? 'Org KPI' : 'Individual',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'KPI Journey');
    XLSX.writeFile(wb, `KPI_Journey_${selectedPeriod}_${selectedYear}.xlsx`);
  };

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
              <Select value={selectedYear} onValueChange={v => { setSelectedYear(v); setCurrentPage(1); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Period</Label>
              <Select value={selectedPeriod} onValueChange={v => { setSelectedPeriod(v); setCurrentPage(1); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FULL_MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Department</Label>
              <Select value={selectedDept} onValueChange={v => { setSelectedDept(v); setCurrentPage(1); }}>
                <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={selectedStatus} onValueChange={v => { setSelectedStatus(v); setCurrentPage(1); }}>
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
              <Select value={selectedType} onValueChange={v => { setSelectedType(v); setCurrentPage(1); }}>
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
                  onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="pl-8"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total KPIs</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <span className="text-2xl font-bold">{isLoading ? <Skeleton className="h-7 w-12" /> : stats.total}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Avg Days to Self Review</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-500" />
              <span className="text-2xl font-bold">{isLoading ? <Skeleton className="h-7 w-12" /> : `${stats.avgToSelf}d`}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Avg Days to Final</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Timer className="h-5 w-5 text-green-500" />
              <span className="text-2xl font-bold">{isLoading ? <Skeleton className="h-7 w-12" /> : `${stats.avgToFinal}d`}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Still Pending</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              <span className="text-2xl font-bold">{isLoading ? <Skeleton className="h-7 w-12" /> : stats.pending}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Export */}
      {canExport && filtered.length > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" /> Export Excel
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
          ) : paged.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">No KPIs found for this period.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background z-10 min-w-[80px]">Emp Code</TableHead>
                    <TableHead className="sticky left-[80px] bg-background z-10 min-w-[140px]">Employee</TableHead>
                    <TableHead className="min-w-[100px]">Dept</TableHead>
                    <TableHead className="min-w-[100px]">Category</TableHead>
                    <TableHead className="min-w-[120px]">KRA</TableHead>
                    <TableHead className="min-w-[120px]">KPI</TableHead>
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
                    <TableHead className="min-w-[60px] text-center">✓</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map(row => (
                    <TableRow key={row.kpiId}>
                      <TableCell className="sticky left-0 bg-background z-10 font-mono text-xs">{row.employeeCode}</TableCell>
                      <TableCell className="sticky left-[80px] bg-background z-10 font-medium text-sm">{row.employeeName}</TableCell>
                      <TableCell className="text-xs">{row.department}</TableCell>
                      <TableCell className="text-xs">{row.category}</TableCell>
                      <TableCell className="text-xs">{row.kraName}</TableCell>
                      <TableCell className="text-xs">{row.kpiName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${row.isOrgKpi
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                          : 'bg-muted text-muted-foreground'
                        }`}>
                          {row.isOrgKpi ? 'Org' : 'Individual'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono">{formatDate(row.kraAssignedAt)}</TableCell>
                      <TableCell className="text-xs font-mono">{formatDateOrNa(row.selfSubmittedAt, row.isNa)}</TableCell>
                      <TableCell className="text-xs font-mono">{formatDateOrNa(row.managerActionAt, row.isNa)}</TableCell>
                      <TableCell className="text-xs font-mono">{formatDateOrNa(row.skipLevelAt, row.isNa)}</TableCell>
                      <TableCell className="text-xs font-mono">{formatDateOrNa(row.hrPmsAt, row.isNa)}</TableCell>
                      <TableCell className="text-xs font-mono">{formatDateOrNa(row.auditorAt, row.isNa)}</TableCell>
                      <TableCell className="text-xs font-mono">{formatDateOrNa(row.managementAt, row.isNa)}</TableCell>
                      <TableCell className="text-xs font-mono">{formatDateOrNa(row.finalApprovedAt, row.isNa)}</TableCell>
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
            Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
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
