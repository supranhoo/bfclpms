import { useState, useMemo, useEffect } from 'react';
import { useReportAccess } from '@/hooks/useReportAccess';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPaged } from '@/lib/fetchAll';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { CompanyFilter } from '@/components/reports/CompanyFilter';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Search, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown, RefreshCw, Info, AlertCircle, ShieldAlert } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import * as XLSX from 'xlsx';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { enumeratePeriods, validateRange, MAX_RANGE_MONTHS } from '@/lib/kpiScorecardRange';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const PAGE_SIZES = [50, 100, 200, 500];

interface FlatRow {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  designation: string;
  department: string;
  month: string;
  category: string;
  kraName: string;
  kpiName: string;
  frequency: string;
  isOrgKpi: boolean;
  orgKpiScope: string;
  dataOwnerNames: string;
  weightage: number;
  targetValue: number | null;
  selfActual: number | null;
  managerActual: number | null;
  skipLevelActual: number | null;
  hrPmsActual: number | null;
  auditorActual: number | null;
  managementActual: number | null;
  selfScore: number | null;
  managerScore: number | null;
  skipLevelScore: number | null;
  hrPmsScore: number | null;
  auditorScore: number | null;
  managementScore: number | null;
  finalScore: number | null;
  status: string;
  isNa: boolean;
}

type SortField = keyof FlatRow;
type SortDir = 'asc' | 'desc';

function ScoreCell({ score, isNa }: { score: number | null; isNa: boolean }) {
  if (isNa) return <Badge variant="secondary" className="text-xs px-1 py-0">N/A</Badge>;
  if (score === null) return <span className="text-muted-foreground text-xs">—</span>;
  return <span className="tabular-nums text-xs">{score}</span>;
}

const statusColors: Record<string, string> = {
  approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  kra_set: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  self_review: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  manager_check: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  skip_level_check: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  hr_pms_review: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
  audit: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  management_review: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
};

const statusLabels: Record<string, string> = {
  approved: 'Approved',
  kra_set: 'KRA Set',
  self_review: 'Self Review',
  manager_check: 'Manager',
  skip_level_check: 'Skip-Level',
  hr_pms_review: 'HR PMS',
  audit: 'Audit',
  management_review: 'Management',
};

/**
 * Fetch + flatten KPI scorecard rows for a single (month, year) period.
 * Shared between the on-screen React Query hook and the range exporter
 * so behavior stays in lock-step.
 */
async function fetchScorecardForPeriod(month: string, year: number): Promise<FlatRow[]> {
  const allKpis: any[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('kpis')
      .select(`
        id, employee_id, kra_name, kpi_name, weightage, target_value, review_period, review_year, status,
        frequency, is_org_level, org_level_scope, category_id,
        kra_categories ( name )
      `)
      .eq('review_period', month)
      .eq('review_year', year)
      .range(offset, offset + 999);
    if (error) throw error;
    if (data && data.length > 0) {
      allKpis.push(...data);
      offset += 1000;
      hasMore = data.length === 1000;
    } else {
      hasMore = false;
    }
  }

  const submissionMap = new Map<string, any>();
  const kpiIds = allKpis.map(k => k.id);
  const CHUNK = 500;
  for (let i = 0; i < kpiIds.length; i += CHUNK) {
    const batch = kpiIds.slice(i, i + CHUNK);
    const { data: subs, error: subErr } = await supabase
      .from('review_submissions')
      .select('kpi_id, self_score, manager_score, skip_level_score, hr_pms_score, auditor_score, management_score, final_score, is_na, achieved_value, manager_achieved_value, skip_level_achieved_value, hr_pms_achieved_value, auditor_achieved_value, management_achieved_value')
      .in('kpi_id', batch);
    if (subErr) throw subErr;
    (subs ?? []).forEach((s: any) => submissionMap.set(s.kpi_id, s));
  }

  const profiles = await fetchAllPaged<any>((from, to) =>
    supabase
      .from('profiles')
      .select('id, employee_code, full_name, designation, departments ( name )')
      .range(from, to)
  );

  let ownerMap = new Map<string, string[]>();
  try {
    const dataOwners = await fetchAllPaged<any>((from, to) =>
      supabase
        .from('org_kpi_data_owners')
        .select('category_id, kra_name, kpi_name, owner:profiles!org_kpi_data_owners_owner_id_fkey(full_name)')
        .range(from, to)
    );
    (dataOwners ?? []).forEach((o: any) => {
      const key = `${o.category_id}||${o.kra_name}||${o.kpi_name}`;
      const name = o.owner?.full_name ?? '';
      if (!ownerMap.has(key)) ownerMap.set(key, []);
      if (name) ownerMap.get(key)!.push(name);
    });
  } catch { /* non-critical */ }

  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));

  return allKpis.map((kpi): FlatRow => {
    const profile = profileMap.get(kpi.employee_id);
    const sub = submissionMap.get(kpi.id);
    const isNa = sub?.is_na ?? false;
    const dept = profile?.departments;
    const isOrgKpi = kpi.is_org_level === true;
    const ownerKey = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}`;
    const owners = isOrgKpi ? (ownerMap.get(ownerKey) ?? []) : [];
    return {
      employeeId: kpi.employee_id ?? '',
      employeeCode: profile?.employee_code ?? '',
      employeeName: profile?.full_name ?? '',
      designation: profile?.designation ?? '',
      department: (dept && typeof dept === 'object' && 'name' in dept ? (dept as any).name : '') ?? '',
      month: kpi.review_period,
      category: (kpi.kra_categories && typeof kpi.kra_categories === 'object' && 'name' in kpi.kra_categories ? (kpi.kra_categories as any).name : '') ?? '',
      kraName: kpi.kra_name ?? '',
      kpiName: kpi.kpi_name ?? '',
      frequency: kpi.frequency ?? 'Monthly',
      isOrgKpi,
      orgKpiScope: isOrgKpi ? (kpi.org_level_scope ?? 'organization') : '',
      dataOwnerNames: owners.join(', '),
      weightage: kpi.weightage ?? 0,
      targetValue: kpi.target_value ?? null,
      selfActual: sub?.achieved_value ?? null,
      managerActual: sub?.manager_achieved_value ?? null,
      skipLevelActual: sub?.skip_level_achieved_value ?? null,
      hrPmsActual: sub?.hr_pms_achieved_value ?? null,
      auditorActual: sub?.auditor_achieved_value ?? null,
      managementActual: sub?.management_achieved_value ?? null,
      selfScore: isNa ? null : (sub?.self_score ?? null),
      managerScore: isNa ? null : (sub?.manager_score ?? null),
      skipLevelScore: isNa ? null : (sub?.skip_level_score ?? null),
      hrPmsScore: isNa ? null : (sub?.hr_pms_score ?? null),
      auditorScore: isNa ? null : (sub?.auditor_score ?? null),
      managementScore: isNa ? null : (sub?.management_score ?? null),
      finalScore: isNa ? null : (sub?.final_score ?? null),
      status: kpi.status ?? '',
      isNa,
    };
  });
}

export default function KpiScorecardDetail() {
  const { canDownload } = useReportAccess();
  const canExport = canDownload('kpi-scorecard-detail');
  const { effectiveRole } = useAuth();
  const { toast } = useToast();
  const ORG_WIDE_ROLES: Array<string> = ['admin', 'management', 'hr_pms', 'auditor'];
  const hasOrgWideAccess = effectiveRole ? ORG_WIDE_ROLES.includes(effectiveRole) : false;
  const { companies, selectedCompanyId, setSelectedCompanyId, filterByCompany, getCompanyName, getCompanyCode } = useCompanyFilter();
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[now.getMonth()]);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedDept, setSelectedDept] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [sortField, setSortField] = useState<SortField>('employeeName');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Range export state
  const [rangeFromMonth, setRangeFromMonth] = useState(MONTHS[now.getMonth()]);
  const [rangeFromYear, setRangeFromYear] = useState(now.getFullYear());
  const [rangeToMonth, setRangeToMonth] = useState(MONTHS[now.getMonth()]);
  const [rangeToYear, setRangeToYear] = useState(now.getFullYear());
  const [rangeExporting, setRangeExporting] = useState(false);
  const [rangePopoverOpen, setRangePopoverOpen] = useState(false);

  const years = [selectedYear - 1, selectedYear, selectedYear + 1];

  // Click-to-load: heavy fetch only fires when user clicks "Load Data".
  // appliedQuery holds the period actually fetched; controlled selects don't trigger queries.
  const [appliedQuery, setAppliedQuery] = useState<{ month: string; year: number } | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  const isDirty = !appliedQuery || appliedQuery.month !== selectedMonth || appliedQuery.year !== selectedYear;

  const { data: rows, isLoading, isFetching, error, isError } = useQuery({
    queryKey: ['kpi-scorecard-detail', appliedQuery?.month, appliedQuery?.year],
    enabled: !!appliedQuery,
    queryFn: () => fetchScorecardForPeriod(appliedQuery!.month, appliedQuery!.year),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  // Track last successful load time
  useEffect(() => {
    if (rows && !isFetching) setLastLoadedAt(new Date());
  }, [rows, isFetching]);

  const handleLoadData = () => {
    setAppliedQuery({ month: selectedMonth, year: selectedYear });
    setCurrentPage(1);
  };

  // Departments for filter
  const departments = useMemo(() => {
    if (!rows) return [];
    const companyFiltered = rows.filter(r => filterByCompany(r.employeeId));
    return [...new Set(companyFiltered.map(r => r.department).filter(Boolean))].sort();
  }, [rows, filterByCompany]);

  // Filter + sort
  const filtered = useMemo(() => {
    if (!rows) return [];
    let result = rows;
    // Company filter
    result = result.filter(r => filterByCompany(r.employeeId));
    if (selectedDept !== 'all') result = result.filter(r => r.department === selectedDept);
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      result = result.filter(r =>
        r.employeeName.toLowerCase().includes(s) ||
        r.employeeCode.toLowerCase().includes(s) ||
        r.kpiName.toLowerCase().includes(s) ||
        r.kraName.toLowerCase().includes(s)
      );
    }
    // Sort
    result = [...result].sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [rows, selectedDept, searchTerm, sortField, sortDir, filterByCompany]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
    setCurrentPage(1);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 text-muted-foreground inline" />;
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 ml-1 inline" />
      : <ArrowDown className="h-3 w-3 ml-1 inline" />;
  };

  const getOrgTypeLabel = (row: FlatRow) => {
    if (!row.isOrgKpi) return 'Individual';
    const scopeLabels: Record<string, string> = {
      organization: 'Org (Organization)',
      department: 'Org (Department)',
      employee: 'Org (Employee)',
    };
    return scopeLabels[row.orgKpiScope] ?? 'Org';
  };

  const orgTypeColors: Record<string, string> = {
    'Individual': 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    'Org (Organization)': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    'Org (Department)': 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
    'Org (Employee)': 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400',
  };

  const handleExport = () => {
    if (!filtered.length) return;
    const exportData = filtered.map(r => toExportRecord(r, selectedYear));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'KPI Scorecard');
    XLSX.writeFile(wb, `KPI_Scorecard_${selectedMonth}_${selectedYear}.xlsx`);
  };

  /** Shared row → XLSX record mapping. Used by both single-month and range exports. */
  function toExportRecord(r: FlatRow, year: number) {
    return {
      'Company': getCompanyCode(r.employeeId),
      'Employee Code': r.employeeCode,
      'Name': r.employeeName,
      'Designation': r.designation,
      'Department': r.department,
      'Month': r.month,
      'Year': year,
      'Category': r.category,
      'KRA': r.kraName,
      'KPI': r.kpiName,
      'Frequency': r.frequency,
      'Type': getOrgTypeLabel(r),
      'Data Owner': r.dataOwnerNames || '',
      'Weightage': r.weightage,
      'Target': r.targetValue ?? '',
      'Self Actual': r.isNa ? 'N/A' : (r.selfActual ?? ''),
      'Manager Actual': r.isNa ? 'N/A' : (r.managerActual ?? ''),
      'Skip-Level Actual': r.isNa ? 'N/A' : (r.skipLevelActual ?? ''),
      'HR PMS Actual': r.isNa ? 'N/A' : (r.hrPmsActual ?? ''),
      'Auditor Actual': r.isNa ? 'N/A' : (r.auditorActual ?? ''),
      'Management Actual': r.isNa ? 'N/A' : (r.managementActual ?? ''),
      'Self Score': r.isNa ? 'N/A' : (r.selfScore ?? ''),
      'Manager Score': r.isNa ? 'N/A' : (r.managerScore ?? ''),
      'Skip-Level Score': r.isNa ? 'N/A' : (r.skipLevelScore ?? ''),
      'HR PMS Score': r.isNa ? 'N/A' : (r.hrPmsScore ?? ''),
      'Auditor Score': r.isNa ? 'N/A' : (r.auditorScore ?? ''),
      'Management Score': r.isNa ? 'N/A' : (r.managementScore ?? ''),
      'Final Score': r.isNa ? 'N/A' : (r.finalScore ?? ''),
      'Status': statusLabels[r.status] ?? r.status,
    };
  }

  const rangeValidation = useMemo(
    () => validateRange(
      { month: rangeFromMonth as any, year: rangeFromYear },
      { month: rangeToMonth as any, year: rangeToYear },
    ),
    [rangeFromMonth, rangeFromYear, rangeToMonth, rangeToYear],
  );

  const handleRangeExport = async () => {
    if (!rangeValidation.ok) return;
    const periods = enumeratePeriods(
      { month: rangeFromMonth as any, year: rangeFromYear },
      { month: rangeToMonth as any, year: rangeToYear },
    );
    setRangeExporting(true);
    try {
      const allRecords: ReturnType<typeof toExportRecord>[] = [];
      const search = searchTerm.toLowerCase();
      for (let i = 0; i < periods.length; i++) {
        const p = periods[i];
        toast({
          title: `Fetching ${p.month} ${p.year}`,
          description: `Period ${i + 1} of ${periods.length}`,
        });
        const periodRows = await fetchScorecardForPeriod(p.month, p.year);
        // Apply the same Company / Department / Search filters as the on-screen view
        const filteredPeriod = periodRows.filter(r => {
          if (!filterByCompany(r.employeeId)) return false;
          if (selectedDept !== 'all' && r.department !== selectedDept) return false;
          if (search) {
            if (
              !r.employeeName.toLowerCase().includes(search) &&
              !r.employeeCode.toLowerCase().includes(search) &&
              !r.kpiName.toLowerCase().includes(search) &&
              !r.kraName.toLowerCase().includes(search)
            ) return false;
          }
          return true;
        });
        filteredPeriod.forEach(r => allRecords.push(toExportRecord(r, p.year)));
      }

      if (allRecords.length === 0) {
        toast({
          title: 'No data in range',
          description: 'No KPI rows match the selected filters across the chosen months.',
          variant: 'destructive',
        });
        return;
      }

      const ws = XLSX.utils.json_to_sheet(allRecords);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'KPI Scorecard');
      const first = periods[0];
      const last = periods[periods.length - 1];
      XLSX.writeFile(wb, `KPI_Scorecard_${first.month}-${first.year}_to_${last.month}-${last.year}.xlsx`);

      toast({
        title: 'Export complete',
        description: `Exported ${allRecords.length.toLocaleString()} rows across ${periods.length} months.`,
      });
      setRangePopoverOpen(false);
    } catch (e: any) {
      toast({
        title: 'Range export failed',
        description: e?.message ?? 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setRangeExporting(false);
    }
  };

  const thClass = 'h-9 px-2 text-xs font-medium whitespace-nowrap cursor-pointer select-none hover:bg-muted/50 transition-colors';

  return (
    <div className="space-y-4">
      <PageHeader
        title="KPI Scorecard Detail"
        description="Flat table of all KPIs with employee details and scores across all review stages"
        backTo="/reports"
      />

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={selectedMonth} onValueChange={v => setSelectedMonth(v)}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(parseInt(v))}>
              <SelectTrigger className="w-[85px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>

            <Button
              size="sm"
              variant={isDirty ? 'default' : 'outline'}
              className="h-8 text-xs gap-1"
              onClick={handleLoadData}
              disabled={isFetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              {appliedQuery ? (isDirty ? 'Reload (filters changed)' : 'Reload Data') : 'Load Data'}
            </Button>

            <CompanyFilter
              companies={companies}
              selectedCompanyId={selectedCompanyId}
              onCompanyChange={v => { setSelectedCompanyId(v); setCurrentPage(1); }}
            />

            <Select value={selectedDept} onValueChange={v => { setSelectedDept(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue placeholder="All Departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>

            <div className="relative flex-1 min-w-[180px] max-w-[300px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search name, code, KPI..."
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                className="pl-7 h-8 text-xs"
              />
            </div>

            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {appliedQuery ? `${filtered.length} KPIs` : 'Not loaded'}
                {lastLoadedAt && appliedQuery && (
                  <span className="ml-2 text-[10px] opacity-70">
                    · loaded {lastLoadedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </span>
              {canExport && (
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={handleExport} disabled={!filtered.length}>
                  <Download className="h-3.5 w-3.5" /> Export
                </Button>
              )}
              {canExport && (
                <Popover open={rangePopoverOpen} onOpenChange={setRangePopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button size="sm" variant="outline" className="h-8 text-xs gap-1">
                      <Download className="h-3.5 w-3.5" /> Download Range
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[340px] p-4 space-y-3">
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium">Download month range</h4>
                      <p className="text-[11px] text-muted-foreground">
                        Applies current Company / Department / Search filters. Max {MAX_RANGE_MONTHS} months.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="grid grid-cols-[40px_1fr_1fr] items-center gap-2">
                        <span className="text-xs text-muted-foreground">From</span>
                        <Select value={rangeFromMonth} onValueChange={setRangeFromMonth}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={String(rangeFromYear)} onValueChange={v => setRangeFromYear(Number(v))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-[40px_1fr_1fr] items-center gap-2">
                        <span className="text-xs text-muted-foreground">To</span>
                        <Select value={rangeToMonth} onValueChange={setRangeToMonth}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={String(rangeToYear)} onValueChange={v => setRangeToYear(Number(v))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className={`text-[11px] ${rangeValidation.ok ? 'text-muted-foreground' : 'text-destructive'}`}>
                      {rangeValidation.ok
                        ? `Spans ${rangeValidation.count} month${rangeValidation.count === 1 ? '' : 's'}`
                        : rangeValidation.error}
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setRangePopoverOpen(false)} disabled={rangeExporting}>
                        Cancel
                      </Button>
                      <Button size="sm" className="h-8 text-xs gap-1" onClick={handleRangeExport} disabled={!rangeValidation.ok || rangeExporting}>
                        {rangeExporting
                          ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Exporting…</>
                          : <><Download className="h-3.5 w-3.5" /> Download .xlsx</>}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>
          {isDirty && appliedQuery && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-warning">
              <Info className="h-3 w-3" />
              Filters changed — click "Reload" to fetch updated data.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {!appliedQuery ? (
            <div className="p-12 text-center space-y-3">
              <RefreshCw className="h-10 w-10 mx-auto text-muted-foreground/50" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Select your filters and click "Load Data"</p>
                <p className="text-xs text-muted-foreground">
                  Data is loaded on demand to keep the page fast. Search, sort, and pagination will work on loaded data without refetching.
                </p>
              </div>
              <Button size="sm" onClick={handleLoadData} className="gap-1">
                <RefreshCw className="h-3.5 w-3.5" /> Load Data
              </Button>
            </div>
          ) : isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : isError ? (
            <div className="p-6">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Failed to load KPI data</AlertTitle>
                <AlertDescription className="text-xs mt-1">
                  {(error as Error)?.message || 'An unexpected error occurred while fetching KPIs.'}
                  {!hasOrgWideAccess && (
                    <div className="mt-2">
                      Your role ({effectiveRole ?? 'unknown'}) does not have org-wide access. Row-Level Security may be blocking this query. Contact an administrator to request a per-user access override.
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            </div>
          ) : rows && rows.length === 0 && !hasOrgWideAccess ? (
            <div className="p-6">
              <Alert>
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Limited visibility</AlertTitle>
                <AlertDescription className="text-xs mt-1">
                  This is an org-wide report. Your role ({effectiveRole ?? 'unknown'}) only has access to your direct reports, and none have KPIs for {appliedQuery?.month} {appliedQuery?.year}. Ask an administrator to grant a per-user override if you need full org access.
                </AlertDescription>
              </Alert>
            </div>
          ) : (
            <>
              <div className="overflow-auto max-h-[calc(100vh-300px)]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className={thClass} onClick={() => toggleSort('employeeCode')}>Code<SortIcon field="employeeCode" /></TableHead>
                      <TableHead className={thClass} onClick={() => toggleSort('employeeName')}>Name<SortIcon field="employeeName" /></TableHead>
                      <TableHead className={`${thClass} max-w-[200px]`} onClick={() => toggleSort('kpiName')}>KPI<SortIcon field="kpiName" /></TableHead>
                      <TableHead className={thClass} onClick={() => toggleSort('frequency')}>Freq<SortIcon field="frequency" /></TableHead>
                      <TableHead className={thClass} onClick={() => toggleSort('orgKpiScope')}>Type<SortIcon field="orgKpiScope" /></TableHead>
                      <TableHead className={thClass} onClick={() => toggleSort('dataOwnerNames')}>Data Owner<SortIcon field="dataOwnerNames" /></TableHead>
                      <TableHead className={`${thClass} text-right`} onClick={() => toggleSort('selfScore')}>Self<SortIcon field="selfScore" /></TableHead>
                      <TableHead className={`${thClass} text-right`} onClick={() => toggleSort('managerScore')}>Mgr<SortIcon field="managerScore" /></TableHead>
                      <TableHead className={`${thClass} text-right`} onClick={() => toggleSort('skipLevelScore')}>Skip<SortIcon field="skipLevelScore" /></TableHead>
                      <TableHead className={`${thClass} text-right`} onClick={() => toggleSort('hrPmsScore')}>HR<SortIcon field="hrPmsScore" /></TableHead>
                      <TableHead className={`${thClass} text-right`} onClick={() => toggleSort('auditorScore')}>Audit<SortIcon field="auditorScore" /></TableHead>
                      <TableHead className={`${thClass} text-right`} onClick={() => toggleSort('managementScore')}>Mgmt<SortIcon field="managementScore" /></TableHead>
                      <TableHead className={`${thClass} text-right`} onClick={() => toggleSort('finalScore')}>Final<SortIcon field="finalScore" /></TableHead>
                      <TableHead className={thClass} onClick={() => toggleSort('status')}>Status<SortIcon field="status" /></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={14} className="text-center text-muted-foreground py-8">
                          {rows && rows.length > 0
                            ? `No KPIs match the current Company / Department / Search filters (${rows.length} loaded for ${appliedQuery?.month} ${appliedQuery?.year}).`
                            : `No KPI rows exist for ${appliedQuery?.month} ${appliedQuery?.year}.`}
                        </TableCell>
                      </TableRow>
                    ) : paged.map((r, i) => {
                      const typeLabel = getOrgTypeLabel(r);
                      return (
                        <TableRow key={i} className="hover:bg-muted/30">
                          <TableCell className="text-xs py-1.5 px-2 whitespace-nowrap">{r.employeeCode || '—'}</TableCell>
                          <TableCell className="text-xs py-1.5 px-2 whitespace-nowrap font-medium">{r.employeeName || '—'}</TableCell>
                          <TableCell className="text-xs py-1.5 px-2 max-w-[200px] truncate" title={r.kpiName}>{r.kpiName || '—'}</TableCell>
                          <TableCell className="text-xs py-1.5 px-2 whitespace-nowrap">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-0 bg-muted/50">{r.frequency}</Badge>
                          </TableCell>
                          <TableCell className="text-xs py-1.5 px-2 whitespace-nowrap">
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border-0 ${orgTypeColors[typeLabel] ?? ''}`}>{typeLabel}</Badge>
                          </TableCell>
                          <TableCell className="text-xs py-1.5 px-2 max-w-[120px] truncate" title={r.dataOwnerNames}>{r.dataOwnerNames || '—'}</TableCell>
                          <TableCell className="text-xs py-1.5 px-2 text-right"><ScoreCell score={r.selfScore} isNa={r.isNa} /></TableCell>
                          <TableCell className="text-xs py-1.5 px-2 text-right"><ScoreCell score={r.managerScore} isNa={r.isNa} /></TableCell>
                          <TableCell className="text-xs py-1.5 px-2 text-right"><ScoreCell score={r.skipLevelScore} isNa={r.isNa} /></TableCell>
                          <TableCell className="text-xs py-1.5 px-2 text-right"><ScoreCell score={r.hrPmsScore} isNa={r.isNa} /></TableCell>
                          <TableCell className="text-xs py-1.5 px-2 text-right"><ScoreCell score={r.auditorScore} isNa={r.isNa} /></TableCell>
                          <TableCell className="text-xs py-1.5 px-2 text-right"><ScoreCell score={r.managementScore} isNa={r.isNa} /></TableCell>
                          <TableCell className="text-xs py-1.5 px-2 text-right font-semibold"><ScoreCell score={r.finalScore} isNa={r.isNa} /></TableCell>
                          <TableCell className="text-xs py-1.5 px-2">
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border-0 ${statusColors[r.status] ?? ''}`}>
                              {statusLabels[r.status] ?? r.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-2 border-t">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Rows per page:</span>
                  <Select value={String(pageSize)} onValueChange={v => { setPageSize(parseInt(v)); setCurrentPage(1); }}>
                    <SelectTrigger className="w-[70px] h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZES.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}
                  </span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>
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
