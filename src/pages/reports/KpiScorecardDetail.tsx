import { useState, useMemo } from 'react';
import { useReportAccess } from '@/hooks/useReportAccess';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { CompanyFilter } from '@/components/reports/CompanyFilter';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Search, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import * as XLSX from 'xlsx';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const PAGE_SIZES = [50, 100, 200, 500];

interface FlatRow {
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

export default function KpiScorecardDetail() {
  const { canDownload } = useReportAccess();
  const canExport = canDownload('kpi-scorecard-detail');
  const { companies, selectedCompanyId, setSelectedCompanyId, filterByCompany, getCompanyName } = useCompanyFilter();
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[now.getMonth()]);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedDept, setSelectedDept] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [sortField, setSortField] = useState<SortField>('employeeName');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const years = [selectedYear - 1, selectedYear, selectedYear + 1];

  // Batch-fetch all KPIs for the month (no row limit)
  const { data: rows, isLoading } = useQuery({
    queryKey: ['kpi-scorecard-detail', selectedMonth, selectedYear],
    queryFn: async () => {
      const allKpis: any[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('kpis')
          .select(`
            id, employee_id, kra_name, kpi_name, weightage, review_period, review_year, status,
            frequency, is_org_level, org_level_scope, category_id,
            kra_categories ( name ),
            review_submissions ( self_score, manager_score, skip_level_score, hr_pms_score, auditor_score, management_score, final_score, is_na )
          `)
          .eq('review_period', selectedMonth)
          .eq('review_year', selectedYear)
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

      // Fetch profiles with department + designation
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, employee_code, full_name, designation, departments ( name )');
      if (pErr) throw pErr;

      // Fetch org KPI data owners (use explicit FK to avoid ambiguity)
      let ownerMap = new Map<string, string[]>();
      try {
        const { data: dataOwners } = await supabase
          .from('org_kpi_data_owners')
          .select('category_id, kra_name, kpi_name, owner:profiles!org_kpi_data_owners_owner_id_fkey(full_name)');
        (dataOwners ?? []).forEach((o: any) => {
          const key = `${o.category_id}||${o.kra_name}||${o.kpi_name}`;
          const name = o.owner?.full_name ?? '';
          if (!ownerMap.has(key)) ownerMap.set(key, []);
          if (name) ownerMap.get(key)!.push(name);
        });
      } catch { /* non-critical */ }
      if (doErr) throw doErr;

      // Build data owner lookup: categoryId||kraName||kpiName -> owner names[]
      const ownerMap = new Map<string, string[]>();
      (dataOwners ?? []).forEach((o: any) => {
        const key = `${o.category_id}||${o.kra_name}||${o.kpi_name}`;
        const name = o.profiles?.full_name ?? '';
        if (!ownerMap.has(key)) ownerMap.set(key, []);
        if (name) ownerMap.get(key)!.push(name);
      });

      const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));

      return allKpis.map((kpi): FlatRow => {
        const profile = profileMap.get(kpi.employee_id);
        const sub = Array.isArray(kpi.review_submissions) ? kpi.review_submissions[0] : kpi.review_submissions;
        const isNa = sub?.is_na ?? false;
        const dept = profile?.departments;
        const isOrgKpi = kpi.is_org_level === true;
        const ownerKey = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}`;
        const owners = isOrgKpi ? (ownerMap.get(ownerKey) ?? []) : [];
        return {
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
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  // Departments for filter
  const departments = useMemo(() => {
    if (!rows) return [];
    return [...new Set(rows.map(r => r.department).filter(Boolean))].sort();
  }, [rows]);

  // Filter + sort
  const filtered = useMemo(() => {
    if (!rows) return [];
    let result = rows;
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
  }, [rows, selectedDept, searchTerm, sortField, sortDir]);

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
    const exportData = filtered.map(r => ({
      'Employee Code': r.employeeCode,
      'Name': r.employeeName,
      'Designation': r.designation,
      'Department': r.department,
      'Month': r.month,
      'Category': r.category,
      'KRA': r.kraName,
      'KPI': r.kpiName,
      'Frequency': r.frequency,
      'Type': getOrgTypeLabel(r),
      'Data Owner': r.dataOwnerNames || '',
      'Weightage': r.weightage,
      'Self': r.isNa ? 'N/A' : (r.selfScore ?? ''),
      'Manager': r.isNa ? 'N/A' : (r.managerScore ?? ''),
      'Skip-Level': r.isNa ? 'N/A' : (r.skipLevelScore ?? ''),
      'HR PMS': r.isNa ? 'N/A' : (r.hrPmsScore ?? ''),
      'Auditor': r.isNa ? 'N/A' : (r.auditorScore ?? ''),
      'Management': r.isNa ? 'N/A' : (r.managementScore ?? ''),
      'Final Score': r.isNa ? 'N/A' : (r.finalScore ?? ''),
      'Status': statusLabels[r.status] ?? r.status,
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'KPI Scorecard');
    XLSX.writeFile(wb, `KPI_Scorecard_${selectedMonth}_${selectedYear}.xlsx`);
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
            <Select value={selectedMonth} onValueChange={v => { setSelectedMonth(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={String(selectedYear)} onValueChange={v => { setSelectedYear(parseInt(v)); setCurrentPage(1); }}>
              <SelectTrigger className="w-[85px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>

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
              <span className="text-xs text-muted-foreground">{filtered.length} KPIs</span>
              {canExport && (
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={handleExport} disabled={!filtered.length}>
                  <Download className="h-3.5 w-3.5" /> Export
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : (
            <>
              <div className="overflow-auto max-h-[calc(100vh-300px)]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className={thClass} onClick={() => toggleSort('employeeCode')}>Code<SortIcon field="employeeCode" /></TableHead>
                      <TableHead className={thClass} onClick={() => toggleSort('employeeName')}>Name<SortIcon field="employeeName" /></TableHead>
                      <TableHead className={thClass} onClick={() => toggleSort('designation')}>Designation<SortIcon field="designation" /></TableHead>
                      <TableHead className={thClass} onClick={() => toggleSort('department')}>Department<SortIcon field="department" /></TableHead>
                      <TableHead className={thClass} onClick={() => toggleSort('category')}>Category<SortIcon field="category" /></TableHead>
                      <TableHead className={thClass} onClick={() => toggleSort('kraName')}>KRA<SortIcon field="kraName" /></TableHead>
                      <TableHead className={`${thClass} max-w-[200px]`} onClick={() => toggleSort('kpiName')}>KPI<SortIcon field="kpiName" /></TableHead>
                      <TableHead className={thClass} onClick={() => toggleSort('frequency')}>Freq<SortIcon field="frequency" /></TableHead>
                      <TableHead className={thClass} onClick={() => toggleSort('orgKpiScope')}>Type<SortIcon field="orgKpiScope" /></TableHead>
                      <TableHead className={thClass} onClick={() => toggleSort('dataOwnerNames')}>Data Owner<SortIcon field="dataOwnerNames" /></TableHead>
                      <TableHead className={`${thClass} text-right`} onClick={() => toggleSort('weightage')}>Wt%<SortIcon field="weightage" /></TableHead>
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
                        <TableCell colSpan={19} className="text-center text-muted-foreground py-8">No KPIs found for the selected filters</TableCell>
                      </TableRow>
                    ) : paged.map((r, i) => {
                      const typeLabel = getOrgTypeLabel(r);
                      return (
                        <TableRow key={i} className="hover:bg-muted/30">
                          <TableCell className="text-xs py-1.5 px-2 whitespace-nowrap">{r.employeeCode || '—'}</TableCell>
                          <TableCell className="text-xs py-1.5 px-2 whitespace-nowrap font-medium">{r.employeeName || '—'}</TableCell>
                          <TableCell className="text-xs py-1.5 px-2 whitespace-nowrap">{r.designation || '—'}</TableCell>
                          <TableCell className="text-xs py-1.5 px-2 whitespace-nowrap">{r.department || '—'}</TableCell>
                          <TableCell className="text-xs py-1.5 px-2 whitespace-nowrap">{r.category || '—'}</TableCell>
                          <TableCell className="text-xs py-1.5 px-2 max-w-[150px] truncate" title={r.kraName}>{r.kraName || '—'}</TableCell>
                          <TableCell className="text-xs py-1.5 px-2 max-w-[200px] truncate" title={r.kpiName}>{r.kpiName || '—'}</TableCell>
                          <TableCell className="text-xs py-1.5 px-2 whitespace-nowrap">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-0 bg-muted/50">{r.frequency}</Badge>
                          </TableCell>
                          <TableCell className="text-xs py-1.5 px-2 whitespace-nowrap">
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border-0 ${orgTypeColors[typeLabel] ?? ''}`}>{typeLabel}</Badge>
                          </TableCell>
                          <TableCell className="text-xs py-1.5 px-2 max-w-[120px] truncate" title={r.dataOwnerNames}>{r.dataOwnerNames || '—'}</TableCell>
                          <TableCell className="text-xs py-1.5 px-2 text-right tabular-nums">{r.weightage}%</TableCell>
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
